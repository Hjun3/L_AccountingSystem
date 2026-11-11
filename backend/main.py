from datetime import datetime, timedelta
from pathlib import Path
from typing import Literal

import json
import uuid

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import auth
from auth import current_user, init_auth_tables
from db import get_conn, now_text
from report import build_settlement
from bank_import import BankImportError, parse_transactions
from ai_check import RECEIPT_MIME_TYPES, REGULATION_PATH, AICheckError, check_expense, read_receipt

UPLOAD_DIR = Path(__file__).parent / "uploads"  # 첨부파일 저장 폴더 (GitHub에 올리지 않음)
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".heic", ".webp", ".pdf"}
MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10MB
DEFAULT_ORG_ID = "default"  # 지금은 조직이 하나뿐이라 기본값 사용

# API 설명 페이지(/docs)는 끈다. 켜 두면 외부에서 API 목록을 그대로 볼 수 있다.
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

# 요청마다 로그인·권한을 확인한다 (auth.py)
app.middleware("http")(auth.auth_middleware)


@app.middleware("http")
async def security_headers(request, call_next):
    """브라우저에 기본 보안 규칙을 알려 주는 응답 헤더"""
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"  # 사진이라고 올린 파일을 브라우저가 다른 형식(예: 웹페이지)으로 실행하지 않게
    response.headers["X-Frame-Options"] = "DENY"  # 다른 사이트가 이 사이트를 몰래 화면 안에 넣지 못하게
    response.headers["Referrer-Policy"] = "same-origin"
    return response

# React 개발 서버(5173 포트)에서 이 API를 호출할 수 있도록 허용.
# 로그인 쿠키를 주고받도록 allow_credentials를 켠다.
# 이 설정을 로그인 확인보다 나중에 추가해야 바깥쪽에서 동작해서, '로그인 필요' 응답에도 허용 정보가 붙는다.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth.router)


def ensure_term(conn, year):
    """그 연도의 임기가 있으면 id를, 없으면 만들어서 id를 돌려준다."""
    row = conn.execute("SELECT id FROM terms WHERE org_id = ? AND year = ?", (DEFAULT_ORG_ID, year)).fetchone()
    if row:
        return row["id"]
    cur = conn.execute(
        "INSERT INTO terms (org_id, year, name, created_at) VALUES (?, ?, ?, ?)",
        (DEFAULT_ORG_ID, year, f"{year}년", now_text()),
    )
    return cur.lastrowid


def create_term_with_periods(conn, year):
    """임기와 기본 기간 4개(학기 전 1~2월, 1학기 3~6월, 여름방학 7~8월, 2학기 9~12월)를 만든다."""
    term_id = ensure_term(conn, year)
    end_feb = "29" if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else "28"
    # 지난 임기의 2학기가 올해 초까지 이어지면, 겹치지 않게 '학기 전'을 그다음 날부터 시작한다
    start = f"{year}-01-01"
    prev_end = conn.execute(
        "SELECT MAX(p.end_date) FROM periods p JOIN terms t ON t.id = p.term_id WHERE t.year = ?", (year - 1,)
    ).fetchone()[0]
    if prev_end and prev_end >= start:
        start = (datetime.fromisoformat(prev_end) + timedelta(days=1)).date().isoformat()
        start = min(start, f"{year}-02-{end_feb}")
    conn.executemany(
        "INSERT INTO periods (org_id, term_id, name, start_date, end_date, sort_order) VALUES (?, ?, ?, ?, ?, ?)",
        [
            (DEFAULT_ORG_ID, term_id, "학기 전", start, f"{year}-02-{end_feb}", 1),
            (DEFAULT_ORG_ID, term_id, "1학기", f"{year}-03-01", f"{year}-06-30", 2),
            (DEFAULT_ORG_ID, term_id, "여름방학", f"{year}-07-01", f"{year}-08-31", 3),
            (DEFAULT_ORG_ID, term_id, "2학기", f"{year}-09-01", f"{year}-12-31", 4),
        ],
    )
    return term_id


