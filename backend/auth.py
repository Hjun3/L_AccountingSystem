"""로그인과 권한 관리.

역할(role)
  admin     관리자: 모든 기능 + 사용자 관리 + 기록 보기
  treasurer 총무:   회계 작업 전부 (등록·수정·삭제·결정·예산·불러오기)
  viewer    열람:   보기만 가능

로그인하면 서버가 무작위 세션 토큰을 만들어 쿠키(HttpOnly)로 보낸다.
이후 요청마다 쿠키의 토큰으로 누구인지 확인하고, 경로·요청 종류에 따라 권한을 검사한다.
비밀번호는 원문을 저장하지 않고 scrypt로 바꾼 값(해시)만 저장한다.
"""
import hashlib
import hmac
import os
import secrets
import time
from contextvars import ContextVar
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from db import get_conn, now_text

ROLES = {"admin": "관리자", "treasurer": "총무", "viewer": "열람"}
COOKIE_NAME = "session"
SESSION_DAYS = 7
# 배포해서 https로 접속할 때는 .env에 COOKIE_SECURE=1 을 넣는다 (쿠키를 https로만 보냄)
COOKIE_SECURE = os.getenv("COOKIE_SECURE") == "1"
MIN_PASSWORD_LENGTH = 8
MAX_FAILS, LOCK_SECONDS = 5, 300  # 비밀번호 5번 틀리면 5분 잠금

# 지금 요청을 보낸 사용자. 기록(누가 했는지)을 남길 때 쓴다.
current_session: ContextVar[str | None] = ContextVar("current_session", default=None)  # 지금 요청의 세션(해시)
current_user: ContextVar[dict | None] = ContextVar("current_user", default=None)

# 로그인 실패 횟수 {아이디: (실패 횟수, 마지막 실패 시각)} (서버를 껐다 켜면 초기화)
_failed_logins: dict[str, tuple[int, float]] = {}


# ---------- 비밀번호 ----------

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, salt_hex, digest_hex = stored.split("$")
        digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt_hex), n=2**14, r=8, p=1)
        return hmac.compare_digest(digest.hex(), digest_hex)
    except ValueError:
        return False


