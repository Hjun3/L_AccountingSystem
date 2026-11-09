import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from ai_check import REGULATION_PATH, AICheckError, check_expense

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
    return d


@app.get("/regulation")
def get_regulation():
    # AI 점검에 실제로 쓰이는 규정 파일을 그대로 보여준다
    return {"file_name": REGULATION_PATH.name, "content": REGULATION_PATH.read_text(encoding="utf-8")}
