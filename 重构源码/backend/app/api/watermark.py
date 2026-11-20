"""水印路由：单帧预览 + 方案模板 CRUD。"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.core.errors import invalid, not_found
from app.core.security import current_user, require_editor
from app.models import Asset, User, WatermarkConfig
from app.schemas import WatermarkConfigIn, WatermarkConfigOut, WatermarkPayload
from app.services import asset_service, watermark_service
from app.storage import storage

router = APIRouter(prefix="/watermark", tags=["watermark"])

PREVIEW_TTL = 300


@router.post("/preview")
def preview(
    watermark_config: str = Form(...),
    asset_id: str | None = Form(None),
    at_seconds: float | None = Form(None),
    file: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_editor),
) -> dict:
    try:
        cfg = WatermarkPayload(**json.loads(watermark_config))
    except (json.JSONDecodeError, ValueError) as exc:
        raise invalid("WATERMARK_INVALID", f"水印配置非法：{exc}")
    cfg.validate_rules()

    tmp_key = None
    if file is not None:
        tmp_key = f"tmp/preview/{uuid.uuid4().hex}{'.' + (file.filename or 'mp4').rsplit('.', 1)[-1]}"
        storage.save_stream(tmp_key, file.file)
        src_path = storage.path_of(tmp_key)
        width = 1920
        duration = 0
    elif asset_id:
        asset = asset_service.get(db, asset_id)
        src_path = storage.path_of(asset.storage_key)
        width = asset.width or 1920
        duration = asset.duration_seconds or 0
    else:
        raise invalid("SOURCE_VIDEO_REQUIRED", "请提供 asset_id 或直接上传文件")

    if not src_path.exists():
        raise not_found("ASSET_NOT_FOUND", "源文件已丢失")

    logo_path = None
    if cfg.logo_on and cfg.logo_asset_id:
        logo = db.get(Asset, cfg.logo_asset_id)
        if logo and logo.deleted_at is None:
            p = storage.path_of(logo.storage_key)
            logo_path = p if p.exists() else None

    token = uuid.uuid4().hex
    out_key = f"previews/{token}.jpg"
    at = at_seconds if at_seconds and at_seconds > 0 else max(1.0, (duration or 10) * 0.1)
    ok = watermark_service.preview_frame(
        src_path,
        storage.path_of(out_key),
        cfg.model_dump(),
        at_seconds=at,
        width=width,
        logo_path=logo_path,
    )
    if tmp_key:
        storage.delete(tmp_key)
    if not ok:
        raise invalid(
            "MEDIA_METADATA_INVALID",
            "无法生成预览帧（未检测到 ffmpeg 或视频无法解码），可直接提交任务由服务端渲染",
        )
    return {"preview_url": f"{settings.api_prefix}/watermark/preview/{token}", "expires_in": PREVIEW_TTL}


@router.get("/preview/{token}")
def preview_file(token: str, _: User = Depends(current_user)):
    if not token.isalnum():
        raise not_found("NOT_FOUND", "预览不存在")
    key = f"previews/{token}.jpg"
    if not storage.exists(key):
        raise not_found("NOT_FOUND", "预览已过期，请重新生成")
    path = storage.path_of(key)
    age = (datetime.now(timezone.utc).timestamp() - path.stat().st_mtime)
    if age > PREVIEW_TTL:
        storage.delete(key)
        raise not_found("NOT_FOUND", "预览已过期，请重新生成")
    return FileResponse(path, media_type="image/jpeg")


@router.get("/configs", response_model=list[WatermarkConfigOut])
def list_configs(db: Session = Depends(get_db), user: User = Depends(current_user)):
    rows = db.scalars(
        select(WatermarkConfig)
        .where(or_(WatermarkConfig.created_by == user.id, WatermarkConfig.is_default.is_(True)))
        .order_by(WatermarkConfig.is_default.desc(), WatermarkConfig.updated_at.desc())
    )
    return [WatermarkConfigOut.model_validate(r) for r in rows]


def _own(db: Session, user: User, config_id: str) -> WatermarkConfig:
    row = db.get(WatermarkConfig, config_id)
    if not row or (row.created_by != user.id and not row.is_default):
        raise not_found("NOT_FOUND", "水印方案不存在")
    return row


@router.post("/configs", response_model=WatermarkConfigOut, status_code=201)
def create_config(
    payload: WatermarkConfigIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_editor),
) -> WatermarkConfigOut:
    payload.config.validate_rules()
    if payload.is_default:
        for row in db.scalars(
            select(WatermarkConfig).where(
                WatermarkConfig.created_by == user.id, WatermarkConfig.is_default.is_(True)
            )
        ):
            row.is_default = False
            db.add(row)
    row = WatermarkConfig(
        name=payload.name.strip(),
        is_default=payload.is_default,
        config=payload.config.model_dump(),
        created_by=user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return WatermarkConfigOut.model_validate(row)


@router.get("/configs/{config_id}", response_model=WatermarkConfigOut)
def get_config(
    config_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)
):
    return WatermarkConfigOut.model_validate(_own(db, user, config_id))


@router.patch("/configs/{config_id}", response_model=WatermarkConfigOut)
def update_config(
    config_id: str,
    payload: WatermarkConfigIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_editor),
) -> WatermarkConfigOut:
    row = _own(db, user, config_id)
    if row.created_by != user.id:
        from app.core.errors import forbidden

        raise forbidden("只能修改自己创建的方案")
    payload.config.validate_rules()
    if payload.is_default and not row.is_default:
        for other in db.scalars(
            select(WatermarkConfig).where(
                WatermarkConfig.created_by == user.id, WatermarkConfig.is_default.is_(True)
            )
        ):
            other.is_default = False
            db.add(other)
    row.name = payload.name.strip()
    row.is_default = payload.is_default
    row.config = payload.config.model_dump()
    db.add(row)
    db.commit()
    db.refresh(row)
    return WatermarkConfigOut.model_validate(row)


@router.delete("/configs/{config_id}", status_code=204)
def delete_config(
    config_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_editor),
):
    from fastapi import Response

    row = _own(db, user, config_id)
    if row.created_by != user.id:
        from app.core.errors import forbidden

        raise forbidden("只能删除自己创建的方案")
    db.delete(row)
    db.commit()
    return Response(status_code=204)
