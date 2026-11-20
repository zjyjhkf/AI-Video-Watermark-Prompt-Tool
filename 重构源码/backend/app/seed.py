"""首次启动的初始化：只创建唯一超级管理员账号 + 系统默认配置。

设计原则：
- **不写入任何示例业务数据**（素材 / 任务 / 草稿 / 水印方案 / 词库），
  避免演示内容混进真实使用环境；
- 配置只在「库里还没有账号」时写入，之后重启不会覆盖用户在设置页改过的值；
- 已有业务数据不会被清理，需要清空请执行 `scripts/purge_demo.py`。

账号信息来自环境变量（首次启动生效，登录后可在「个人资料」自行修改）：
    ADMIN_INITIAL_USERNAME / ADMIN_INITIAL_NAME / ADMIN_INITIAL_PASSWORD
"""
from __future__ import annotations

from sqlalchemy import select

from app.core.config import settings as env
from app.core.db import SessionLocal
from app.core.security import hash_password
from app.models import ServiceStatus, User
from app.services import settings_service


def _ensure_service_status(db) -> None:
    row = db.get(ServiceStatus, 1)
    if row is None:
        db.add(
            ServiceStatus(
                id=1,
                service_name=env.app_name,
                state="online",
                node="worker-1",
                running=0,
                pending=0,
                summary="idle",
            )
        )
        db.commit()


def seed() -> None:
    with SessionLocal() as db:
        has_user = db.scalars(select(User).limit(1)).first()
        if has_user:
            _ensure_service_status(db)
            return

        print("[seed] 初始化超级管理员与系统配置…")
        settings_service.set_section(
            db, "watermark_default", dict(settings_service.DEFAULT_WATERMARK)
        )
        for key, value in settings_service.SECTION_DEFAULTS.items():
            if key != "watermark_default":
                settings_service.set_section(db, key, dict(value))

        db.add(
            User(
                username=env.admin_initial_username.strip().lower(),
                name=env.admin_initial_name.strip(),
                role="super",
                scope_all=True,
                password_hash=hash_password(env.admin_initial_password),
                must_change_password=False,
            )
        )
        db.commit()
        _ensure_service_status(db)
        print(
            f"[seed] 完成：唯一账号 {env.admin_initial_username}（超级管理员），"
            "无任何示例素材 / 任务 / 草稿"
        )
