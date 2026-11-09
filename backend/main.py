import sqlite3
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from ai_check import AICheckError, check_expense

DB_PATH = Path(__file__).parent / "expenses.db"
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
    return to_dict(row)


@app.get("/expenses")
def list_expenses():
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM expenses ORDER BY id DESC").fetchall()
    return [to_dict(r) for r in rows]


def to_dict(row):
    d = dict(row)
    d["has_receipt"] = bool(d["has_receipt"])  # SQLite는 0/1로 저장하므로 True/False로 변환
    return d