def add_summer_periods(conn):
    """기간이 3개(학기 전/1학기/2학기)였던 예전 임기에 '여름방학' 기간을 넣는다. (서버 시작 시 한 번씩, 이미 있으면 건너뜀)
    - 예전 기본 날짜(1학기 3~7월, 2학기 8~12월) 그대로면: 1학기 3~6월, 여름방학 7~8월, 2학기 9~12월로 나눈다
    - 날짜를 직접 고친 임기면: 1학기 끝 다음 날 ~ 2학기 시작 전날이 비어 있을 때만 그 사이를 여름방학으로 넣는다
    """
    day = lambda text, n: (datetime.fromisoformat(text) + timedelta(days=n)).date().isoformat()
    for t in conn.execute("SELECT id, year FROM terms").fetchall():
        periods = {r["name"]: r for r in conn.execute("SELECT * FROM periods WHERE term_id = ?", (t["id"],))}
        if "여름방학" in periods or "1학기" not in periods or "2학기" not in periods:
            continue
        first, second, y = periods["1학기"], periods["2학기"], t["year"]
        if first["end_date"] == f"{y}-07-31" and second["start_date"] == f"{y}-08-01":
            conn.execute("UPDATE periods SET end_date = ? WHERE id = ?", (f"{y}-06-30", first["id"]))
            conn.execute("UPDATE periods SET start_date = ? WHERE id = ?", (f"{y}-09-01", second["id"]))
            start, end = f"{y}-07-01", f"{y}-08-31"
        else:
            start, end = day(first["end_date"], 1), day(second["start_date"], -1)
            if start > end:
                continue  # 사이에 빈 날짜가 없으면 날짜를 건드리지 않는다 (화면에서 직접 고칠 수 있음)
        conn.execute("UPDATE periods SET sort_order = 4 WHERE id = ?", (second["id"],))
        conn.execute(
            "INSERT INTO periods (org_id, term_id, name, start_date, end_date, sort_order) VALUES (?, ?, '여름방학', ?, ?, 3)",
            (DEFAULT_ORG_ID, t["id"], start, end),
        )


def term_range(conn, term_id):
    """임기의 날짜 범위 = 그 임기 기간들의 가장 이른 시작일 ~ 가장 늦은 종료일"""
    row = conn.execute("SELECT MIN(start_date) AS s, MAX(end_date) AS e FROM periods WHERE term_id = ?", (term_id,)).fetchone()
    if row is None or row["s"] is None:
        raise HTTPException(status_code=404, detail="해당 임기를 찾을 수 없습니다.")
    return row["s"], row["e"]


