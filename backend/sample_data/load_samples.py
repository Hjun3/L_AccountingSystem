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
from main import DecisionIn, create_term_with_periods, decide_expense, recheck_expense  # noqa: E402

DEMO_YEAR = 2026  # 시연용 가상 데이터의 연도

demo = json.loads((SAMPLE_DIR / "demo_data.json").read_text(encoding="utf-8"))

# 0. 예전 샘플 정리: 예전 버전 샘플에 있던 '학생회장 활동비'를 정확히 같은 줄만 지운다 (직접 입력한 데이터는 건드리지 않음)
with get_conn() as conn:
    removed = conn.execute(
        "DELETE FROM budgets WHERE event_name = '학생회장 활동비' AND category = '활동비' AND amount = 600000"
    ).rowcount
    old = conn.execute(
        "SELECT id FROM expenses WHERE deleted_at IS NULL AND date = '2026-06-10' AND amount = 300000 AND event_name = '학생회장 활동비' "
        "AND description = '학생회장 활동비 6월분, 활동비 통장으로 이체, 사필영수증 및 통장내역 첨부'"
    ).fetchall()
    for r in old:  # 지출은 다른 삭제처럼 '삭제 표시'만 하고 기록을 남긴다
        conn.execute("UPDATE expenses SET deleted_at = ? WHERE id = ?", (now_text(), r["id"]))
        conn.execute(
            "INSERT INTO change_logs (expense_id, action, detail, created_at, actor) VALUES (?, '지출 삭제', ?, ?, '시스템')",
            (r["id"], "예전 시연 샘플 정리 (학생회장 활동비 예시 교체)", now_text()),
        )
    # 예전 샘플 통장 거래 13건: 새 샘플과 잔액이 달라 '다른 거래'로 보이므로, 값이 정확히 같은 것만 지운다 (중복 방지)
    OLD_BANK = [("2026-03-02T10:00:00", 1500000, 3500000), ("2026-03-04T13:20:11", 48000, 3452000), ("2026-03-04T18:05:42", 320000, 3132000),
                ("2026-03-21T15:00:00", 1800000, 1332000), ("2026-03-22T21:10:03", 150000, 1182000), ("2026-04-15T19:30:27", 210000, 972000),
                ("2026-04-16T01:12:55", 23000, 949000), ("2026-04-16T09:40:00", 23000, 972000), ("2026-04-20T12:00:00", 15600, 956400),
                ("2026-05-15T14:32:00", 80000, 876400), ("2026-05-20T11:00:00", 60000, 816400), ("2026-06-03T16:45:10", 75000, 741400),
                ("2026-06-21T00:00:01", 312, 741712)]
    # 예전 샘플 일정 'MT (1박 2일)'(하루짜리)은 새 샘플의 'MT'(3/21~22, 여러 날)로 바뀌었다
    old_schedule = conn.execute("DELETE FROM schedules WHERE date = '2026-03-21' AND title = 'MT (1박 2일)' AND end_date IS NULL").rowcount
    old_bank = sum(conn.execute("DELETE FROM bank_transactions WHERE datetime = ? AND amount = ? AND balance = ?", row).rowcount for row in OLD_BANK)
if removed or old or old_bank or old_schedule:
    print(f"[예전 샘플 정리] 학생회장 활동비 예산 {removed}줄·지출 {len(old)}건, 예전 통장 거래 {old_bank}건, 예전 일정 {old_schedule}건 정리")

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
CONFIRM_BEFORE = "2026-10-01"
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
        # 쓰던 장부처럼 보이게: 10월 이전 지출 중 AI가 '문제 없음'으로 본 것은 확정해 둔다 (점검 결과는 실제 AI 결과 그대로)
        if saved["ai_status"] == "적합" and item["date"] < CONFIRM_BEFORE:
            decide_expense(saved["id"], DecisionIn(final_status="확정"))
    except HTTPException as e:
        print(f"[지출 실패] {item['description']} - {e.detail}")
