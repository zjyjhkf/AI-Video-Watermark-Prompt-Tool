"""素材服务：唯一文件实体（upload / task / draft 三来源共用）。"""
from __future__ import annotations

import io
import mimetypes
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import ApiError, invalid, not_found
from app.models import Asset, User
from app.schemas import AssetOut
from app.storage import ffmpeg_available, probe_media, storage

VIDEO_EXT = {"mp4", "mov", "mkv", "webm", "avi", "m4v"}
IMAGE_EXT = {"png", "jpg", "jpeg", "webp", "gif", "bmp"}
DOC_EXT = {"md", "txt", "pdf", "doc", "docx", "xls", "xlsx", "csv", "ppt", "pptx", "json"}


def kind_of(ext: str) -> str:
    e = ext.lower().lstrip(".")
    if e in VIDEO_EXT:
        return "video"
    if e in IMAGE_EXT:
        return "image"
    if e in DOC_EXT:
        return "document"
    return "other"


def ext_of(name: str) -> str:
    return (name.rsplit(".", 1)[-1] if "." in name else "").lower()


def stem_of(name: str) -> str:
    return name.rsplit(".", 1)[0] if "." in name else name


def human_size(n: int) -> str:
    if n >= 1024 * 1024:
        return f"{n / 1024 / 1024:.1f} MB"
    if n >= 1024:
        return f"{max(1, round(n / 1024))} KB"
    return f"{n} B"


def serialize(a: Asset) -> AssetOut:
    base = f"{settings.api_prefix}/assets/{a.id}"
    return AssetOut(
        id=a.id,
        name=a.name,
        type=a.type,
        ext=a.ext,
        mime=a.mime,
        size_bytes=a.size_bytes,
        source=a.source,
        source_task_id=a.source_task_id,
        ref_id=a.ref_id,
        folder=a.folder,
        duration_seconds=a.duration_seconds,
        width=a.width,
        height=a.height,
        created_by=a.created_by,
        created_at=a.created_at,
        download_url=f"{base}/download",
        thumbnail_url=f"{base}/thumbnail" if (a.thumbnail_key or a.type == "image") else None,
    )


def storage_key_for(asset_id: str, ext: str) -> str:
    now = datetime.now(timezone.utc)
    return f"assets/{now:%Y}/{now:%m}/{asset_id}{'.' + ext if ext else ''}"


def _make_thumbnail(asset: Asset, src: Path) -> None:
    """视频缩略图（ffmpeg 抽帧）。没有 ffmpeg 就留空，前端走占位图。"""
    if asset.type != "video" or not ffmpeg_available():
        return
    key = f"derived/{asset.id}/thumb.jpg"
    dst = storage.path_of(key)
    dst.parent.mkdir(parents=True, exist_ok=True)
    import subprocess

    cmd = [
        settings.ffmpeg_path,
        "-y",
        "-ss",
        "1",
        "-i",
        str(src),
        "-frames:v",
        "1",
        "-vf",
        "scale=640:-2",
        str(dst),
    ]
    try:
        subprocess.run(cmd, capture_output=True, timeout=60, check=True)
        if dst.exists() and dst.stat().st_size > 0:
            asset.thumbnail_key = key
    except (subprocess.SubprocessError, OSError):
        pass


def save_upload(db: Session, upload: UploadFile, user: User, folder: str | None = None) -> Asset:
    filename = upload.filename or "upload.bin"
    ext = ext_of(filename)
    kind = kind_of(ext)
    if kind == "other":
        raise ApiError("UNSUPPORTED_FILE_TYPE", f"不支持的文件类型：.{ext}", 415)

    asset_id = f"a_{uuid.uuid4().hex[:20]}"
    key = storage_key_for(asset_id, ext)
    size = storage.save_stream(key, upload.file)
    limit = settings.max_upload_mb * 1024 * 1024
    if size > limit:
        storage.delete(key)
        raise ApiError("FILE_TOO_LARGE", f"文件超过 {settings.max_upload_mb} MB", 413)

    meta: dict = {}
    if kind in ("video", "image"):
        probed = probe_media(storage.path_of(key))
        if kind == "video":
            if probed is None and not ffmpeg_available():
                meta = {"duration_seconds": None, "width": None, "height": None}
            elif probed is None or (probed.get("duration_seconds") in (None, 0)):
                storage.delete(key)
                raise invalid("MEDIA_METADATA_INVALID", "视频元信息解析失败，请确认文件未损坏")
            else:
                meta = probed
        elif probed:
            meta = probed

    asset = Asset(
        id=asset_id,
        name=stem_of(filename),
        type=kind,
        ext=ext.upper() or None,
        mime=upload.content_type or mimetypes.guess_type(filename)[0],
        size_bytes=size,
        source="upload",
        storage_key=key,
        folder=folder or "未分类",
        duration_seconds=meta.get("duration_seconds"),
        width=meta.get("width"),
        height=meta.get("height"),
        created_by=user.id,
    )
    _make_thumbnail(asset, storage.path_of(key))
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return asset


