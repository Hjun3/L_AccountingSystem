import base64
import json
import os
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv(Path(__file__).parent / ".env")  # backend/.env 에서 API 키를 읽어옴

REGULATION_PATH = Path(__file__).parent / "regulations" / "default.txt"
MODEL = os.getenv("OPENAI_MODEL", "gpt-5.4-mini")
VALID_STATUSES = {"적합", "주의", "위반"}

SYSTEM_PROMPT = """너는 학생회 총무와 함께 일하는 회계 담당 동료다.
아래 [회계 규정]만을 근거로, 총무가 등록한 지출에서 더 챙겨야 할 것이 있는지 알려 줘라.

판단 기준:
- 적합: 규정상 문제가 없다.
- 주의: 명백한 위반은 아니지만 정보나 서류가 부족해 확인이 필요하다.
- 위반: 규정의 특정 조항을 명백히 어긴다.

작성 방법:
- reason: 동료에게 말하듯 "~해요" 말투로 한두 문장.
- clause: 가장 직접적인 근거 조항 1~2개만 (예: 총학생회칙 제78조, 관행 제3항 ③). 해당 없으면 "해당 없음".
- todos: 총무가 바로 할 수 있는 일을 짧은 문장으로 최대 3개 (예: "수령인 학생증 사본 받기"). 할 일이 없으면 빈 목록.

반드시 아래 JSON 형식만 출력하라. 다른 말은 쓰지 마라.
{"status": "적합|주의|위반", "clause": "근거 조항", "reason": "판단 이유", "todos": ["할 일", ...]}

[회계 규정]
"""


def log_usage(kind: str, response) -> None:
    """OpenAI 호출 1번에 쓴 토큰 수를 서버 화면(터미널)에 출력하고, DB(ai_usage)에도 남긴다. 비용 확인용.
    'AI 사용량' 화면에서 이번 달 사용 횟수·토큰을 보고, 기준 횟수를 넘으면 경고를 띄운다."""
    u = response.usage
    if u is None:
        return
    cached = getattr(u.prompt_tokens_details, "cached_tokens", 0) if u.prompt_tokens_details else 0
    print(f"[토큰] {kind}: 입력 {u.prompt_tokens} (캐시 {cached}) + 출력 {u.completion_tokens} = {u.total_tokens}")
    from auth import current_user  # 누가 불렀는지 (스크립트에서 부르면 '시스템')
    from db import get_conn, now_text
    user = current_user.get()
    try:
        with get_conn() as conn:
            conn.execute(
                "INSERT INTO ai_usage (created_at, kind, prompt_tokens, completion_tokens, total_tokens, username) VALUES (?, ?, ?, ?, ?, ?)",
                (now_text(), kind, u.prompt_tokens, u.completion_tokens, u.total_tokens, user["username"] if user else "시스템"),
            )
    except Exception as e:  # 사용량 기록이 실패해도 점검 결과는 그대로 쓴다
        print(f"[토큰] 사용량 저장 실패: {e}")


class AICheckError(Exception):
    """AI 점검에 실패했을 때 사용하는 에러 (호출 실패, JSON 파싱 실패 등)"""


def check_expense(expense: dict) -> dict:
    # 규정 파일을 매번 읽으므로, 파일만 바꾸면 서버 재시작 없이 새 규정이 적용됨
    regulation = REGULATION_PATH.read_text(encoding="utf-8")

    expense_text = (
        f"지출 날짜: {expense['date']}\n"
        f"금액: {expense['amount']}원\n"
        f"사업명: {expense['event_name']}\n"
        f"지출 항목: {expense['category']}\n"
        f"지출 내용: {expense['description']}\n"
        f"증빙 유무: {'있음' if expense['has_receipt'] else '없음'}"
    )

    if not os.getenv("OPENAI_API_KEY"):
        raise AICheckError("OPENAI_API_KEY가 없습니다. backend/.env 파일을 확인하세요.")

    try:
        client = OpenAI()
        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT + regulation},
                {"role": "user", "content": expense_text},
            ],
            response_format={"type": "json_object"},  # JSON으로만 답하도록 강제
        )
    except Exception as e:
        raise AICheckError(f"OpenAI 호출 실패: {e}")

    log_usage("지출 점검", response)
    return parse_result(response.choices[0].message.content)


