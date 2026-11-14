# 짝장부 (학생회 회계 도우미)

학생회 총무가 평소 하는 회계 일(지출 기록, 증빙 정리, 예산 확인, 결산)을 덜어 주는 서비스입니다.
AI는 동료처럼 회계 규정을 근거로 "챙길 것"을 알려 주고, 최종 결정은 총무가 합니다. (2026 AI 우왕톤, 주제: "AI는 동료가 될 수 있을까?")

## 주요 기능

**지출 기록**
- 지출 등록: 직접 입력하거나, 영수증 사진을 올리면 AI가 날짜·금액·내용을 읽고 사업명·지출 항목까지 추천해 채움 (총무가 확인 후 저장)
- AI 점검: 저장할 때 규정 파일을 근거로 점검해 문제 없음 / 확인 필요 / 조치 필요, 근거 조항, 이유, 챙길 것(할 일 목록)을 알려 줌
  - AI가 실패해도(장애·잔액 부족) 지출은 '점검 못 함'으로 저장되고, 그런 지출만 한 번 더 점검할 수 있음
- 총무 결정: 확정·취소. 확인·조치 필요 지출은 메모를 남겨야 확정. 모든 결정은 기록으로 남음
- 지출 상세: 수정·삭제(삭제는 표시만), 메모, 증빙 파일(사진·PDF) 첨부
- 거래내역 불러오기: 카카오뱅크·토스뱅크 엑셀(비밀번호 파일 포함)의 출금을 등록된 지출과 맞춰 보고, 빠진 출금은 바로 등록
- 감사 자가 점검: 감사 채점표 항목(공약 및 사업, 예·결산보고서, 영수증, 도안, 회계장부, 감사준비)별로 감점될 수 있는 지출·예산·통장 대조 결과를 모아 보여 줌

**예산·일정**
- 대시보드: 통장 잔액, 최근 입출금, 예산 사용률, 챙길 것, 결정 기다리는 지출, 다가오는 일정, 사업별·월별 지출
- 예산·결산: 임기별 4개 기간(학기 전/1학기/여름방학/2학기) 예산 대비 지출, 사업 묶기(예: MT 사전답사 → MT), 결산보고서 엑셀
- 캘린더: 지출과 일정(여러 날 일정 가능)을 날짜별로 보고, 그 사업의 지출로 바로 이동

**인수인계·관리**
- 임기(연도)별 구분, 새 임기 만들기(지난 예산 구조 복사), 지난 학생회 자료 열람
- 역할: 관리자 / 총무 / 열람(보기만). 관리자 권한 넘기기, 모든 변경 기록 보기
- 내 정보: 이름·직책·비밀번호 변경, 내 활동 요약, 로그인된 기기 확인과 다른 기기 로그아웃, 내 최근 활동
- 사용량·백업(관리자): 달별 AI 사용량, 전체 데이터 백업 zip 내려받기

## AI 비용을 아끼는 방식
OpenAI 호출은 실제 비용이 들어서, 호출은 두 곳뿐입니다: 지출을 저장할 때 점검 1번, 영수증 읽기 버튼을 눌렀을 때 1번.
이미 점검된 지출을 다시 점검하는 기능은 두지 않았습니다 (수정한 지출은 "수정 전 내용 기준" 안내를 보여 줌).
한 달 사용 횟수가 `backend/.env`의 `AI_MONTHLY_WARN`(기본 300회)을 넘으면 경고를 띄웁니다. 막지는 않으며, 관리자는 '사용량·백업' 화면에서 사용량을 봅니다.

## 백업과 되살리기
관리자 '사용량·백업' 화면에서 [백업 내려받기]를 누르면 DB(`expenses.db`)와 증빙 파일(`uploads/`)이 zip 하나로 받아집니다.
되살릴 때는 백엔드를 끄고 `backend/expenses.db`와 `backend/uploads/`를 zip 안의 것으로 바꾼 뒤 다시 켭니다. 개인정보가 들어 있으니 GitHub 등에 올리지 마세요.

## 추후 개발
- 휴대폰 화면 정리와 다른 기기 접속(배포 준비)은 이번 대회 MVP 이후에 진행합니다.

## 임시 데이터 안내
- 회계 규정: `backend/regulations/default.txt`의 제1부는 **실제 충북대학교 총학생회칙**(2024.9.20 시행)의 재정 조항 원문입니다. 제2부는 총대의원회의 「2026 총무소양교육자료」와 「감사시행세칙」 중 지출 점검에 필요한 부분을 정리한 것입니다. 원본 규정·양식 파일은 `docs/raw/`에 있습니다.
- 지출 데이터: `backend/sample_data/expenses.json`은 **가상으로 만든 샘플 지출**입니다. 점검 결과는 미리 정해두지 않고, 넣을 때 실제 OpenAI 호출로 만들어집니다.
- 예산·일정: `backend/sample_data/demo_data.json`은 **가상으로 만든 시연용 예산과 일정**입니다.
- 거래내역: `backend/sample_data/kakaobank_sample.xlsx`, `tossbank_sample.xlsx`는 실제 카카오뱅크·토스뱅크 거래내역 파일을 바탕으로, **같은 양식에 내용만 가상으로 채운 거래내역**입니다.

## 개발 진행 (MVP)
- [x] 지출 등록 → AI 점검 → 결과 표시 → 총무 결정
- [x] 실제 OpenAI 키로 점검 결과 확인

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
여러 번 실행해도 이미 들어간 데이터는 건너뜁니다. 지출 38건은 실제 AI 점검을 거치므로 토큰이 듭니다 (새로 넣는 건만, 1건에 약 3천 토큰).
10월 이전 지출 중 AI가 '문제 없음'으로 본 것은 넣을 때 확정해 둡니다 (쓰던 장부처럼 보이게).
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

## 배포 (Railway)
화면과 API를 한 서버에서 함께 내보냅니다 (`Dockerfile`, `backend/serve.py`). 화면은 같은 주소의 `/api`로 API를 부릅니다.

1. Railway에서 New Project → Deploy from GitHub repo → 이 저장소 선택 (루트의 `Dockerfile`로 자동 빌드)
2. 서비스에 Volume을 추가하고 Mount path를 `/data`로 지정 (DB와 증빙 파일이 여기에 저장되어 재배포해도 남음)
3. Variables에 추가
   - `OPENAI_API_KEY`: OpenAI API 키
   - `OPENAI_MODEL`: (선택) 사용할 모델
   - `AI_MONTHLY_WARN`: (선택) 한 달 AI 사용 경고 기준, 기본 300
   - `DATA_DIR=/data`, `COOKIE_SECURE=1`은 Dockerfile에 이미 들어 있음
4. Settings → Networking → Generate Domain 으로 접속 주소 만들기
5. 첫 관리자 만들기: Railway CLI로 서버에 접속해 실행
   ```bash
   railway ssh
   ```
   ```bash
   python create_admin.py
   ```
6. (선택) 시연용 데이터: 같은 접속 화면에서 `python sample_data/load_samples.py --no-ai`
