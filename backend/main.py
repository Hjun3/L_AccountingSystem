import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Literal

import uuid

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from bank_import import BankImportError, parse_withdrawals
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
                 ai_status, ai_clause, ai_reason, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
async def import_bank_excel(file: UploadFile = File(...)):
    """거래내역 엑셀의 출금 내역을 읽고, 이미 등록된 지출과 날짜·금액으로 맞춰 본다. (DB에는 저장하지 않음)"""
    if Path(file.filename or "").suffix.lower() != ".xlsx":
        raise HTTPException(status_code=400, detail="xlsx 엑셀 파일만 올릴 수 있습니다.")
    try:
        withdrawals = parse_withdrawals(await file.read())
    except BankImportError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not withdrawals:
        return {"transactions": [], "unmatched_expenses": []}

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
    return {"transactions": withdrawals, "unmatched_expenses": unmatched_expenses}
