"""FastAPI 入口：中间件 / 路由挂载 / 启动初始化 / 前端静态托管。"""
from __future__ import annotations

import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api import articles, assets, auth, lexicon, prompts, system, tasks, users, watermark
from app.core.config import settings
from app.core.db import init_db
from app.core.errors import install_error_handlers
from app.seed import seed
from app.workers import runner


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    seed()
    runner.recover_stale()
    yield
    runner.shutdown()


def create_app() -> FastAPI:
    app = FastAPI(
        title=f"{settings.app_name} API",
        version="1.1.0",
        docs_url="/api/docs",
        openapi_url=f"{settings.api_prefix}/openapi.json",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_list or ["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Content-Disposition"],
    )

    @app.middleware("http")
    async def request_id(request: Request, call_next):
        rid = request.headers.get("X-Request-Id") or f"req_{uuid.uuid4().hex[:12]}"
        request.state.request_id = rid
        response = await call_next(request)
        response.headers["X-Request-Id"] = rid
        return response

    install_error_handlers(app)

    api = settings.api_prefix
    for router in (
        auth.router,
        users.router,
        tasks.router,
        assets.router,
        watermark.router,
        articles.router,
        prompts.router,
        system.router,
        lexicon.router,
    ):
        app.include_router(router, prefix=api)

    @app.get(f"{api}/health", tags=["ops"])
    def health() -> dict:
        """健康检查；同时暴露渲染能力，供前端如实提示降级情况。"""
        from app.storage import ffmpeg_available

        has_ffmpeg = ffmpeg_available()
        engine = "ffmpeg" if has_ffmpeg else "copy"
        if settings.render_engine in ("ffmpeg", "copy"):
            engine = settings.render_engine
        return {
            "ok": True,
            "service": settings.app_name,
            "version": "1.1.0",
            "render_engine": engine,
            "ffmpeg_available": has_ffmpeg,
        }

    @app.get("/", include_in_schema=False)
    def index():
        dist = settings.frontend_dist
        if settings.serve_frontend and (dist / "index.html").exists():
            from fastapi.responses import FileResponse

            return FileResponse(dist / "index.html")
        return JSONResponse(
            {
                "service": settings.app_name,
                "api": f"{api}/health",
                "docs": "/api/docs",
                "hint": "前端未构建：cd frontend && npm install && npm run build",
            }
        )

    dist = settings.frontend_dist
    if settings.serve_frontend and dist.exists():
        app.mount("/", StaticFiles(directory=dist, html=True), name="frontend")

    return app


app = create_app()
