"""生图提示词草稿：与文章草稿共用 drafts 表，用 kind='prompt' 区分。"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import require_editor
from app.models import User
from app.schemas import DraftOut, DraftSaved, Page, PromptDraftIn
from app.services import asset_service, draft_service

router = APIRouter(prefix="/prompts", tags=["prompts"])


@router.get("/drafts", response_model=Page[DraftOut])
def list_drafts(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(require_editor),
) -> Page[DraftOut]:
    rows, total = draft_service.list_drafts(db, user, "prompt", page, page_size)
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
    payload: PromptDraftIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_editor),
) -> DraftSaved:
    draft, asset = draft_service.save_prompt_draft(db, user, payload.model_dump(), None)
    return DraftSaved(
        draft=DraftOut.model_validate(draft),
        asset=asset_service.serialize(asset) if asset else None,
    )


@router.put("/drafts/{draft_id}", response_model=DraftSaved)
def update_draft(
    draft_id: str,
    payload: PromptDraftIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_editor),
) -> DraftSaved:
    draft, asset = draft_service.save_prompt_draft(db, user, payload.model_dump(), draft_id)
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
