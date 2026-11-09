# 학생회 회계 점검 동료

학생회 총무가 지출을 등록하면 AI가 회계 규정을 근거로 감사 이슈를 미리 점검해 주는 서비스입니다.

## 현재 진행 상황
- [x] 1단계: 지출 등록 (입력 → 저장 → 목록 표시)
- [x] 2단계: AI 점검 (저장 시 OpenAI가 규정을 근거로 점검, 결과는 DB에 저장)
- [ ] 3단계: 점검 결과 표시
- [ ] 4단계: 총무 결정(확정/소명)

## 임시 데이터 안내
- 회계 규정: `backend/regulations/default.txt`는 **시연용 임시 규정**입니다. 실제 규정 원문이 아니라 감사 제출 자료의 양식과 관행을 바탕으로 추정해 작성했습니다. 실제 학생회 규정을 받으면 이 파일만 교체합니다.
- 지출 데이터: `backend/sample_data/expenses.json`은 **가상으로 만든 샘플 지출**입니다. 점검 결과는 미리 정해두지 않고, 넣을 때 실제 OpenAI 호출로 만들어집니다.

## 실행 방법

먼저 API 키를 설정합니다. `backend/.env.example`을 복사해 `backend/.env`로 만들고 OpenAI API 키를 넣으세요.
```bash
cp backend/.env.example backend/.env
```

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

샘플 지출을 넣으려면 (백엔드 폴더에서, 1번만 실행)
```bash
python sample_data/load_samples.py
```

브라우저에서 http://localhost:5173 을 열면 됩니다.
지출 데이터는 backend/expenses.db 파일에 저장됩니다. (GitHub에는 올라가지 않음)
