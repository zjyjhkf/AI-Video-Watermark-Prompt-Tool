"""素材路由：上传 / 列表 / 详情 / 下载 / 缩略图 / 删除 / 批量。"""
from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, Query, Response, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import current_user, require_editor, scope_allows
from app.models import Asset, User
from app.schemas import AssetOut, AssetPage, BatchIds
from app.services import asset_service, settings_service
from app.storage import storage

router = APIRouter(prefix="/assets", tags=["assets"])


@router.post("/upload", status_code=201)
def upload(
    files: list[UploadFile] = File(...),
    folder: str | None = Form(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_editor),
) -> dict:
    if not files:
        from app.core.errors import invalid

        raise invalid("VALIDATION_ERROR", "请选择要上传的文件")
    items = [asset_service.serialize(asset_service.save_upload(db, f, user, folder)) for f in files]
    return {"items": [i.model_dump() for i in items]}


@router.get("", response_model=AssetPage)
def list_assets(
    page: int = Query(1, ge=1),
    page_size: int = Query(24, ge=1, le=100),
    type: str | None = None,
    source: str | None = None,
    q: str | None = None,
    task_id: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
) -> AssetPage:
    rows, total = asset_service.list_assets(
        db,
        user,
        page=page,
        page_size=page_size,
        type_=type,
        source=source,
        q=q,
        task_id=task_id,
        scope_all=scope_allows(user),
    )
    return AssetPage(
        items=[asset_service.serialize(a) for a in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/counts")
def counts(db: Session = Depends(get_db), user: User = Depends(current_user)) -> dict:
    by_type = asset_service.counts_by_type(db, user, scope_allows(user))
    return {
        "by_type": by_type,
        "storage": settings_service.storage_usage(db),
    }


@router.post("/batch-delete")
def batch_delete(
    payload: BatchIds, db: Session = Depends(get_db), user: User = Depends(require_editor)
) -> dict:
    n = asset_service.batch_delete(db, payload.ids, user, scope_allows(user))
    return {"deleted": n}


@router.post("/batch-download")
def batch_download(
    payload: BatchIds, db: Session = Depends(get_db), user: User = Depends(current_user)
) -> StreamingResponse:
    data = asset_service.zip_of(db, payload.ids, user, scope_allows(user))
    return StreamingResponse(
        iter([data]),
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="assets.zip"'},
    )


@router.get("/{asset_id}", response_model=AssetOut)
def get_asset(
    asset_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)
) -> AssetOut:
    asset = asset_service.get(db, asset_id)
    if not scope_allows(user) and asset.created_by != user.id:
        from app.core.errors import forbidden

        raise forbidden("无权访问该素材")
    return asset_service.serialize(asset)


@router.get("/{asset_id}/download")
def download(asset_id: str, db: Session = Depends(get_db), _: User = Depends(current_user)):
    asset = asset_service.get(db, asset_id)
    path = storage.path_of(asset.storage_key)
    if not path.exists():
        from app.core.errors import not_found

        raise not_found("ASSET_NOT_FOUND", "文件已丢失，请重新上传")
    return FileResponse(
        path,
        media_type=asset.mime or "application/octet-stream",
        filename=asset_service.download_name(asset),
    )


@router.get("/{asset_id}/thumbnail")
def thumbnail(asset_id: str, db: Session = Depends(get_db), _: User = Depends(current_user)):
    asset = asset_service.get(db, asset_id)
    key = asset.thumbnail_key or (asset.storage_key if asset.type == "image" else None)
    if not key:
        from app.core.errors import not_found

        raise not_found("ASSET_NOT_FOUND", "该素材没有缩略图")
    path = storage.path_of(key)
    if not path.exists():
        from app.core.errors import not_found

        raise not_found("ASSET_NOT_FOUND", "缩略图已丢失")
    return FileResponse(path, media_type="image/jpeg" if key.endswith(".jpg") else asset.mime)


@router.delete("/{asset_id}", status_code=204)
def delete_asset(
    asset_id: str, db: Session = Depends(get_db), user: User = Depends(require_editor)
) -> Response:
    asset: Asset = asset_service.get(db, asset_id)
    if not scope_allows(user) and asset.created_by != user.id:
        from app.core.errors import forbidden

        raise forbidden("只能删除自己上传的素材")
    asset_service.soft_delete(db, asset)
    return Response(status_code=204)
