"""任务路由：创建 / 列表 / 详情 / 重试 / 取消 / 删除 / SSE 进度。"""
from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.db import SessionLocal, get_db
from app.core.security import current_user, require_editor, scope_allows
from app.models import Task, User
from app.schemas import TaskCreate, TaskOut, TaskPage
from app.services import task_service

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.post("", response_model=TaskOut, status_code=201)
def create_task(
    payload: TaskCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_editor),
) -> TaskOut:
    task = task_service.create_task(db, user, payload)
    return TaskOut.model_validate(task_service.serialize(task, author=user.name))


@router.get("", response_model=TaskPage)
def list_tasks(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str | None = None,
    task_type: str | None = None,
    q: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
) -> TaskPage:
    items, total, counts = task_service.list_tasks(
        db,
        user,
        page=page,
        page_size=page_size,
        status=status,
        task_type=task_type,
        q=q,
        scope_all=scope_allows(user),
    )
    return TaskPage(
        items=[TaskOut.model_validate(i) for i in items],
        total=total,
        page=page,
        page_size=page_size,
        counts=counts,
    )


@router.get("/stats")
def stats(db: Session = Depends(get_db), user: User = Depends(current_user)) -> dict:
    stmt = select(Task.status, func.count(Task.id))
    if not scope_allows(user):
        stmt = stmt.where(Task.created_by == user.id)
    stmt = stmt.group_by(Task.status)
    by_status = {s: c for s, c in db.execute(stmt).all()}
    return {
        "all": sum(by_status.values()),
        "pending": by_status.get("pending", 0),
        "processing": by_status.get("processing", 0),
        "done": by_status.get("done", 0),
        "failed": by_status.get("failed", 0),
        "canceled": by_status.get("canceled", 0),
    }


@router.get("/{task_id}", response_model=TaskOut)
def get_task(
    task_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)
) -> TaskOut:
    task = task_service.get_task(db, user, task_id, scope_all=scope_allows(user))
    author = db.get(User, task.created_by)
    return TaskOut.model_validate(
        task_service.serialize(task, author=author.name if author else None)
    )


@router.post("/{task_id}/retry", response_model=TaskOut)
def retry_task(
    task_id: str, db: Session = Depends(get_db), user: User = Depends(require_editor)
) -> TaskOut:
    task = task_service.get_task(db, user, task_id, scope_all=scope_allows(user))
    task = task_service.retry(db, task)
    return TaskOut.model_validate(task_service.serialize(task, author=user.name))


@router.post("/{task_id}/cancel", response_model=TaskOut)
def cancel_task(
    task_id: str, db: Session = Depends(get_db), user: User = Depends(require_editor)
) -> TaskOut:
    task = task_service.get_task(db, user, task_id, scope_all=scope_allows(user))
    task = task_service.cancel(db, task)
    return TaskOut.model_validate(task_service.serialize(task, author=user.name))


@router.delete("/{task_id}", status_code=204)
def delete_task(
    task_id: str, db: Session = Depends(get_db), user: User = Depends(require_editor)
) -> Response:
    task = task_service.get_task(db, user, task_id, scope_all=scope_allows(user))
    task_service.delete(db, task)
    return Response(status_code=204)


@router.get("/{task_id}/events")
async def task_events(task_id: str, request: Request, user: User = Depends(current_user)):
    """SSE：状态 + 进度推送；终态自动关闭。前端断流可回退 3s 轮询。"""

    async def gen():
        last = None
        while True:
            if await request.is_disconnected():
                break
            with SessionLocal() as db:
                task = db.get(Task, task_id)
                if not task:
                    yield "event: error\ndata: {\"code\":\"TASK_NOT_FOUND\"}\n\n"
                    break
                snapshot = {
                    "status": task.status,
                    "progress": (task.progress or 0) / 100,
                    "node": task.node,
                }
            if snapshot != last:
                last = snapshot
                yield f"event: status\ndata: {json.dumps(snapshot, ensure_ascii=False)}\n\n"
            if snapshot["status"] in ("done", "failed", "canceled"):
                break
            await asyncio.sleep(0.8)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
