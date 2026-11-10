import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Literal

import json
import uuid

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from report import build_settlement
from bank_import import BankImportError, parse_transactions
from ai_check import RECEIPT_MIME_TYPES, REGULATION_PATH, AICheckError, check_expense, read_receipt

DB_PATH = Path(__file__).parent / "expenses.db"
UPLOAD_DIR = Path(__file__).parent / "uploads"  # 첨부파일 저장 폴더 (GitHub에 올리지 않음)
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".heic", ".webp", ".pdf"}
MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10MB
DEFAULT_ORG_ID = "default"  # 지금은 조직이 하나뿐이라 기본값 사용

app = FastAPI()

# React 개발 서버(5173 포트)에서 이 API를 호출할 수 있도록 허용
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row  # 결과를 딕셔너리처럼 꺼낼 수 있게 함
    return conn


def init_db():
    with get_conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS expenses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                org_id TEXT NOT NULL,
                date TEXT NOT NULL,
                amount INTEGER NOT NULL,
                event_name TEXT NOT NULL,
                category TEXT NOT NULL,
                description TEXT NOT NULL,
                has_receipt INTEGER NOT NULL,
                ai_status TEXT,
                ai_clause TEXT,
                ai_reason TEXT,
                final_status TEXT NOT NULL DEFAULT '대기',
                explanation TEXT,
                created_at TEXT NOT NULL
            )
            """
        )
        # 기존 DB에는 memo 칸이 없으므로, 없으면 추가한다
        columns = [c["name"] for c in conn.execute("PRAGMA table_info(expenses)")]
        if "memo" not in columns:
            conn.execute("ALTER TABLE expenses ADD COLUMN memo TEXT")
        # AI가 알려 준 "챙길 것" 목록: [{"text": "...", "done": false}, ...] 을 JSON 글자로 저장
        if "ai_todos" not in columns:
            conn.execute("ALTER TABLE expenses ADD COLUMN ai_todos TEXT")
        # 지출에 붙인 증빙 파일 (영수증 사진 등). 실제 파일은 uploads 폴더에 저장한다
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS attachments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                expense_id INTEGER NOT NULL,
                file_name TEXT NOT NULL,
                stored_name TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        # 예산: 사업(event_name) x 비목(category)별 예산액. 지출은 같은 사업명·비목끼리 합산해 비교한다
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS budgets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                org_id TEXT NOT NULL,
                event_name TEXT NOT NULL,
                category TEXT NOT NULL,
                amount INTEGER NOT NULL,
                memo TEXT,
                created_at TEXT NOT NULL
            )
            """
        )
        # 통장 거래내역: 불러온 엑셀의 거래를 저장해 잔액·입출금 현황에 쓴다. 같은 거래는 한 번만 저장한다.
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS bank_transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                org_id TEXT NOT NULL,
                datetime TEXT NOT NULL,
                direction TEXT NOT NULL,
                amount INTEGER NOT NULL,
                balance INTEGER,
                content TEXT,
                imported_at TEXT NOT NULL,
                UNIQUE (org_id, datetime, direction, amount, balance)
            )
            """
        )
        # 캘린더 일정: 사업 일정, 감사 일정 등 (지출과 별개로 총무가 직접 등록)
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS schedules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                org_id TEXT NOT NULL,
                date TEXT NOT NULL,
                kind TEXT NOT NULL,
                title TEXT NOT NULL,
                memo TEXT,
                created_at TEXT NOT NULL
            )
            """
        )
        # 총무 결정 이력: 확정/소명/취소를 누를 때마다 한 줄씩 쌓인다 (지우거나 고치지 않음)
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS decision_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                expense_id INTEGER NOT NULL,
                from_status TEXT NOT NULL,
                to_status TEXT NOT NULL,
                explanation TEXT,
                created_at TEXT NOT NULL
            )
            """
        )


init_db()


class ExpenseIn(BaseModel):
    """총무가 입력하는 값 (나머지 칸은 서버가 채움)"""
    date: str
    amount: int
    event_name: str
    category: str
    description: str
    has_receipt: bool


@app.post("/expenses")
def create_expense(expense: ExpenseIn):
    # 저장 전에 AI 점검을 먼저 한다. 실패하면 저장하지 않고 에러를 돌려준다.
    try:
        result = check_expense(expense.model_dump())
    except AICheckError as e:
        raise HTTPException(status_code=502, detail=str(e))

    with get_conn() as conn:
        cur = conn.execute(
            """
            INSERT INTO expenses
                (org_id, date, amount, event_name, category, description, has_receipt,
                 ai_status, ai_clause, ai_reason, ai_todos, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                DEFAULT_ORG_ID,
                expense.date,
                expense.amount,
                expense.event_name,
                expense.category,
                expense.description,
                int(expense.has_receipt),
                result["status"],
                result["clause"],
                result["reason"],
                json.dumps([{"text": t, "done": False} for t in result.get("todos", [])], ensure_ascii=False),
                datetime.now().isoformat(timespec="seconds"),
            ),
        )
        row = conn.execute("SELECT * FROM expenses WHERE id = ?", (cur.lastrowid,)).fetchone()
        return to_dict(row, conn)


