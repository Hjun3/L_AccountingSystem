"""배포용 실행 파일: 화면(React 빌드 결과)과 API를 한 주소에서 함께 내보낸다.

- /api/... 로 오는 요청은 앞의 /api 를 떼고 main.py의 API로 보낸다. (화면 주소 /expenses 와 API 주소 /expenses 가 겹치지 않게)
- 그 밖의 주소는 frontend/dist 의 파일을 보내고, 없는 주소(예: /expenses/3)는 index.html 을 보내 React가 화면을 고르게 한다.
실행: uvicorn serve:app --host 0.0.0.0 --port 8000   (backend 폴더에서, 먼저 frontend에서 npm run build)
개발할 때는 지금처럼 uvicorn main:app 과 npm run dev 를 따로 쓴다.
"""
import os
from pathlib import Path

from starlette.responses import FileResponse

from main import app as api

DIST = Path(os.getenv("FRONTEND_DIST") or Path(__file__).parent.parent / "frontend" / "dist").resolve()


async def app(scope, receive, send):
    path = scope.get("path", "")
    if scope["type"] == "lifespan" or path == "/api" or path.startswith("/api/"):
        if scope["type"] != "lifespan":
            scope = {**scope, "path": path[4:] or "/", "raw_path": (path[4:] or "/").encode()}
        return await api(scope, receive, send)
    file = (DIST / path.lstrip("/")).resolve()
    if not file.is_file() or DIST not in file.parents:  # 없는 파일이거나 dist 밖을 가리키면 index.html
        file = DIST / "index.html"
    await FileResponse(file)(scope, receive, send)
