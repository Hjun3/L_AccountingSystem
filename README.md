# 학생회 회계 점검 동료

학생회 총무가 지출을 등록하면 AI가 회계 규정을 근거로 감사 이슈를 미리 점검해 주는 서비스입니다.

## 현재 진행 상황
- [x] 1단계: 지출 등록 (입력 → 저장 → 목록 표시)
- [x] 2단계: AI 점검 (저장 시 OpenAI가 규정을 근거로 점검, 결과는 DB에 저장)
- [x] 3단계: 점검 결과 표시
- [x] 4단계: 총무 결정(확정/소명/취소, 결정 이력 기록)
- [x] 추가: 페이지 분리(대시보드, 지출 등록/목록/상세, 캘린더, 규정 보기)
- [x] 추가: 메모, 증빙 파일 첨부, 영수증 사진 읽기(AI), 거래내역 엑셀 불러오기(비밀번호 파일 포함)
- [x] 추가: 예산 관리, 결산보고서 엑셀, AI '챙길 것' 체크리스트, 사필영수증·도안 요청서 인쇄, 통장 잔액 현황
- [x] 실제 OpenAI 키로 점검 결과 확인 (샘플 10건 + 화면 등록 1건)

## 임시 데이터 안내
- 회계 규정: `backend/regulations/default.txt`는 **시연용 임시 규정**입니다. 총학생회칙 재정 조항 원문 발췌(제1부)와, 감사 제출 자료의 양식을 바탕으로 추정한 관행(제2부, 실제 규정 아님)으로 구성되어 있습니다. 실제 학생회 규정을 받으면 이 파일만 교체합니다.
- 지출 데이터: `backend/sample_data/expenses.json`은 **가상으로 만든 샘플 지출**입니다.
- 예산·일정: `backend/sample_data/demo_data.json`은 **가상으로 만든 시연용 예산과 일정**입니다.
- 거래내역: `backend/sample_data/kakaobank_sample.xlsx`, `tossbank_sample.xlsx`는 카카오뱅크·토스뱅크 양식을 흉내 낸 **가상 거래내역**입니다. 실제 은행 파일 양식과 다를 수 있습니다. 점검 결과는 미리 정해두지 않고, 넣을 때 실제 OpenAI 호출로 만들어집니다.

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
npm ci
npm run dev
```

처음 한 번, 첫 관리자 계정을 만듭니다 (백엔드 폴더에서). 다른 계정은 로그인 후 '사용자 관리'에서 만듭니다.
```bash
python create_admin.py
```

시연용 가상 데이터(예산, 일정, 거래내역, 지출)를 넣으려면 (백엔드 폴더에서)
여러 번 실행해도 이미 들어간 데이터는 건너뜁니다. 지출 10건은 실제 AI 점검을 거치므로 토큰이 듭니다.
```bash
python sample_data/load_samples.py
```

AI 호출 없이 예산·일정·거래내역만 넣으려면
```bash
python sample_data/load_samples.py --no-ai
```

(`npm ci`는 `package-lock.json`에 적힌 버전 그대로 설치합니다. 백엔드도 `requirements.txt`에 버전이 고정되어 있습니다. Python 3.13에서 확인했습니다.)

브라우저에서 http://localhost:5173 을 열면 됩니다.
지출 데이터는 backend/expenses.db 파일에 저장됩니다. (GitHub에는 올라가지 않음)
