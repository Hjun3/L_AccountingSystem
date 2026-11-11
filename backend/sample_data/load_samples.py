"""시연용 가상 데이터를 DB에 한 번에 넣는 스크립트.

넣는 것:
  1. 예산 (demo_data.json, 학기 전/1학기/여름방학/2학기)
  2. 일정 (demo_data.json)
  3. 통장 거래내역 (kakaobank_sample.xlsx, 가상)
  4. 지출 (expenses.json) - 실제 앱과 똑같이 AI 점검(OpenAI 호출)을 거친 뒤 저장된다. (점검 결과를 미리 정해두지 않음)

이미 들어간 데이터는 건너뛰므로 여러 번 실행해도 중복 저장·중복 AI 호출이 없다.

실행 (backend 폴더에서):
  python sample_data/load_samples.py           전부 넣기 (지출 10건 AI 점검 = 토큰 사용)
  python sample_data/load_samples.py --no-ai   지출은 빼고 예산·일정·거래내역만 넣기 (토큰 0)
"""
import json
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).parent.parent
SAMPLE_DIR = Path(__file__).parent
sys.path.insert(0, str(BACKEND_DIR))  # backend 폴더의 main.py를 불러올 수 있게 함

from fastapi import HTTPException  # noqa: E402

from bank_import import parse_transactions  # noqa: E402
from main import DEFAULT_ORG_ID, ExpenseIn, create_expense, ensure_term, get_conn, now_text, save_bank_transactions  # noqa: E402
from main import create_term_with_periods, recheck_expense  # noqa: E402

DEMO_YEAR = 2026  # 시연용 가상 데이터의 연도

demo = json.loads((SAMPLE_DIR / "demo_data.json").read_text(encoding="utf-8"))

# 1. 예산
with get_conn() as conn:
    # 2026년 임기가 없으면 만들고, 그 임기의 기간(학기 전/1학기/여름방학/2학기)에 예산을 넣는다
    if not conn.execute("SELECT 1 FROM terms WHERE year = ?", (DEMO_YEAR,)).fetchone():
        create_term_with_periods(conn, DEMO_YEAR)
    term_id = ensure_term(conn, DEMO_YEAR)
    period_ids = {r["name"]: r["id"] for r in conn.execute("SELECT id, name FROM periods WHERE term_id = ?", (term_id,))}
    added = 0
    for b in demo["budgets"]:
        period_id = period_ids[b["period"]]
        exists = conn.execute(
            "SELECT 1 FROM budgets WHERE period_id = ? AND event_name = ? AND category = ?",
            (period_id, b["event_name"], b["category"]),
        ).fetchone()
        if not exists:
            conn.execute(
                "INSERT INTO budgets (org_id, period_id, event_name, category, amount, memo, created_at) VALUES (?, ?, ?, ?, ?, '', ?)",
                (DEFAULT_ORG_ID, period_id, b["event_name"], b["category"], b["amount"], now_text()),
            )
            added += 1
print(f"[예산] {added}줄 추가 (이미 있는 줄은 건너뜀)")

# 2. 일정
with get_conn() as conn:
    added = 0
    for s in demo["schedules"]:
        if not conn.execute("SELECT 1 FROM schedules WHERE date = ? AND title = ?", (s["date"], s["title"])).fetchone():
            conn.execute(
                "INSERT INTO schedules (org_id, date, end_date, kind, title, memo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (DEFAULT_ORG_ID, s["date"], s.get("end_date"), s["kind"], s["title"], s.get("memo", ""), now_text()),
            )
            added += 1
print(f"[일정] {added}건 추가")

# 3. 통장 거래내역
transactions = parse_transactions((SAMPLE_DIR / "kakaobank_sample.xlsx").read_bytes())
print(f"[거래내역] {save_bank_transactions(transactions)}건 추가")

# 4. 지출 (AI 점검)
if "--no-ai" in sys.argv:
    print("[지출] --no-ai: 건너뜀")
    sys.exit()

samples = json.loads((SAMPLE_DIR / "expenses.json").read_text(encoding="utf-8"))
for item in samples:
    # 이미 들어간 샘플(날짜·금액·내용이 같음)은 건너뛴다. 다시 실행해도 AI 호출(토큰)이 낭비되지 않게.
    with get_conn() as conn:
        exists = conn.execute(
            "SELECT id, ai_status FROM expenses WHERE deleted_at IS NULL AND date = ? AND amount = ? AND description = ?",
            (item["date"], item["amount"], item["description"]),
        ).fetchone()
    if exists and exists["ai_status"] == "미점검":
        # 지난번에 AI 점검을 못 한 샘플(예: API 키가 없었음)은 이번에 한 번 더 점검한다
        saved = recheck_expense(exists["id"])
        print(f"[지출 다시 점검 {saved['ai_status']}] {item['description']}")
        continue
    if exists:
        print(f"[지출 건너뜀] {item['description']} - 이미 등록됨")
        continue
    try:
        saved = create_expense(ExpenseIn(**item))
        print(f"[지출 {saved['ai_status']}] {item['description']} - {saved['ai_clause']}")
    except HTTPException as e:
        print(f"[지출 실패] {item['description']} - {e.detail}")