def init_db():
    with get_conn() as conn:
        init_auth_tables(conn)
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
        # 수정 시각(AI 점검 이후 고쳤는지 표시용)과 삭제 표시. 삭제는 실제로 지우지 않고 표시만 한다.
        if "updated_at" not in columns:
            conn.execute("ALTER TABLE expenses ADD COLUMN updated_at TEXT")
        if "deleted_at" not in columns:
            conn.execute("ALTER TABLE expenses ADD COLUMN deleted_at TEXT")

        # 변경 기록: 지출 수정·삭제, 증빙 첨부·삭제를 한 줄씩 남긴다 (지우거나 고치지 않음)
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS change_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                expense_id INTEGER NOT NULL,
                action TEXT NOT NULL,
                detail TEXT,
                created_at TEXT NOT NULL
            )
            """
        )
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
        # 임기(회계연도): 예) 2026년. 기간(학기 전/1학기/여름방학/2학기)이 임기에 속한다. 다음 학생회는 새 임기를 만들어 쓴다.
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS terms (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                org_id TEXT NOT NULL,
                year INTEGER NOT NULL,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE (org_id, year)
            )
            """
        )
        # 예산 기간: 학기 전 / 1학기 / 여름방학 / 2학기. 지출은 날짜가 기간 범위에 들어가면 그 기간으로 본다.
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS periods (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                org_id TEXT NOT NULL,
                name TEXT NOT NULL,
                start_date TEXT NOT NULL,
                end_date TEXT NOT NULL,
                sort_order INTEGER NOT NULL
            )
            """
        )
        if "term_id" not in [c["name"] for c in conn.execute("PRAGMA table_info(periods)")]:
            conn.execute("ALTER TABLE periods ADD COLUMN term_id INTEGER")
        # 임기가 없는 기존 기간은 시작일의 연도 임기에 넣는다
        for p in conn.execute("SELECT id, start_date FROM periods WHERE term_id IS NULL").fetchall():
            conn.execute("UPDATE periods SET term_id = ? WHERE id = ?", (ensure_term(conn, int(p["start_date"][:4])), p["id"]))
        # 처음 실행이면 올해 임기와 기간 4개를 만든다
        if conn.execute("SELECT COUNT(*) FROM terms").fetchone()[0] == 0:
            create_term_with_periods(conn, datetime.now().year)
        add_summer_periods(conn)  # 예전 임기(기간 3개)에 여름방학 추가
        budget_columns = [c["name"] for c in conn.execute("PRAGMA table_info(budgets)")]
        if "period_id" not in budget_columns:
            conn.execute("ALTER TABLE budgets ADD COLUMN period_id INTEGER")
            # 기간 구분 전에 넣은 예산은 1학기 예산으로 옮긴다
            conn.execute("UPDATE budgets SET period_id = (SELECT id FROM periods WHERE name = '1학기') WHERE period_id IS NULL")
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
        # 여러 날 일정(예: MT 1박 2일)을 위해 종료일을 둔다. 비어 있으면 하루짜리 일정
        if "end_date" not in [c["name"] for c in conn.execute("PRAGMA table_info(schedules)")]:
            conn.execute("ALTER TABLE schedules ADD COLUMN end_date TEXT")
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

        # 예전 결정 '소명'(화면 이름 '사유')은 없앴다: 확정 + 메모로 옮긴다 (메모가 있으면 뒤에 붙임)
        for r in conn.execute("SELECT id, memo, explanation FROM expenses WHERE final_status = '소명'").fetchall():
            parts = [t for t in [(r["memo"] or "").strip(), (r["explanation"] or "").strip()] if t]
            conn.execute("UPDATE expenses SET final_status = '확정', memo = ?, explanation = NULL WHERE id = ?",
                         (" / ".join(parts), r["id"]))
        # 기록에 '누가 했는지'(사용자 이름) 칸을 추가한다
        for table in ("change_logs", "decision_logs"):
            if "actor" not in [c["name"] for c in conn.execute(f"PRAGMA table_info({table})")]:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN actor TEXT")


init_db()


class ExpenseIn(BaseModel):
    """총무가 입력하는 값 (나머지 칸은 서버가 채움)"""
    date: str
    amount: int
    event_name: str
    category: str
    description: str
    has_receipt: bool


async def read_limited(file: UploadFile, limit: int = MAX_UPLOAD_SIZE) -> bytes:
    """업로드 파일을 1MB씩 읽다가 제한을 넘으면 바로 멈춘다. (아주 큰 파일로 서버 메모리를 채우는 공격 방지)"""
    chunks, size = [], 0
    while chunk := await file.read(1024 * 1024):
        size += len(chunk)
        if size > limit:
            raise HTTPException(status_code=400, detail=f"파일은 {limit // (1024 * 1024)}MB 이하만 올릴 수 있습니다.")
        chunks.append(chunk)
    return b"".join(chunks)


# 총무 결정 화면 표시 이름 (예전 기록의 '소명'은 지금 방식으로는 메모를 남긴 확정이므로 '확정'으로 보여준다)
FINAL_LABELS = {"대기": "대기", "확정": "확정", "소명": "확정"}


def actor_name():
    """지금 요청한 사용자 이름 (기록용). 스크립트에서 실행하면 '시스템'."""
    user = current_user.get()
    return f"{user['display_name']}({user['username']})" if user else "시스템"


def add_change_log(conn, expense_id, action, detail=""):
    conn.execute(
        "INSERT INTO change_logs (expense_id, action, detail, created_at, actor) VALUES (?, ?, ?, ?, ?)",
        (expense_id, action, detail, now_text(), actor_name()),
    )


def get_active_expense(conn, expense_id):
    """수정·결정·첨부 등을 하기 전에 지출이 있고 삭제되지 않았는지 확인한다."""
    row = conn.execute("SELECT * FROM expenses WHERE id = ?", (expense_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="해당 지출을 찾을 수 없습니다.")
    if row["deleted_at"]:
        raise HTTPException(status_code=400, detail="삭제된 지출은 바꿀 수 없습니다.")
    return row


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
    """총무의 결정: 확정 또는 대기(= 결정 취소). memo를 주면 지출 메모도 함께 저장한다."""
    final_status: Literal["확정", "대기"]
    memo: str | None = None


@app.patch("/expenses/{expense_id}")
def decide_expense(expense_id: int, decision: DecisionIn):
    with get_conn() as conn:
        old = get_active_expense(conn, expense_id)
        memo = old["memo"] or ""
        if decision.memo is not None:
            memo = decision.memo.strip()
        # AI가 '확인 필요'·'조치 필요'라고 한 지출은 메모(왜 넘어가는지)가 있어야 확정할 수 있다
        if decision.final_status == "확정" and old["ai_status"] in ("주의", "위반") and not memo:
            raise HTTPException(status_code=400, detail="확인·조치가 필요한 지출은 메모를 남겨야 확정할 수 있어요.")
        conn.execute(
            "UPDATE expenses SET final_status = ?, memo = ? WHERE id = ?",
            (decision.final_status, memo, expense_id),
        )
        # 확정할 때의 메모를 기록에도 남긴다 (나중에 메모를 고쳐도 그때 무슨 이유였는지 보이게)
        conn.execute(
            """
            INSERT INTO decision_logs (expense_id, from_status, to_status, explanation, created_at, actor)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (expense_id, old["final_status"], decision.final_status,
             memo if decision.final_status == "확정" and memo else None,
             datetime.now().isoformat(timespec="seconds"), actor_name()),
        )
        row = conn.execute("SELECT * FROM expenses WHERE id = ?", (expense_id,)).fetchone()
        return to_dict(row, conn)


