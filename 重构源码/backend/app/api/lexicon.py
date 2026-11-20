"""词库路由：写作任务包查询 / 手动补采。"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import require_editor
from app.models import User
from app.services import lexicon_service

router = APIRouter(prefix="/lexicon", tags=["lexicon"])


@router.get("/{keyword}/plan")
def plan(
    keyword: str,
    strategy: str = Query("auto"),
    db: Session = Depends(get_db),
    _: User = Depends(require_editor),
) -> dict:
    return lexicon_service.plan(db, keyword, strategy)


@router.post("/{keyword}/ensure")
def ensure(
    keyword: str, db: Session = Depends(get_db), _: User = Depends(require_editor)
) -> dict:
    data = lexicon_service.ensure(db, keyword)
    return {"keyword": keyword, "collected": True, "updated_at": data["updated_at"], "plan": data}