class DecisionIn(BaseModel):
    """총무의 결정: 확정, 소명(소명 내용 필수), 대기(= 결정 취소)"""
    final_status: Literal["확정", "소명", "대기"]
    explanation: str = ""


@app.patch("/expenses/{expense_id}")
def decide_expense(expense_id: int, decision: DecisionIn):
    explanation = decision.explanation.strip()
    if decision.final_status == "소명" and not explanation:
        raise HTTPException(status_code=400, detail="소명 내용을 입력하세요.")
    # 소명일 때만 소명 내용을 남기고, 확정이나 취소면 비운다
    new_explanation = explanation if decision.final_status == "소명" else None

    with get_conn() as conn:
        old = conn.execute("SELECT final_status FROM expenses WHERE id = ?", (expense_id,)).fetchone()
        if old is None:
            raise HTTPException(status_code=404, detail="해당 지출을 찾을 수 없습니다.")
        conn.execute(
            "UPDATE expenses SET final_status = ?, explanation = ? WHERE id = ?",
            (decision.final_status, new_explanation, expense_id),
        )
        conn.execute(
            """
            INSERT INTO decision_logs (expense_id, from_status, to_status, explanation, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (expense_id, old["final_status"], decision.final_status, new_explanation,
             datetime.now().isoformat(timespec="seconds")),
        )
        row = conn.execute("SELECT * FROM expenses WHERE id = ?", (expense_id,)).fetchone()
        return to_dict(row, conn)


@app.get("/expenses")
def list_expenses():
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM expenses ORDER BY id DESC").fetchall()
        return [to_dict(r, conn) for r in rows]


@app.get("/expenses/{expense_id}")
def get_expense(expense_id: int):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM expenses WHERE id = ?", (expense_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="해당 지출을 찾을 수 없습니다.")
        return to_dict(row, conn)


def to_dict(row, conn):
    d = dict(row)
    d["has_receipt"] = bool(d["has_receipt"])  # SQLite는 0/1로 저장하므로 True/False로 변환
    d["ai_todos"] = json.loads(d["ai_todos"]) if d.get("ai_todos") else []
    # 이 지출의 결정 이력을 오래된 순서로 붙여서 보낸다
    logs = conn.execute(
        "SELECT from_status, to_status, explanation, created_at FROM decision_logs "
        "WHERE expense_id = ? ORDER BY id",
        (d["id"],),
    ).fetchall()
    d["logs"] = [dict(log) for log in logs]
    attachments = conn.execute(
        "SELECT id, file_name, created_at FROM attachments WHERE expense_id = ? ORDER BY id",
        (d["id"],),
    ).fetchall()
    d["attachments"] = [dict(a) for a in attachments]
    return d


@app.get("/regulation")
def get_regulation():
    # AI 점검에 실제로 쓰이는 규정 파일을 그대로 보여준다
    return {"file_name": REGULATION_PATH.name, "content": REGULATION_PATH.read_text(encoding="utf-8")}


class ScheduleIn(BaseModel):
    """캘린더 일정 입력값"""
    date: str
    kind: Literal["사업", "감사", "기타"]
    title: str
    memo: str = ""


@app.get("/schedules")
def list_schedules():
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM schedules ORDER BY date, id").fetchall()
    return [dict(r) for r in rows]


@app.post("/schedules")
def create_schedule(schedule: ScheduleIn):
    title = schedule.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="일정 제목을 입력하세요.")
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO schedules (org_id, date, kind, title, memo, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (DEFAULT_ORG_ID, schedule.date, schedule.kind, title, schedule.memo.strip(),
             datetime.now().isoformat(timespec="seconds")),
        )
        row = conn.execute("SELECT * FROM schedules WHERE id = ?", (cur.lastrowid,)).fetchone()
    return dict(row)


@app.delete("/schedules/{schedule_id}")
def delete_schedule(schedule_id: int):
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM schedules WHERE id = ?", (schedule_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="해당 일정을 찾을 수 없습니다.")
    return {"deleted": schedule_id}


class MemoIn(BaseModel):
    memo: str


@app.patch("/expenses/{expense_id}/memo")
def update_memo(expense_id: int, body: MemoIn):
    # 메모는 총무 참고용이라 AI 점검에는 쓰지 않는다
    with get_conn() as conn:
        cur = conn.execute("UPDATE expenses SET memo = ? WHERE id = ?", (body.memo.strip(), expense_id))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="해당 지출을 찾을 수 없습니다.")
        row = conn.execute("SELECT * FROM expenses WHERE id = ?", (expense_id,)).fetchone()
        return to_dict(row, conn)


@app.post("/expenses/{expense_id}/attachments")
async def upload_attachment(expense_id: int, file: UploadFile = File(...)):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="사진(jpg, png, heic, webp) 또는 PDF 파일만 올릴 수 있습니다.")
    content = await file.read()
    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=400, detail="파일은 10MB 이하만 올릴 수 있습니다.")

    with get_conn() as conn:
        if conn.execute("SELECT id FROM expenses WHERE id = ?", (expense_id,)).fetchone() is None:
            raise HTTPException(status_code=404, detail="해당 지출을 찾을 수 없습니다.")
        # 같은 이름의 파일이 덮어써지지 않도록 저장할 때는 무작위 이름을 쓴다
        stored_name = uuid.uuid4().hex + ext
        UPLOAD_DIR.mkdir(exist_ok=True)
        (UPLOAD_DIR / stored_name).write_bytes(content)
        conn.execute(
            "INSERT INTO attachments (expense_id, file_name, stored_name, created_at) VALUES (?, ?, ?, ?)",
            (expense_id, file.filename, stored_name, datetime.now().isoformat(timespec="seconds")),
        )
        row = conn.execute("SELECT * FROM expenses WHERE id = ?", (expense_id,)).fetchone()
        return to_dict(row, conn)


@app.get("/attachments/{attachment_id}")
def get_attachment(attachment_id: int):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM attachments WHERE id = ?", (attachment_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="해당 파일을 찾을 수 없습니다.")
    # 원래 파일 이름으로 브라우저에 보여준다
    return FileResponse(UPLOAD_DIR / row["stored_name"], filename=row["file_name"], content_disposition_type="inline")


@app.delete("/attachments/{attachment_id}")
def delete_attachment(attachment_id: int):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM attachments WHERE id = ?", (attachment_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="해당 파일을 찾을 수 없습니다.")
        conn.execute("DELETE FROM attachments WHERE id = ?", (attachment_id,))
    (UPLOAD_DIR / row["stored_name"]).unlink(missing_ok=True)
    return {"deleted": attachment_id}


@app.post("/receipts/read")
async def read_receipt_photo(file: UploadFile = File(...)):
    """영수증 사진을 읽어 지출 등록 폼에 채울 값을 돌려준다. (DB에는 저장하지 않음)"""
    ext = Path(file.filename or "").suffix.lower()
    if ext not in RECEIPT_MIME_TYPES:
        raise HTTPException(status_code=400, detail="영수증 읽기는 jpg, png, webp 사진만 됩니다. (아이폰 HEIC는 설정에서 '높은 호환성'으로 찍어 주세요)")
    content = await file.read()
    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=400, detail="파일은 10MB 이하만 올릴 수 있습니다.")
    try:
        return read_receipt(content, ext)
    except AICheckError as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.post("/bank/import")
async def import_bank_excel(file: UploadFile = File(...), password: str = Form("")):
    """거래내역 엑셀을 읽어 거래를 저장하고(잔액 현황용), 출금을 등록된 지출과 날짜·금액으로 맞춰 본다.
    엑셀 파일 자체는 저장하지 않는다."""
    if Path(file.filename or "").suffix.lower() != ".xlsx":
        raise HTTPException(status_code=400, detail="xlsx 엑셀 파일만 올릴 수 있습니다.")
    try:
        transactions = parse_transactions(await file.read(), password)
    except BankImportError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # 거래를 저장한다. 이미 저장된 거래(같은 일시·방향·금액·잔액)는 건너뛴다.
    now = datetime.now().isoformat(timespec="seconds")
    with get_conn() as conn:
        before = conn.execute("SELECT COUNT(*) FROM bank_transactions").fetchone()[0]
        conn.executemany(
            "INSERT OR IGNORE INTO bank_transactions (org_id, datetime, direction, amount, balance, content, imported_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            [(DEFAULT_ORG_ID, t["datetime"], t["direction"], t["amount"], t["balance"], t["content"], now) for t in transactions],
        )
        saved = conn.execute("SELECT COUNT(*) FROM bank_transactions").fetchone()[0] - before

    withdrawals = [t for t in transactions if t["direction"] == "출금"]
    if not withdrawals:
        return {"transactions": [], "unmatched_expenses": [], "saved_count": saved}

    first_date = min(w["date"] for w in withdrawals)
    last_date = max(w["date"] for w in withdrawals)
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, date, amount, event_name, description FROM expenses WHERE date BETWEEN ? AND ? ORDER BY date, id",
            (first_date, last_date),
        ).fetchall()
    expenses = [dict(r) for r in rows]

    # 출금 1건마다 날짜와 금액이 같은 지출을 하나씩 짝지어 준다 (한 지출은 한 번만 짝지음)
    used = set()
    for w in withdrawals:
        w["matched_expense_id"] = None
        for exp in expenses:
            if exp["id"] not in used and exp["date"] == w["date"] and exp["amount"] == w["amount"]:
                w["matched_expense_id"] = exp["id"]
                used.add(exp["id"])
                break

    # 지출로는 등록됐는데 같은 기간 통장에 출금이 없는 건 (금액·날짜를 잘못 입력했을 수 있음)
    unmatched_expenses = [exp for exp in expenses if exp["id"] not in used]
    return {"transactions": withdrawals, "unmatched_expenses": unmatched_expenses, "saved_count": saved}


class BudgetIn(BaseModel):
    event_name: str
    category: str
    amount: int
    memo: str = ""


def budget_overview(conn):
    """예산 줄마다 같은 사업명·비목의 지출 합계와 잔액을 붙이고, 예산에 없는 지출도 따로 모은다."""
    budgets = [dict(r) for r in conn.execute("SELECT * FROM budgets ORDER BY event_name, category, id")]
    spent = {
        (r["event_name"], r["category"]): r["total"]
        for r in conn.execute("SELECT event_name, category, SUM(amount) AS total FROM expenses GROUP BY event_name, category")
    }
    for b in budgets:
        b["spent"] = spent.pop((b["event_name"], b["category"]), 0)
        b["remaining"] = b["amount"] - b["spent"]
    # 예산 줄에 없는 사업명·비목으로 쓴 지출 (예산 미편성 또는 이름 오타)
    unbudgeted = [{"event_name": e, "category": c, "spent": t} for (e, c), t in sorted(spent.items())]
    return {"budgets": budgets, "unbudgeted": unbudgeted}


@app.get("/budgets")
def list_budgets():
    with get_conn() as conn:
        return budget_overview(conn)


@app.post("/budgets")
def create_budget(budget: BudgetIn):
    event_name, category = budget.event_name.strip(), budget.category.strip()
    if not event_name or not category:
        raise HTTPException(status_code=400, detail="사업명과 비목을 입력하세요.")
    if budget.amount < 0:
        raise HTTPException(status_code=400, detail="예산액은 0 이상이어야 합니다.")
    with get_conn() as conn:
        if conn.execute("SELECT 1 FROM budgets WHERE event_name = ? AND category = ?", (event_name, category)).fetchone():
            raise HTTPException(status_code=400, detail="같은 사업명·비목의 예산이 이미 있습니다. 기존 줄의 금액을 고쳐 주세요.")
        conn.execute(
            "INSERT INTO budgets (org_id, event_name, category, amount, memo, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (DEFAULT_ORG_ID, event_name, category, budget.amount, budget.memo.strip(), datetime.now().isoformat(timespec="seconds")),
        )
        return budget_overview(conn)


class BudgetUpdateIn(BaseModel):
    amount: int
    memo: str = ""


@app.patch("/budgets/{budget_id}")
def update_budget(budget_id: int, body: BudgetUpdateIn):
    if body.amount < 0:
        raise HTTPException(status_code=400, detail="예산액은 0 이상이어야 합니다.")
    with get_conn() as conn:
        cur = conn.execute("UPDATE budgets SET amount = ?, memo = ? WHERE id = ?", (body.amount, body.memo.strip(), budget_id))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="해당 예산을 찾을 수 없습니다.")
        return budget_overview(conn)


@app.delete("/budgets/{budget_id}")
def delete_budget(budget_id: int):
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM budgets WHERE id = ?", (budget_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="해당 예산을 찾을 수 없습니다.")
        return budget_overview(conn)


@app.get("/reports/settlement.xlsx")
def settlement_report(start: str = "", end: str = ""):
    """결산보고서 엑셀을 내려준다. start/end(YYYY-MM-DD)를 주면 그 기간의 지출만 집계한다."""
    query, params = "SELECT * FROM expenses WHERE 1=1", []
    if start:
        query += " AND date >= ?"
        params.append(start)
    if end:
        query += " AND date <= ?"
        params.append(end)
    with get_conn() as conn:
        expenses = [dict(r) for r in conn.execute(query, params)]
        budgets = [dict(r) for r in conn.execute("SELECT event_name, category, amount FROM budgets")]
    period = f"{start or '처음'} ~ {end or '현재'}"
    content = build_settlement(budgets, expenses, period)
    filename = f"settlement_{start or 'all'}_{end or 'now'}.xlsx"
    return Response(
        content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


class TodoDoneIn(BaseModel):
    done: bool


@app.patch("/expenses/{expense_id}/todos/{index}")
def toggle_todo(expense_id: int, index: int, body: TodoDoneIn):
    """챙길 것 목록의 index번째 항목을 완료/미완료로 바꾼다."""
    with get_conn() as conn:
        row = conn.execute("SELECT ai_todos FROM expenses WHERE id = ?", (expense_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="해당 지출을 찾을 수 없습니다.")
        todos = json.loads(row["ai_todos"]) if row["ai_todos"] else []
        if not 0 <= index < len(todos):
            raise HTTPException(status_code=404, detail="해당 항목을 찾을 수 없습니다.")
        todos[index]["done"] = body.done
        conn.execute("UPDATE expenses SET ai_todos = ? WHERE id = ?", (json.dumps(todos, ensure_ascii=False), expense_id))
        row = conn.execute("SELECT * FROM expenses WHERE id = ?", (expense_id,)).fetchone()
        return to_dict(row, conn)


@app.get("/bank/summary")
def bank_summary():
    """저장된 거래로 최근 잔액과 월별 입출금 합계를 돌려준다. (대시보드용)"""
    with get_conn() as conn:
        latest = conn.execute(
            "SELECT datetime, balance FROM bank_transactions WHERE balance IS NOT NULL ORDER BY datetime DESC, id DESC LIMIT 1"
        ).fetchone()
        months = conn.execute(
            """
            SELECT substr(datetime, 1, 7) AS month,
                   SUM(CASE WHEN direction = '입금' THEN amount ELSE 0 END) AS deposit,
                   SUM(CASE WHEN direction = '출금' THEN amount ELSE 0 END) AS withdraw
            FROM bank_transactions GROUP BY month ORDER BY month DESC LIMIT 3
            """
        ).fetchall()
    return {
        "balance": latest["balance"] if latest else None,
        "as_of": latest["datetime"] if latest else None,
        "months": [dict(m) for m in months],
    }