@app.get("/expenses")
def list_expenses(term_id: int | None = None):
    """지출 목록. term_id를 주면 그 임기 날짜 범위의 지출만 돌려준다."""
    with get_conn() as conn:
        query, params = "SELECT * FROM expenses WHERE deleted_at IS NULL", []
        if term_id is not None:
            query += " AND date BETWEEN ? AND ?"
            params += term_range(conn, term_id)
        rows = conn.execute(query + " ORDER BY id DESC", params).fetchall()
        return [to_dict(r, conn) for r in rows]


@app.get("/expenses/{expense_id}")
def get_expense(expense_id: int):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM expenses WHERE id = ?", (expense_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="해당 지출을 찾을 수 없습니다.")
        return to_dict(row, conn)


# 수정할 수 있는 칸과 기록에 쓸 이름
EDITABLE_FIELDS = {"date": "날짜", "amount": "금액", "event_name": "사업명", "category": "지출 항목",
                   "description": "지출 내용", "has_receipt": "증빙"}


@app.put("/expenses/{expense_id}")
def update_expense(expense_id: int, expense: ExpenseIn):
    """지출 내용을 고친다. 바뀐 칸은 '수정 전 → 수정 후'로 기록에 남긴다. (AI 점검은 다시 하지 않음)"""
    with get_conn() as conn:
        old = dict(get_active_expense(conn, expense_id))
        new = expense.model_dump()
        new["has_receipt"] = int(new["has_receipt"])
        changes = [f"{label}: {old[k]} → {new[k]}" for k, label in EDITABLE_FIELDS.items() if old[k] != new[k]]
        if changes:
            conn.execute(
                "UPDATE expenses SET date = ?, amount = ?, event_name = ?, category = ?, description = ?, "
                "has_receipt = ?, updated_at = ? WHERE id = ?",
                (new["date"], new["amount"], new["event_name"], new["category"], new["description"],
                 new["has_receipt"], now_text(), expense_id),
            )
            add_change_log(conn, expense_id, "지출 수정", " / ".join(changes))
        row = conn.execute("SELECT * FROM expenses WHERE id = ?", (expense_id,)).fetchone()
        return to_dict(row, conn)


class DeleteIn(BaseModel):
    reason: str = ""


@app.delete("/expenses/{expense_id}")
def delete_expense(expense_id: int, body: DeleteIn):
    """지출을 삭제 표시한다. 목록·예산·결산에서는 빠지지만 데이터와 기록은 남는다."""
    with get_conn() as conn:
        old = get_active_expense(conn, expense_id)
        conn.execute("UPDATE expenses SET deleted_at = ? WHERE id = ?", (now_text(), expense_id))
        summary = f"{old['date']} {old['event_name']} {old['amount']:,}원 - {old['description']}"
        reason = body.reason.strip()
        add_change_log(conn, expense_id, "지출 삭제", summary + (f" (사유: {reason})" if reason else ""))
    return {"deleted": expense_id}