def create_internal(
    db: Session,
    *,
    name: str,
    ext: str,
    data: bytes,
    user_id: str,
    folder: str,
    source: str,
    ref_id: str | None = None,
    source_task_id: str | None = None,
    mime: str | None = None,
    kind: str | None = None,
    reuse: Asset | None = None,
) -> Asset:
    """写入内部产物（草稿 md / 成品视频），复用已有记录时覆盖内容不新增。"""
    ext = ext.lower().lstrip(".")
    if reuse is not None:
        reuse.size_bytes = storage.save_bytes(reuse.storage_key, data)
        reuse.updated_at = datetime.now(timezone.utc)
        reuse.folder = folder or reuse.folder
        db.add(reuse)
        db.commit()
        db.refresh(reuse)
        return reuse

    asset_id = f"a_{uuid.uuid4().hex[:20]}"
    key = f"{'drafts' if source == 'draft' else 'derived'}/{datetime.now(timezone.utc):%Y/%m}/{asset_id}.{ext}"
    storage.save_bytes(key, data)
    asset = Asset(
        id=asset_id,
        name=name,
        type=kind or kind_of(ext),
        ext=ext.upper(),
        mime=mime or mimetypes.guess_type(f"x.{ext}")[0],
        size_bytes=len(data),
        source=source,
        source_task_id=source_task_id,
        ref_id=ref_id,
        storage_key=key,
        folder=folder,
        created_by=user_id,
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return asset


def get(db: Session, asset_id: str) -> Asset:
    asset = db.get(Asset, asset_id)
    if not asset or asset.deleted_at is not None:
        raise not_found("ASSET_NOT_FOUND", "素材不存在或已删除")
    return asset


def list_assets(
    db: Session,
    user: User,
    *,
    page: int = 1,
    page_size: int = 24,
    type_: str | None = None,
    source: str | None = None,
    q: str | None = None,
    task_id: str | None = None,
    scope_all: bool = True,
) -> tuple[list[Asset], int]:
    stmt = select(Asset).where(Asset.deleted_at.is_(None))
    if not scope_all:
        stmt = stmt.where(Asset.created_by == user.id)
    if type_:
        stmt = stmt.where(Asset.type == type_)
    if source:
        stmt = stmt.where(Asset.source == source)
    if task_id:
        stmt = stmt.where(Asset.source_task_id == task_id)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Asset.name.ilike(like), Asset.ext.ilike(like)))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = list(
        db.scalars(
            stmt.order_by(Asset.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    )
    return rows, total


def counts_by_type(db: Session, user: User, scope_all: bool = True) -> dict:
    stmt = select(Asset.type, func.count(Asset.id)).where(Asset.deleted_at.is_(None))
    if not scope_all:
        stmt = stmt.where(Asset.created_by == user.id)
    stmt = stmt.group_by(Asset.type)
    return {t: c for t, c in db.execute(stmt).all()}


def soft_delete(db: Session, asset: Asset) -> None:
    asset.deleted_at = datetime.now(timezone.utc)
    db.add(asset)
    db.commit()


def batch_delete(db: Session, ids: list[str], user: User, scope_all: bool) -> int:
    n = 0
    for aid in ids:
        asset = db.get(Asset, aid)
        if not asset or asset.deleted_at is not None:
            continue
        if not scope_all and asset.created_by != user.id:
            continue
        soft_delete(db, asset)
        n += 1
    return n


def zip_of(db: Session, ids: list[str], user: User, scope_all: bool) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for aid in ids:
            asset = db.get(Asset, aid)
            if not asset or asset.deleted_at is not None:
                continue
            if not scope_all and asset.created_by != user.id:
                continue
            path = storage.path_of(asset.storage_key)
            if path.exists():
                zf.write(path, arcname=f"{asset.name}{'.' + asset.ext.lower() if asset.ext else ''}")
    return buf.getvalue()


def download_name(asset: Asset) -> str:
    return f"{asset.name}{'.' + asset.ext.lower() if asset.ext else ''}"
