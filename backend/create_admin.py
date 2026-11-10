"""첫 관리자 계정을 만드는 스크립트 (서버 컴퓨터에서 한 번만 실행).

사이트에서 아무나 첫 관리자를 만들 수 있으면, 배포 직후 다른 사람이 먼저 만들 수 있어 위험하다.
그래서 첫 관리자만 이 스크립트로 만들고, 나머지 계정은 관리자가 사이트에서 만든다.

실행 (backend 폴더에서):  python create_admin.py
"""
from getpass import getpass

from fastapi import HTTPException

import main  # noqa: F401  (DB 테이블을 만들기 위해 불러옴)
from auth import create_user
from db import get_conn

username = input("관리자 아이디: ").strip()
display_name = input("이름 (화면에 보일 이름): ").strip()
password = getpass("비밀번호 (8자 이상, 입력해도 화면에 안 보임): ")
if password != getpass("비밀번호 다시 입력: "):
    raise SystemExit("두 비밀번호가 다릅니다.")

try:
    with get_conn() as conn:
        create_user(conn, username, display_name, password, "admin", must_change=False)
    print(f"관리자 '{username}' 계정을 만들었습니다. 사이트에서 로그인하세요.")
except HTTPException as e:
    raise SystemExit(f"실패: {e.detail}")