@app.get("/logs")
def list_logs():
    """기록 화면용: 지출 수정·삭제, 증빙 첨부·삭제, 총무 결정 기록을 최신순으로 합쳐서 돌려준다."""
    with get_conn() as conn:
        changes = conn.execute(
            "SELECT id, expense_id, action, detail, created_at, actor FROM change_logs"
        ).fetchall()
        decisions = conn.execute(
            "SELECT id, expense_id, from_status, to_status, explanation, created_at, actor FROM decision_logs"
        ).fetchall()
        expenses = {
            r["id"]: dict(r) for r in conn.execute("SELECT id, date, event_name, amount, description, deleted_at FROM expenses")
        }
    logs = [dict(c) for c in changes]
    for d in decisions:
        to = "취소" if d["to_status"] == "대기" else FINAL_LABELS.get(d["to_status"], d["to_status"])
        detail = f"{FINAL_LABELS.get(d['from_status'], d['from_status'])} → {to}" + (f" ({d['explanation']})" if d["explanation"] else "")
        logs.append({"id": d["id"], "expense_id": d["expense_id"], "action": "총무 결정", "detail": detail,
                     "created_at": d["created_at"], "actor": d["actor"]})
    for log in logs:
        log["expense"] = expenses.get(log["expense_id"])
    # 같은 초에 생긴 기록은 저장된 순서(id)로 정렬한다
    logs.sort(key=lambda x: (x["created_at"], x["id"]), reverse=True)
    return logs


