# 학생회 회계 점검 동료

학생회 총무가 지출을 등록하면 AI가 회계 규정을 근거로 감사 이슈를 미리 점검해 주는 서비스입니다.

## 현재 진행 상황
- [x] 1단계: 지출 등록 (입력 → 저장 → 목록 표시)
- [ ] 2단계: AI 점검
- [ ] 3단계: 점검 결과 표시
- [ ] 4단계: 총무 결정(확정/소명)

## 실행 방법

터미널 2개를 열어 각각 실행합니다.

백엔드 (http://localhost:8000)
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

프론트엔드 (http://localhost:5173)
```bash
cd frontend
npm install
npm run dev
```

브라우저에서 http://localhost:5173 을 열면 됩니다.
지출 데이터는 backend/expenses.db 파일에 저장됩니다. (GitHub에는 올라가지 않음)
