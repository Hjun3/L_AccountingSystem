"""DB 연결 등 여러 파일에서 같이 쓰는 것"""
import os
import sqlite3
from datetime import datetime
from pathlib import Path

# 데이터(DB 파일, 증빙 파일)를 둘 폴더. 배포할 때는 DATA_DIR 환경변수로 지워지지 않는 디스크(볼륨)를 가리킨다.
DATA_DIR = Path(os.getenv("DATA_DIR") or Path(__file__).parent)
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "expenses.db"


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row  # 결과를 딕셔너리처럼 꺼낼 수 있게 함
    return conn


def now_text():
    return datetime.now().isoformat(timespec="seconds")