def to_dict(row, conn):
    d = dict(row)
    d["has_receipt"] = bool(d["has_receipt"])  # SQLite는 0/1로 저장하므로 True/False로 변환
    d["ai_todos"] = json.loads(d["ai_todos"]) if d.get("ai_todos") else []
    # 이 지출의 결정 이력을 오래된 순서로 붙여서 보낸다
    logs = conn.execute(
        "SELECT from_status, to_status, explanation, created_at, actor FROM decision_logs "
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
    date: str  # 시작일
    end_date: str | None = None  # 종료일 (여러 날 일정일 때만. 없으면 하루짜리)
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
    end_date = schedule.end_date or None
    if end_date and end_date < schedule.date:
        raise HTTPException(status_code=400, detail="종료일이 시작일보다 빠를 수 없습니다.")
    if end_date == schedule.date:
        end_date = None  # 시작일과 같으면 하루짜리
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO schedules (org_id, date, end_date, kind, title, memo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (DEFAULT_ORG_ID, schedule.date, end_date, schedule.kind, title, schedule.memo.strip(),
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
        get_active_expense(conn, expense_id)
        conn.execute("UPDATE expenses SET memo = ? WHERE id = ?", (body.memo.strip(), expense_id))
        row = conn.execute("SELECT * FROM expenses WHERE id = ?", (expense_id,)).fetchone()
        return to_dict(row, conn)


@app.post("/expenses/{expense_id}/attachments")
async def upload_attachment(expense_id: int, file: UploadFile = File(...)):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="사진(jpg, png, heic, webp) 또는 PDF 파일만 올릴 수 있습니다.")
    content = await read_limited(file)

    with get_conn() as conn:
        expense = get_active_expense(conn, expense_id)
        # 같은 이름의 파일이 덮어써지지 않도록 저장할 때는 무작위 이름을 쓴다
        stored_name = uuid.uuid4().hex + ext
        UPLOAD_DIR.mkdir(exist_ok=True)
        (UPLOAD_DIR / stored_name).write_bytes(content)
        conn.execute(
            "INSERT INTO attachments (expense_id, file_name, stored_name, created_at) VALUES (?, ?, ?, ?)",
            (expense_id, file.filename, stored_name, datetime.now().isoformat(timespec="seconds")),
        )
        # 파일을 첨부하면 '증빙 있음'으로 바꾼다
        detail = file.filename
        if not expense["has_receipt"]:
            conn.execute("UPDATE expenses SET has_receipt = 1 WHERE id = ?", (expense_id,))
            detail += " (증빙: 없음 → 있음)"
        add_change_log(conn, expense_id, "증빙 첨부", detail)
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
        get_active_expense(conn, row["expense_id"])
        conn.execute("DELETE FROM attachments WHERE id = ?", (attachment_id,))
        add_change_log(conn, row["expense_id"], "증빙 삭제", row["file_name"])
    (UPLOAD_DIR / row["stored_name"]).unlink(missing_ok=True)
    return {"deleted": attachment_id}


@app.post("/receipts/read")
async def read_receipt_photo(file: UploadFile = File(...)):
    """영수증 사진을 읽어 지출 등록 폼에 채울 값을 돌려준다. (DB에는 저장하지 않음)"""
    ext = Path(file.filename or "").suffix.lower()
    if ext not in RECEIPT_MIME_TYPES:
        raise HTTPException(status_code=400, detail="영수증 읽기는 jpg, png, webp 사진만 됩니다. (아이폰 HEIC는 설정에서 '높은 호환성'으로 찍어 주세요)")
    content = await read_limited(file)
    try:
        return read_receipt(content, ext)
    except AICheckError as e:
        raise HTTPException(status_code=502, detail=str(e))


def save_bank_transactions(transactions) -> int:
    """거래를 저장하고 새로 저장된 건수를 돌려준다. 이미 저장된 거래(같은 일시·방향·금액·잔액)는 건너뛴다."""
    now = datetime.now().isoformat(timespec="seconds")
    with get_conn() as conn:
        before = conn.execute("SELECT COUNT(*) FROM bank_transactions").fetchone()[0]
        conn.executemany(
            "INSERT OR IGNORE INTO bank_transactions (org_id, datetime, direction, amount, balance, content, imported_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            [(DEFAULT_ORG_ID, t["datetime"], t["direction"], t["amount"], t["balance"], t["content"], now) for t in transactions],
        )
        return conn.execute("SELECT COUNT(*) FROM bank_transactions").fetchone()[0] - before


@app.post("/bank/import")
async def import_bank_excel(file: UploadFile = File(...), password: str = Form("")):
    """거래내역 엑셀을 읽어 거래를 저장하고(잔액 현황용), 출금을 등록된 지출과 날짜·금액으로 맞춰 본다.
    엑셀 파일 자체는 저장하지 않는다."""
    if Path(file.filename or "").suffix.lower() != ".xlsx":
        raise HTTPException(status_code=400, detail="xlsx 엑셀 파일만 올릴 수 있습니다.")
    try:
        transactions = parse_transactions(await read_limited(file), password)
    except BankImportError as e:
        raise HTTPException(status_code=400, detail=str(e))

    saved = save_bank_transactions(transactions)

    withdrawals = [t for t in transactions if t["direction"] == "출금"]
    if not withdrawals:
        return {"transactions": [], "unmatched_expenses": [], "saved_count": saved}

    first_date = min(w["date"] for w in withdrawals)
    last_date = max(w["date"] for w in withdrawals)
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, date, amount, event_name, description FROM expenses WHERE deleted_at IS NULL AND date BETWEEN ? AND ? ORDER BY date, id",
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
    period_id: int
    event_name: str
    category: str
    amount: int
    memo: str = ""


def get_period(conn, period_id):
    row = conn.execute("SELECT * FROM periods WHERE id = ?", (period_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="해당 기간을 찾을 수 없습니다.")
    return dict(row)


def budget_overview(conn, period_id):
    """선택한 기간의 예산 줄마다 그 기간 날짜 안의 지출 합계·잔액을 붙인다.
    예산에 없는 지출과, 사업별 x 월별 지출 표도 함께 돌려준다."""
    period = get_period(conn, period_id)
    in_period = "deleted_at IS NULL AND date BETWEEN ? AND ?"
    dates = (period["start_date"], period["end_date"])

    budgets = [dict(r) for r in conn.execute(
        "SELECT * FROM budgets WHERE period_id = ? ORDER BY event_name, category, id", (period_id,))]
    spent = {
        (r["event_name"], r["category"]): r["total"]
        for r in conn.execute(
            f"SELECT event_name, category, SUM(amount) AS total FROM expenses WHERE {in_period} GROUP BY event_name, category",
            dates)
    }
    for b in budgets:
        b["spent"] = spent.pop((b["event_name"], b["category"]), 0)
        b["remaining"] = b["amount"] - b["spent"]
    # 예산 줄에 없는 사업명·비목으로 쓴 지출 (예산 미편성 또는 이름 오타)
    unbudgeted = [{"event_name": e, "category": c, "spent": t} for (e, c), t in sorted(spent.items())]

    # 월별 지출: [{event_name, month(YYYY-MM), total}] → 화면에서 사업 x 월 표로 만든다
    monthly = [dict(r) for r in conn.execute(
        f"SELECT event_name, substr(date, 1, 7) AS month, SUM(amount) AS total FROM expenses WHERE {in_period} "
        "GROUP BY event_name, month ORDER BY event_name, month", dates)]
    return {"period": period, "budgets": budgets, "unbudgeted": unbudgeted, "monthly": monthly}


@app.get("/terms")
def list_terms():
    """임기 목록 (최근 연도부터). 각 임기의 날짜 범위도 함께."""
    with get_conn() as conn:
        terms = [dict(r) for r in conn.execute("SELECT * FROM terms ORDER BY year DESC")]
        for t in terms:
            t["start_date"], t["end_date"] = term_range(conn, t["id"])
        return terms


class TermIn(BaseModel):
    year: int
    copy_budgets_from: int | None = None  # 이 임기의 예산(사업·비목·금액)을 복사해 온다


@app.post("/terms")
def create_term(body: TermIn):
    """새 임기를 만든다 (관리자만). 다음 학생회가 쓸 때 사용."""
    if not 2000 <= body.year <= 2100:
        raise HTTPException(status_code=400, detail="연도를 확인하세요.")
    with get_conn() as conn:
        if conn.execute("SELECT 1 FROM terms WHERE org_id = ? AND year = ?", (DEFAULT_ORG_ID, body.year)).fetchone():
            raise HTTPException(status_code=400, detail=f"{body.year}년 임기가 이미 있습니다.")
        term_id = create_term_with_periods(conn, body.year)
        if body.copy_budgets_from is not None:
            # 같은 이름의 기간(학기 전/1학기/여름방학/2학기)끼리 예산 줄을 복사한다
            new_periods = {r["name"]: r["id"] for r in conn.execute("SELECT id, name FROM periods WHERE term_id = ?", (term_id,))}
            old = conn.execute(
                "SELECT p.name AS period_name, b.event_name, b.category, b.amount, b.memo FROM budgets b "
                "JOIN periods p ON p.id = b.period_id WHERE p.term_id = ?",
                (body.copy_budgets_from,),
            ).fetchall()
            for b in old:
                if b["period_name"] in new_periods:
                    conn.execute(
                        "INSERT INTO budgets (org_id, period_id, event_name, category, amount, memo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                        (DEFAULT_ORG_ID, new_periods[b["period_name"]], b["event_name"], b["category"], b["amount"], b["memo"], now_text()),
                    )
    return list_terms()


@app.get("/periods")
def list_periods(term_id: int | None = None):
    with get_conn() as conn:
        if term_id is None:
            return [dict(r) for r in conn.execute("SELECT * FROM periods ORDER BY term_id, sort_order")]
        return [dict(r) for r in conn.execute("SELECT * FROM periods WHERE term_id = ? ORDER BY sort_order", (term_id,))]


class PeriodIn(BaseModel):
    start_date: str
    end_date: str


@app.patch("/periods/{period_id}")
def update_period(period_id: int, body: PeriodIn):
    if body.start_date > body.end_date:
        raise HTTPException(status_code=400, detail="시작일이 종료일보다 늦을 수 없습니다.")
    with get_conn() as conn:
        get_period(conn, period_id)
        conn.execute("UPDATE periods SET start_date = ?, end_date = ? WHERE id = ?", (body.start_date, body.end_date, period_id))
        term_id = conn.execute("SELECT term_id FROM periods WHERE id = ?", (period_id,)).fetchone()["term_id"]
        return [dict(r) for r in conn.execute("SELECT * FROM periods WHERE term_id = ? ORDER BY sort_order", (term_id,))]


@app.get("/budgets")
def list_budgets(period_id: int):
    with get_conn() as conn:
        return budget_overview(conn, period_id)


@app.get("/budgets/names")
def budget_names():
    """모든 기간 예산의 사업명 목록 (입력칸 자동완성용)"""
    with get_conn() as conn:
        return [r["event_name"] for r in conn.execute("SELECT DISTINCT event_name FROM budgets ORDER BY event_name")]


@app.post("/budgets")
def create_budget(budget: BudgetIn):
    event_name, category = budget.event_name.strip(), budget.category.strip()
    if not event_name or not category:
        raise HTTPException(status_code=400, detail="사업명과 지출 항목을 입력하세요.")
    if budget.amount < 0:
        raise HTTPException(status_code=400, detail="예산액은 0 이상이어야 합니다.")
    with get_conn() as conn:
        get_period(conn, budget.period_id)
        if conn.execute("SELECT 1 FROM budgets WHERE period_id = ? AND event_name = ? AND category = ?",
                        (budget.period_id, event_name, category)).fetchone():
            raise HTTPException(status_code=400, detail="이 기간에 같은 사업명·지출 항목의 예산이 이미 있습니다. 기존 줄의 금액을 고쳐 주세요.")
        conn.execute(
            "INSERT INTO budgets (org_id, period_id, event_name, category, amount, memo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (DEFAULT_ORG_ID, budget.period_id, event_name, category, budget.amount, budget.memo.strip(),
             datetime.now().isoformat(timespec="seconds")),
        )
        return budget_overview(conn, budget.period_id)


class BudgetUpdateIn(BaseModel):
    amount: int
    memo: str = ""


def _budget_period(conn, budget_id):
    row = conn.execute("SELECT period_id FROM budgets WHERE id = ?", (budget_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="해당 예산을 찾을 수 없습니다.")
    return row["period_id"]


@app.patch("/budgets/{budget_id}")
def update_budget(budget_id: int, body: BudgetUpdateIn):
    if body.amount < 0:
        raise HTTPException(status_code=400, detail="예산액은 0 이상이어야 합니다.")
    with get_conn() as conn:
        period_id = _budget_period(conn, budget_id)
        conn.execute("UPDATE budgets SET amount = ?, memo = ? WHERE id = ?", (body.amount, body.memo.strip(), budget_id))
        return budget_overview(conn, period_id)


@app.delete("/budgets/{budget_id}")
def delete_budget(budget_id: int):
    with get_conn() as conn:
        period_id = _budget_period(conn, budget_id)
        conn.execute("DELETE FROM budgets WHERE id = ?", (budget_id,))
        return budget_overview(conn, period_id)


@app.get("/reports/settlement.xlsx")
def settlement_report(period_id: int):
    """선택한 기간(학기 전/1학기/여름방학/2학기)의 결산보고서 엑셀을 내려준다."""
    with get_conn() as conn:
        p = get_period(conn, period_id)
        expenses = [dict(r) for r in conn.execute(
            "SELECT * FROM expenses WHERE deleted_at IS NULL AND date BETWEEN ? AND ?", (p["start_date"], p["end_date"]))]
        budgets = [dict(r) for r in conn.execute(
            "SELECT event_name, category, amount FROM budgets WHERE period_id = ?", (period_id,))]
    period = f"{p['name']} ({p['start_date']} ~ {p['end_date']})"
    start, end = p["start_date"], p["end_date"]
    content = build_settlement(budgets, expenses, period)
    filename = f"settlement_{start}_{end}.xlsx"
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
        row = get_active_expense(conn, expense_id)
        todos = json.loads(row["ai_todos"]) if row["ai_todos"] else []
        if not 0 <= index < len(todos):
            raise HTTPException(status_code=404, detail="해당 항목을 찾을 수 없습니다.")
        todos[index]["done"] = body.done
        conn.execute("UPDATE expenses SET ai_todos = ? WHERE id = ?", (json.dumps(todos, ensure_ascii=False), expense_id))
        row = conn.execute("SELECT * FROM expenses WHERE id = ?", (expense_id,)).fetchone()
        return to_dict(row, conn)


@app.get("/bank/summary")
def bank_summary(term_id: int | None = None):
    """저장된 거래로 최근 잔액과 월별 입출금 합계를 돌려준다. (대시보드용)
    term_id를 주면 그 임기 범위 안의 마지막 잔액과 월별 합계(최근 3개월)를 돌려준다."""
    with get_conn() as conn:
        where, params = "", []
        if term_id is not None:
            start, end = term_range(conn, term_id)
            where, params = "AND datetime BETWEEN ? AND ?", [start, end + "T23:59:59"]
        latest = conn.execute(
            f"SELECT datetime, balance FROM bank_transactions WHERE balance IS NOT NULL {where} ORDER BY datetime DESC, id DESC LIMIT 1",
            params,
        ).fetchone()
        months = conn.execute(
            f"""
            SELECT substr(datetime, 1, 7) AS month,
                   SUM(CASE WHEN direction = '입금' THEN amount ELSE 0 END) AS deposit,
                   SUM(CASE WHEN direction = '출금' THEN amount ELSE 0 END) AS withdraw
            FROM bank_transactions WHERE 1=1 {where} GROUP BY month ORDER BY month DESC LIMIT 3
            """,
            params,
        ).fetchall()
    return {
        "balance": latest["balance"] if latest else None,
        "as_of": latest["datetime"] if latest else None,
        "months": [dict(m) for m in months],
    }
