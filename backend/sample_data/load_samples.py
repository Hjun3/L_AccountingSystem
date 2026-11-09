"""시연용 가상 지출 데이터를 DB에 넣는 스크립트.

각 지출은 실제 앱과 똑같이 AI 점검(OpenAI 호출)을 거친 뒤 저장된다.
(점검 결과를 미리 정해두지 않음)

실행: backend 폴더에서  python sample_data/load_samples.py
"""
import json
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(BACKEND_DIR))  # backend 폴더의 main.py를 불러올 수 있게 함

from fastapi import HTTPException  # noqa: E402

from main import ExpenseIn, create_expense  # noqa: E402

samples = json.loads((Path(__file__).parent / "expenses.json").read_text(encoding="utf-8"))

for item in samples:
    try:
        saved = create_expense(ExpenseIn(**item))
        print(f"[{saved['ai_status']}] {item['description']} - {saved['ai_clause']}: {saved['ai_reason']}")
    except HTTPException as e:
        print(f"[실패] {item['description']} - {e.detail}")
