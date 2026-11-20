"""全局配置：全部来自环境变量 / .env，便于容器化部署。"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parents[2]          # 重构源码/backend
REPO_DIR = BASE_DIR.parent                              # 重构源码


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"), env_file_encoding="utf-8", extra="ignore"
    )

    app_name: str = "内容中转平台"
    api_prefix: str = "/api/v1"
    debug: bool = False

    # ---- 数据库：默认 SQLite，生产换 PostgreSQL ----
    database_url: str = f"sqlite:///{(BASE_DIR / 'data' / 'app.db').as_posix()}"
    db_echo: bool = False

    # ---- 认证 ----
    jwt_secret: str = "change-me-in-production-please-set-JWT_SECRET"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 720
    refresh_token_days: int = 14
    admin_initial_password: str = "demo1234"
    # 首次启动唯一账号：超级管理员（部署时按需覆盖，登录后可在「个人资料」自行修改）
    admin_initial_username: str = "linan"
    admin_initial_name: str = "林岸"

    # ---- 存储 ----
    storage_backend: str = "local"                      # local | s3（预留）
    storage_root: Path = REPO_DIR / "storage"
    max_upload_mb: int = 2048
    storage_quota_bytes: int = 200 * 1024 * 1024 * 1024

    # ---- 媒体处理 ----
    ffmpeg_path: str = "ffmpeg"
    ffprobe_path: str = "ffprobe"
    render_engine: str = "auto"                         # auto | ffmpeg | copy

    # ---- Worker ----
    worker_mode: str = "inline"                         # inline（默认，免 Redis）| external
    worker_concurrency: int = 2
    claim_timeout_minutes: int = 30

    # ---- AI ----
    ai_provider: str = "deepseek"
    ai_base_url: str = "https://api.deepseek.com/v1"
    ai_model: str = "deepseek-chat"
    ai_api_key: str = ""
    ai_timeout_seconds: int = 60

    # ---- 前端 ----
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    serve_frontend: bool = True

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def frontend_dist(self) -> Path:
        return REPO_DIR / "frontend" / "dist"


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    s.storage_root.mkdir(parents=True, exist_ok=True)
    (BASE_DIR / "data").mkdir(parents=True, exist_ok=True)
    return s


settings = get_settings()
