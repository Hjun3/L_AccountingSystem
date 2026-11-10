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

SYSTEM_PROMPT = """너는 학생회 회계 감사를 돕는 점검 담당자다.
아래 [회계 규정]만을 근거로, 주어진 지출이 감사에서 문제될 수 있는지 점검하라.

판단 기준:
- 적합: 규정상 문제가 없다.
- 주의: 명백한 위반은 아니지만 정보가 부족하거나 감사에서 소명이 필요할 수 있다.
- 위반: 규정의 특정 조항을 명백히 어긴다.

반드시 아래 JSON 형식만 출력하라. 다른 말은 쓰지 마라.
{"status": "적합|주의|위반", "clause": "근거 조항 (예: 총학생회칙 제78조, 관행 제3항 ③, 해당 없으면 \\"해당 없음\\")", "reason": "판단 이유 한두 문장"}

[회계 규정]
"""


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

    return parse_result(response.choices[0].message.content)


def parse_result(text: str) -> dict:
    """LLM 응답을 JSON으로 읽고, 형식이 맞는지 확인한다."""
    try:
        data = json.loads(text)
    except (json.JSONDecodeError, TypeError):
        raise AICheckError(f"AI 응답을 JSON으로 읽을 수 없습니다: {text}")

    if not isinstance(data, dict) or data.get("status") not in VALID_STATUSES:
        raise AICheckError(f"AI 응답의 status가 올바르지 않습니다: {text}")

    return {
        "status": data["status"],
        "clause": str(data.get("clause", "")),
        "reason": str(data.get("reason", "")),
    }


RECEIPT_PROMPT = """너는 영수증 사진에서 지출 정보를 읽어 내는 도우미다.
사진에 보이는 내용만 읽고, 보이지 않는 값은 추측하지 마라.

반드시 아래 JSON 형식만 출력하라. 다른 말은 쓰지 마라.
{"is_receipt": true 또는 false, "date": "YYYY-MM-DD (안 보이면 빈 문자열)", "amount": 합계 금액 정수 (안 보이면 null), "store": "상호명 (안 보이면 빈 문자열)", "items": "구매 품목과 수량 요약 (예: 생수 100개, 이온음료 30개)"}
영수증이 아닌 사진이면 is_receipt를 false로 하라."""

# OpenAI가 읽을 수 있는 이미지 형식
RECEIPT_MIME_TYPES = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}


def read_receipt(image_bytes: bytes, ext: str) -> dict:
    """영수증 사진을 OpenAI에 보내 날짜, 금액, 상호, 품목을 읽어 온다. (값은 총무가 확인 후 저장)"""
    if not os.getenv("OPENAI_API_KEY"):
        raise AICheckError("OPENAI_API_KEY가 없습니다. backend/.env 파일을 확인하세요.")

    # 사진을 글자(base64)로 바꿔서 메시지에 함께 보낸다
    data_url = f"data:{RECEIPT_MIME_TYPES[ext]};base64," + base64.b64encode(image_bytes).decode()
    try:
        response = OpenAI().chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": RECEIPT_PROMPT},
                {"role": "user", "content": [{"type": "image_url", "image_url": {"url": data_url}}]},
            ],
            response_format={"type": "json_object"},
        )
    except Exception as e:
        raise AICheckError(f"OpenAI 호출 실패: {e}")

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
    }
