"""文章草稿：保存即落素材库（source=draft），支持导出。"""
from __future__ import annotations

from urllib.parse import quote

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import current_user, require_editor
from app.models import User
from app.schemas import AssetOut, ArticleDraftIn, DraftOut, DraftSaved, Page
from app.services import asset_service, draft_service

router = APIRouter(prefix="/articles", tags=["articles"])


@router.get("/drafts", response_model=Page[DraftOut])
def list_drafts(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    kind: str = "article",
    db: Session = Depends(get_db),
    user: User = Depends(require_editor),
) -> Page[DraftOut]:
    rows, total = draft_service.list_drafts(db, user, kind, page, page_size)
    return Page[DraftOut](
        items=[DraftOut.model_validate(d) for d in rows], total=total, page=page, page_size=page_size
    )


@router.get("/drafts/{draft_id}", response_model=DraftOut)
def get_draft(
    draft_id: str, db: Session = Depends(get_db), user: User = Depends(require_editor)
) -> DraftOut:
    return DraftOut.model_validate(draft_service.get_draft(db, user, draft_id))


@router.post("/drafts", response_model=DraftSaved, status_code=201)
def create_draft(
    payload: ArticleDraftIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_editor),
) -> DraftSaved:
    draft, asset = draft_service.save_article_draft(db, user, payload.model_dump(), None)
    return DraftSaved(
        draft=DraftOut.model_validate(draft),
        asset=asset_service.serialize(asset) if asset else None,
    )


@router.put("/drafts/{draft_id}", response_model=DraftSaved)
def update_draft(
    draft_id: str,
    payload: ArticleDraftIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_editor),
) -> DraftSaved:
    draft, asset = draft_service.save_article_draft(db, user, payload.model_dump(), draft_id)
    return DraftSaved(
        draft=DraftOut.model_validate(draft),
        asset=asset_service.serialize(asset) if asset else None,
    )


@router.delete("/drafts/{draft_id}", status_code=204)
def delete_draft(
    draft_id: str, db: Session = Depends(get_db), user: User = Depends(require_editor)
):
    draft_service.delete_draft(db, user, draft_id)
    return Response(status_code=204)


@router.get("/drafts/{draft_id}/export")
def export_draft(
    draft_id: str,
    format: str = Query("markdown", pattern="^(markdown|text)$"),
    db: Session = Depends(get_db),
    user: User = Depends(require_editor),
):
    draft = draft_service.get_draft(db, user, draft_id)
    md = draft_service.build_article_md(draft)
    if format == "text":
        md = md.replace("#", "").replace("`", "")
    # 头部只能是 latin-1，中文名走 RFC 5987 的 filename*
    filename = f"{draft.title or draft.id}.md"
    ascii_name = f"{draft.id}.md"
    return Response(
        md,
        media_type="text/markdown; charset=utf-8",
        headers={
            "Content-Disposition": (
                f'attachment; filename="{ascii_name}"; filename*=UTF-8\'\'{quote(filename)}'
            )
        },
    )
