"""DB 연결 등 여러 파일에서 같이 쓰는 것"""
import sqlite3
from datetime import datetime
from pathlib import Path

DB_PATH = Path(__file__).parent / "expenses.db"


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row  # 결과를 딕셔너리처럼 꺼낼 수 있게 함
    return conn


def now_text():
    return datetime.now().isoformat(timespec="seconds")
