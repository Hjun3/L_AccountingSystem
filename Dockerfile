# 배포용 이미지: 1단계에서 화면(React)을 빌드하고, 2단계에서 파이썬 서버가 화면과 API를 함께 내보낸다.
FROM node:22-slim AS web
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.13-slim
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/ backend/
COPY --from=web /app/frontend/dist frontend/dist
WORKDIR /app/backend
# DATA_DIR: DB와 증빙 파일을 둘 곳. Railway에서는 이 경로에 볼륨(지워지지 않는 디스크)을 연결한다.
ENV DATA_DIR=/data COOKIE_SECURE=1
CMD ["sh", "-c", "uvicorn serve:app --host 0.0.0.0 --port ${PORT:-8000}"]