def parse_result(text: str) -> dict:
    """LLM 응답을 JSON으로 읽고, 형식이 맞는지 확인한다."""
    try:
        data = json.loads(text)
    except (json.JSONDecodeError, TypeError):
        raise AICheckError(f"AI 응답을 JSON으로 읽을 수 없습니다: {text}")

    if not isinstance(data, dict) or data.get("status") not in VALID_STATUSES:
        raise AICheckError(f"AI 응답의 status가 올바르지 않습니다: {text}")

    todos = data.get("todos")
    if not isinstance(todos, list):
        todos = []
    return {
        "status": data["status"],
        "clause": str(data.get("clause", "")),
        "reason": str(data.get("reason", "")),
        # 챙길 것: 빈 값은 빼고 최대 3개만
        "todos": [str(t).strip() for t in todos if str(t).strip()][:3],
    }


RECEIPT_PROMPT = """너는 영수증 사진에서 지출 정보를 읽어 내는 도우미다.
사진에 보이는 내용만 읽고, 보이지 않는 값은 추측하지 마라.

반드시 아래 JSON 형식만 출력하라. 다른 말은 쓰지 마라.
{"is_receipt": true 또는 false, "date": "YYYY-MM-DD (안 보이면 빈 문자열)", "amount": 합계 금액 정수 (안 보이면 null), "store": "상호명 (안 보이면 빈 문자열)", "items": "구매 품목과 수량 요약 (예: 생수 100개, 이온음료 30개)", "event_name": "사업명 추천", "category": "지출 항목(비목) 추천"}
영수증이 아닌 사진이면 is_receipt를 false로 하라.
event_name과 category는 사용자 메시지에 주어진 목록 안에서만 하나씩 고른다. 품목과 날짜로 판단이 어려우면 빈 문자열로 둔다."""

# 지출 항목(비목) 목록: 영수증 읽기에서 추천할 때 쓴다 (화면 frontend/src/common.js의 CATEGORIES와 같게 유지)
CATEGORIES = ["수용비", "급량비", "상품비", "대여비", "환급비", "보조비", "교통비", "기타"]

# OpenAI가 읽을 수 있는 이미지 형식
RECEIPT_MIME_TYPES = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}


def read_receipt(image_bytes: bytes, ext: str, event_names: list[str] | None = None) -> dict:
    """영수증 사진을 OpenAI에 보내 날짜, 금액, 상호, 품목을 읽어 온다. (값은 총무가 확인 후 저장)
    event_names(예산에 등록된 사업명)를 주면 사업명과 지출 항목도 목록 안에서 추천받는다. 호출은 그대로 1번."""
    event_names = event_names or []
    if not os.getenv("OPENAI_API_KEY"):
        raise AICheckError("OPENAI_API_KEY가 없습니다. backend/.env 파일을 확인하세요.")

    # 사진을 글자(base64)로 바꿔서 메시지에 함께 보낸다
    data_url = f"data:{RECEIPT_MIME_TYPES[ext]};base64," + base64.b64encode(image_bytes).decode()
    try:
        response = OpenAI().chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": RECEIPT_PROMPT},
                {"role": "user", "content": [
                    {"type": "text", "text": f"사업명 목록: {', '.join(event_names) or '(없음)'}\n지출 항목 목록: {', '.join(CATEGORIES)}"},
                    {"type": "image_url", "image_url": {"url": data_url}},
                ]},
            ],
            response_format={"type": "json_object"},
        )
    except Exception as e:
        raise AICheckError(f"OpenAI 호출 실패: {e}")

    log_usage("영수증 읽기", response)
    text = response.choices[0].message.content
    try:
        data = json.loads(text)
    except (json.JSONDecodeError, TypeError):
        raise AICheckError(f"AI 응답을 JSON으로 읽을 수 없습니다: {text}")
    if not data.get("is_receipt"):
        raise AICheckError("영수증으로 보이지 않는 사진입니다. 영수증이 잘 보이게 다시 찍어 주세요.")

    amount = data.get("amount")
    return {
        "date": str(data.get("date") or ""),
        "amount": amount if isinstance(amount, int) else None,
        "store": str(data.get("store") or ""),
        "items": str(data.get("items") or ""),
        # 추천은 목록에 있는 값만 쓴다 (목록 밖의 이름을 지어내면 버림)
        "event_name": data.get("event_name") if data.get("event_name") in event_names else "",
        "category": data.get("category") if data.get("category") in CATEGORIES else "",
    }
