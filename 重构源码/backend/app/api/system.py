"""系统：服务状态 / 设置 / 默认水印 / 存储用量。v1.1 起 admin 与 super 等价可用。"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.config import settings as env
from app.core.db import get_db
from app.core.security import require_admin
from app.models import ServiceStatus, Task, User
from app.schemas import ServiceStatusOut, SystemSettingsOut, SystemSettingsPatch, WatermarkPayload
from app.services import settings_service
from app.storage import ffmpeg_available, storage
from sqlalchemy import select

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/status", response_model=ServiceStatusOut)
def status(db: Session = Depends(get_db), _: User = Depends(require_admin)) -> ServiceStatusOut:
    row = db.get(ServiceStatus, 1)
    if row is None:
        running = db.query(Task).filter(Task.status == "processing").count()
        pending = db.query(Task).filter(Task.status == "pending").count()
        row = ServiceStatus(
            id=1,
            service_name=env.app_name,
            state="online",
            node="api",
            running=running,
            pending=pending,
            summary=f"running={running} pending={pending}",
            heartbeat_at=datetime.now(timezone.utc),
        )
        db.add(row)
        db.commit()
        db.refresh(row)
    return ServiceStatusOut.model_validate(row)


@router.get("/settings", response_model=SystemSettingsOut)
def get_settings(db: Session = Depends(get_db), _: User = Depends(require_admin)) -> SystemSettingsOut:
    data = settings_service.public_settings(db)
    data["storage"] = {**data["storage"], **settings_service.storage_usage(db)}
    data["storage"]["ffmpeg_available"] = ffmpeg_available()
    return SystemSettingsOut.model_validate(data)


@router.patch("/settings", response_model=SystemSettingsOut)
def patch_settings(
    payload: SystemSettingsPatch,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> SystemSettingsOut:
    settings_service.patch_settings(db, payload.model_dump(exclude_none=True))
    return get_settings(db=db, _=_)


@router.get("/watermark-default")
def get_watermark_default(db: Session = Depends(get_db), _: User = Depends(require_admin)) -> dict:
    return settings_service.get_watermark_default(db)


@router.put("/watermark-default")
def put_watermark_default(
    payload: WatermarkPayload,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> dict:
    return settings_service.put_watermark_default(db, payload)


@router.post("/watermark-default/reset")
def reset_watermark_default(db: Session = Depends(get_db), _: User = Depends(require_admin)) -> dict:
    return settings_service.reset_watermark_default(db)


@router.get("/storage")
def storage_usage(db: Session = Depends(get_db), _: User = Depends(require_admin)) -> dict:
    usage = settings_service.storage_usage(db)
    return {
        **usage,
        "backend": storage.backend,
        "root": str(storage.root),
        "ffmpeg_available": ffmpeg_available(),
    }