def check_password_rule(password: str):
    if len(password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(status_code=400, detail=f"비밀번호는 {MIN_PASSWORD_LENGTH}자 이상이어야 합니다.")


def token_hash(token: str | None) -> str:
    """세션 토큰은 DB에 원문 대신 해시로 저장한다. DB 파일이 새어 나가도 그 값으로는 로그인할 수 없다."""
    return hashlib.sha256((token or "").encode()).hexdigest()


# ---------- DB ----------

def init_auth_tables(conn):
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            display_name TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 1,
            must_change_password INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            expires_at TEXT NOT NULL
        )
        """
    )
    # 내 정보 > 로그인된 곳: 언제 로그인했는지, 어떤 브라우저인지, 마지막으로 쓴 때
    columns = [c["name"] for c in conn.execute("PRAGMA table_info(sessions)")]
    for col in ("created_at", "user_agent", "last_seen"):
        if col not in columns:
            conn.execute(f"ALTER TABLE sessions ADD COLUMN {col} TEXT")


def create_user(conn, username, display_name, password, role, must_change=True):
    if role not in ROLES:
        raise HTTPException(status_code=400, detail="알 수 없는 역할입니다.")
    username = username.strip()
    if not username or not display_name.strip():
        raise HTTPException(status_code=400, detail="아이디와 이름을 입력하세요.")
    check_password_rule(password)
    if conn.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
        raise HTTPException(status_code=400, detail="이미 있는 아이디입니다.")
    conn.execute(
        "INSERT INTO users (username, display_name, password_hash, role, must_change_password, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (username, display_name.strip(), hash_password(password), role, int(must_change), now_text()),
    )


def public_user(row) -> dict:
    """비밀번호 해시를 뺀, 화면에 보내도 되는 사용자 정보"""
    return {
        "id": row["id"], "username": row["username"], "display_name": row["display_name"],
        "role": row["role"], "role_label": ROLES[row["role"]], "is_active": bool(row["is_active"]),
        "must_change_password": bool(row["must_change_password"]), "created_at": row["created_at"],
    }


def device_name(user_agent: str | None) -> str:
    """브라우저 정보 글자에서 '크롬 · Windows'처럼 짧은 이름을 만든다 (모르면 '알 수 없는 기기')"""
    ua = user_agent or ""
    browser = next((name for key, name in [("Whale", "웨일"), ("SamsungBrowser", "삼성 인터넷"), ("Edg", "엣지"),
                                            ("Firefox", "파이어폭스"), ("Chrome", "크롬"), ("Safari", "사파리")] if key in ua), "")
    system = next((name for key, name in [("iPhone", "iPhone"), ("iPad", "iPad"), ("Android", "Android"),
                                           ("Windows", "Windows"), ("Mac OS", "Mac"), ("Linux", "Linux")] if key in ua), "")
    if not ua:
        return "기기 정보 없음 (예전 로그인)"  # 기기 정보를 저장하기 전에 로그인한 것
    return " · ".join(x for x in (browser, system) if x) or "알 수 없는 기기"


# ---------- 요청마다 로그인·권한 확인 (미들웨어) ----------

def required_role(method: str, path: str) -> set[str] | None:
    """이 요청에 필요한 역할. None이면 로그인만 되어 있으면 됨."""
    if path.startswith("/users") or path.startswith("/logs"):
        return {"admin"}
    if path.startswith("/auth/"):
        return None
    if path.startswith("/terms") and method != "GET":
        return {"admin"}  # 새 임기 만들기는 관리자만
    if method == "GET":
        return None  # 보기는 모든 역할 가능
    return {"admin", "treasurer"}  # 등록·수정·삭제는 관리자와 총무만


def _deny(status, detail):
    return JSONResponse(status_code=status, content={"detail": detail})


async def auth_middleware(request: Request, call_next):
    path, method = request.url.path, request.method
    # 로그인 요청과 브라우저의 사전 확인 요청(OPTIONS)은 로그인 없이 통과
    if method == "OPTIONS" or (path == "/auth/login" and method == "POST"):
        return await call_next(request)

    token = request.cookies.get(COOKIE_NAME)
    user = None
    if token:
        with get_conn() as conn:
            row = conn.execute(
                "SELECT u.*, s.last_seen FROM sessions s JOIN users u ON u.id = s.user_id "
                "WHERE s.token = ? AND s.expires_at > ? AND u.is_active = 1",
                (token_hash(token), now_text()),
            ).fetchone()
            user = public_user(row) if row else None
            # '마지막 사용' 시각: 매 요청마다 쓰면 DB 쓰기가 많아서 5분에 한 번만 고친다
            five_min_ago = (datetime.now() - timedelta(minutes=5)).isoformat(timespec="seconds")
            if row and (row["last_seen"] or "") < five_min_ago:
                conn.execute("UPDATE sessions SET last_seen = ? WHERE token = ?", (now_text(), token_hash(token)))
    if user is None:
        return _deny(401, "로그인이 필요합니다.")

    # 임시 비밀번호로 들어온 사용자는 비밀번호를 바꾸기 전까지 다른 기능을 못 쓴다
    if user["must_change_password"] and path not in ("/auth/me", "/auth/password", "/auth/logout"):
        return _deny(403, "임시 비밀번호입니다. 먼저 비밀번호를 바꿔 주세요.")

    roles = required_role(method, path)
    if roles is not None and user["role"] not in roles:
        return _deny(403, f"권한이 없습니다. ({user['role_label']} 계정)")

    current_user.set(user)
    current_session.set(token_hash(token))
    return await call_next(request)


# ---------- 로그인/로그아웃/비밀번호 ----------

router = APIRouter()


class LoginIn(BaseModel):
    username: str
    password: str


@router.post("/auth/login")
def login(body: LoginIn, request: Request, response: Response):
    username = body.username.strip()
    fails, last = _failed_logins.get(username, (0, 0))
    if fails >= MAX_FAILS and time.time() - last < LOCK_SECONDS:
        raise HTTPException(status_code=429, detail="로그인을 여러 번 실패해 5분간 잠겼습니다. 잠시 후 다시 시도하세요.")

    with get_conn() as conn:
        row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        if row is None or not verify_password(body.password, row["password_hash"]) or not row["is_active"]:
            _failed_logins[username] = (fails + 1 if time.time() - last < LOCK_SECONDS else 1, time.time())
            # 아이디가 없는지 비밀번호가 틀린지 알려 주지 않는다 (아이디 추측 방지)
            raise HTTPException(status_code=401, detail="아이디 또는 비밀번호가 맞지 않습니다.")
        _failed_logins.pop(username, None)
        token = secrets.token_urlsafe(32)
        expires = (datetime.now() + timedelta(days=SESSION_DAYS)).isoformat(timespec="seconds")
        conn.execute("DELETE FROM sessions WHERE expires_at <= ?", (now_text(),))  # 만료된 세션 정리
        conn.execute(
            "INSERT INTO sessions (token, user_id, expires_at, created_at, user_agent, last_seen) VALUES (?, ?, ?, ?, ?, ?)",
            (token_hash(token), row["id"], expires, now_text(), (request.headers.get("user-agent") or "")[:300], now_text()),
        )
    response.set_cookie(
        COOKIE_NAME, token, max_age=SESSION_DAYS * 86400,
        httponly=True,  # 자바스크립트에서 쿠키를 못 읽게 함 (해킹된 스크립트가 토큰을 훔치지 못하게)
        samesite="lax",  # 다른 사이트에서 몰래 보낸 요청에는 쿠키가 안 붙음
        secure=COOKIE_SECURE,
    )
    return public_user(row)


@router.post("/auth/logout")
def logout(request: Request, response: Response):
    with get_conn() as conn:
        conn.execute("DELETE FROM sessions WHERE token = ?", (token_hash(request.cookies.get(COOKIE_NAME)),))
    response.delete_cookie(COOKIE_NAME)
    return {"ok": True}


@router.get("/auth/me")
def me():
    return current_user.get()


class PasswordIn(BaseModel):
    current_password: str
    new_password: str


@router.post("/auth/password")
def change_password(body: PasswordIn, request: Request):
    user = current_user.get()
    check_password_rule(body.new_password)
    with get_conn() as conn:
        row = conn.execute("SELECT password_hash FROM users WHERE id = ?", (user["id"],)).fetchone()
        if not verify_password(body.current_password, row["password_hash"]):
            raise HTTPException(status_code=400, detail="현재 비밀번호가 맞지 않습니다.")
        conn.execute(
            "UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?",
            (hash_password(body.new_password), user["id"]),
        )
        # 다른 기기에 로그인된 세션은 끊는다 (지금 쓰는 세션만 남김)
        conn.execute("DELETE FROM sessions WHERE user_id = ? AND token != ?", (user["id"], token_hash(request.cookies.get(COOKIE_NAME))))
    return {"ok": True}


# ---------- 내 정보 (모든 역할이 자기 것만) ----------

class MeIn(BaseModel):
    display_name: str


@router.patch("/auth/me")
def update_me(body: MeIn):
    """내 이름 바꾸기. 기록에는 그때의 이름(아이디)이 남으므로 예전 기록은 예전 이름 그대로 보인다."""
    name = body.display_name.strip()
    if not 1 <= len(name) <= 20:
        raise HTTPException(status_code=400, detail="이름은 1~20자로 입력하세요.")
    user = current_user.get()
    with get_conn() as conn:
        conn.execute("UPDATE users SET display_name = ? WHERE id = ?", (name, user["id"]))
        return public_user(conn.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone())


@router.get("/auth/sessions")
def my_sessions():
    """로그인된 곳 목록 (내 것만). id는 세션 값의 앞 12자리라 이것만으로는 로그인할 수 없다."""
    user, mine = current_user.get(), current_session.get()
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT token, created_at, user_agent, last_seen FROM sessions WHERE user_id = ? AND expires_at > ? "
            "ORDER BY (token = ?) DESC, COALESCE(last_seen, created_at) DESC",
            (user["id"], now_text(), mine),
        ).fetchall()
    return [{"id": r["token"][:12], "device": device_name(r["user_agent"]), "created_at": r["created_at"],
             "last_seen": r["last_seen"], "current": r["token"] == mine} for r in rows]


@router.post("/auth/sessions/logout-others")
def logout_other_sessions():
    """지금 이 기기만 남기고 다른 곳의 로그인을 모두 끊는다"""
    user = current_user.get()
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM sessions WHERE user_id = ? AND token != ?", (user["id"], current_session.get()))
    return {"logged_out": cur.rowcount}


@router.delete("/auth/sessions/{session_id}")
def logout_one_session(session_id: str):
    """로그인된 곳 하나 끊기 (내 세션만, 지금 기기는 '로그아웃' 버튼으로)"""
    user = current_user.get()
    if current_session.get().startswith(session_id):
        raise HTTPException(status_code=400, detail="지금 이 기기는 왼쪽 아래 '로그아웃'으로 나가세요.")
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM sessions WHERE user_id = ? AND substr(token, 1, 12) = ?", (user["id"], session_id))
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="해당 로그인을 찾을 수 없습니다.")
    return {"ok": True}


# ---------- 사용자 관리 (관리자만, 미들웨어에서 /users 경로는 관리자만 통과) ----------

@router.get("/users")
def list_users():
    with get_conn() as conn:
        return [public_user(r) for r in conn.execute("SELECT * FROM users ORDER BY id")]


class UserCreateIn(BaseModel):
    username: str
    display_name: str
    role: str
    temp_password: str


@router.post("/users")
def add_user(body: UserCreateIn):
    with get_conn() as conn:
        # 새 계정은 임시 비밀번호로 만들고, 처음 로그인할 때 본인이 바꾸게 한다
        create_user(conn, body.username, body.display_name, body.temp_password, body.role, must_change=True)
        return [public_user(r) for r in conn.execute("SELECT * FROM users ORDER BY id")]


class UserUpdateIn(BaseModel):
    role: str | None = None
    is_active: bool | None = None


def _active_admin_count(conn, except_id):
    return conn.execute(
        "SELECT COUNT(*) FROM users WHERE role = 'admin' AND is_active = 1 AND id != ?", (except_id,)
    ).fetchone()[0]


@router.patch("/users/{user_id}")
def update_user(user_id: int, body: UserUpdateIn):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="해당 사용자를 찾을 수 없습니다.")
        role = body.role if body.role is not None else row["role"]
        active = body.is_active if body.is_active is not None else bool(row["is_active"])
        if role not in ROLES:
            raise HTTPException(status_code=400, detail="알 수 없는 역할입니다.")
        # 관리자가 한 명도 안 남게 되는 변경은 막는다 (아무도 사용자 관리를 못 하게 되므로)
        losing_admin = row["role"] == "admin" and row["is_active"] and (role != "admin" or not active)
        if losing_admin and _active_admin_count(conn, user_id) == 0:
            raise HTTPException(status_code=400, detail="마지막 관리자는 역할을 바꾸거나 비활성화할 수 없습니다. 다른 관리자를 먼저 지정하세요.")
        conn.execute("UPDATE users SET role = ?, is_active = ? WHERE id = ?", (role, int(active), user_id))
        if not active:
            conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))  # 비활성화하면 바로 로그아웃
        return [public_user(r) for r in conn.execute("SELECT * FROM users ORDER BY id")]


class ResetPasswordIn(BaseModel):
    temp_password: str


@router.post("/users/{user_id}/reset-password")
def reset_password(user_id: int, body: ResetPasswordIn):
    check_password_rule(body.temp_password)
    with get_conn() as conn:
        cur = conn.execute(
            "UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?",
            (hash_password(body.temp_password), user_id),
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="해당 사용자를 찾을 수 없습니다.")
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
    return {"ok": True}
