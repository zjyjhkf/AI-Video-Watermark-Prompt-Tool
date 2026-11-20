"""后台 Worker：默认 inline 线程池（免 Redis 即可跑通全链路），可切 external 队列。

职责：claim 任务 → 渲染/生成 → 进度回写 → 产物落素材库（materialize）。
"""
from __future__ import annotations

import os
import threading
import traceback
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select

from app.core.config import settings
from app.core.db import SessionLocal
from app.models import Asset, ServiceStatus, Task, TaskOutput
from app.services import asset_service, draft_service, llm_service, watermark_service
from app.storage import storage

_executor: ThreadPoolExecutor | None = None
_lock = threading.Lock()
_slots = 0


def node_name() -> str:
    return f"worker-1#{os.getpid()}"


def _exec() -> ThreadPoolExecutor:
    global _executor
    if _executor is None:
        with _lock:
            if _executor is None:
                _executor = ThreadPoolExecutor(
                    max_workers=max(1, settings.worker_concurrency),
                    thread_name_prefix="content-worker",
                )
    return _executor


def submit(task_id: str) -> None:
    """提交到后台。inline 模式下直接进线程池。"""
    if settings.worker_mode == "external":
        # 外部队列模式：由独立进程轮询 pending 任务（见 README「横向扩展」）
        return
    _exec().submit(_run, task_id)


# ---------------------------------------------------------------------- 状态工具
def _set_progress(task_id: str, pct: int) -> bool:
    """回写进度；返回 False 表示任务已被取消/删除，应中止。"""
    with SessionLocal() as db:
        task = db.get(Task, task_id)
        if not task:
            return False
        if task.status == "canceled":
            return False
        task.progress = max(0, min(100, int(pct)))
        task.node = node_name()
        db.add(task)
        db.commit()
        return task.status == "processing"


def _finish(task_id: str, status: str, *, error: str | None = None, progress: int = 100) -> None:
    with SessionLocal() as db:
        task = db.get(Task, task_id)
        if not task:
            return
        if task.status == "canceled":
            # 取消是终态，不允许被后续的失败/完成覆盖
            return
        task.status = status
        task.progress = progress
        task.error = error
        task.finished_at = datetime.now(timezone.utc)
        task.node = node_name()
        db.add(task)
        db.commit()


def _heartbeat() -> None:
    with SessionLocal() as db:
        row = db.get(ServiceStatus, 1)
        running = db.query(Task).filter(Task.status == "processing").count()
        pending = db.query(Task).filter(Task.status == "pending").count()
        if row is None:
            row = ServiceStatus(id=1, service_name=settings.app_name, state="online", node=node_name())
        row.state = "online"
        row.node = node_name()
        row.running = running
        row.pending = pending
        row.summary = f"running={running} pending={pending}"
        row.heartbeat_at = datetime.now(timezone.utc)
        db.add(row)
        db.commit()


# ---------------------------------------------------------------------- 产物入库
def _materialize_video(db, task: Task, out_path: Path, meta: dict) -> str | None:
    if not task.save_to_assets:
        return None
    size = out_path.stat().st_size
    folder = (task.payload or {}).get("output_folder") or "产物 / 视频"
    name = f"{(task.payload or {}).get('asset_name', task.name)}_水印版"

    existing = None
    if task.output_asset_id:
        existing = db.get(Asset, task.output_asset_id)
    if existing is None:
        existing = db.scalars(
            select(Asset).where(Asset.source == "task", Asset.source_task_id == task.id)
        ).first()

    data = out_path.read_bytes()
    asset = asset_service.create_internal(
        db,
        name=name,
        ext="mp4",
        data=data,
        user_id=task.created_by,
        folder=folder,
        source="task",
        source_task_id=task.id,
        mime="video/mp4",
        kind="video",
        reuse=existing,
    )
    asset.name = name
    asset.folder = folder
    asset.duration_seconds = meta.get("duration_seconds")
    asset.width = meta.get("width")
    asset.height = meta.get("height")
    db.add(asset)
    db.commit()
    return asset.id


def _materialize_prompt(db, task: Task, prompt: dict) -> str | None:
    if not task.save_to_assets:
        return None
    text = (
        f"# {task.name}\n\n## 需求\n{task.requirement}\n\n"
        f"## 英文提示词\n```text\n{prompt.get('prompt_text', '')}\n```\n\n"
        f"## 中文释义\n{prompt.get('prompt_cn', '')}\n\n"
        f"## 要素拆解\n{prompt.get('elements', '')}\n\n"
        f"## 生成参数\n{prompt.get('params', '')}\n"
    )
    existing = db.scalars(
        select(Asset).where(Asset.source == "task", Asset.source_task_id == task.id)
    ).first()
    asset = asset_service.create_internal(
        db,
        name=f"{task.name} · 提示词",
        ext="md",
        data=text.encode("utf-8"),
        user_id=task.created_by,
        folder="产物 / 提示词",
        source="task",
        source_task_id=task.id,
        mime="text/markdown",
        kind="document",
        reuse=existing,
    )
    return asset.id


def _upsert_output(db, task: Task, **fields) -> TaskOutput:
    out = db.scalars(select(TaskOutput).where(TaskOutput.task_id == task.id)).first()
    if out is None:
        out = TaskOutput(task_id=task.id)
        db.add(out)
    for k, v in fields.items():
        setattr(out, k, v)
    db.commit()
    return out


# ---------------------------------------------------------------------- 主流程
def _run(task_id: str) -> None:
    with SessionLocal() as db:
        task = db.get(Task, task_id)
        if not task or task.status not in ("pending", "processing"):
            return
        task.status = "processing"
        task.progress = 2
        task.started_at = task.started_at or datetime.now(timezone.utc)
        task.node = node_name()
        task.error = None
        db.add(task)
        db.commit()
        task_type = task.task_type

    try:
        if task_type == "video":
            _run_video(task_id)
        elif task_type == "article":
            _run_article(task_id)
        else:
            _run_prompt(task_id)
        _finish(task_id, "done")
    except Exception as exc:  # noqa: BLE001 任务失败要落库，不能吞
        message = str(exc)
        if settings.debug:
            message += "\n" + traceback.format_exc()[-800:]
        _finish(task_id, "failed", error=message, progress=0)
    finally:
        _heartbeat()


def _run_video(task_id: str) -> None:
    with SessionLocal() as db:
        task = db.get(Task, task_id)
        if not task:
            return
        payload = task.payload or {}
        wm = payload.get("watermark") or {}
        src_asset = db.get(Asset, payload.get("asset_id") or "")
        if not src_asset or src_asset.deleted_at is not None:
            raise RuntimeError("源视频不存在或已删除")
        src_path = storage.path_of(src_asset.storage_key)
        if not src_path.exists():
            raise RuntimeError("源视频文件缺失，请重新上传")
        width = src_asset.width or 1920
        height = src_asset.height
        duration = src_asset.duration_seconds

        logo_path = None
        if wm.get("logo_on") and wm.get("logo_asset_id"):
            logo = db.get(Asset, wm["logo_asset_id"])
            if logo and logo.deleted_at is None:
                p = storage.path_of(logo.storage_key)
                if p.exists():
                    logo_path = p

        out_key = f"derived/{task.id}/output.mp4"
        out_path = storage.path_of(out_key)

    _set_progress(task_id, 5)

    def on_progress(ratio: float) -> None:
        if not _set_progress(task_id, int(5 + ratio * 90)):
            raise RuntimeError("任务已取消")

    meta = watermark_service.render_video(
        src_path,
        out_path,
        wm,
        width=width,
        duration_seconds=duration,
        logo_path=logo_path,
        on_progress=on_progress,
    )

    with SessionLocal() as db:
        task = db.get(Task, task_id)
        if not task or task.status == "canceled":
            return
        asset_id = _materialize_video(
            db,
            task,
            out_path,
            {"duration_seconds": duration, "width": width, "height": height},
        )
        size = out_path.stat().st_size
        _upsert_output(
            db,
            task,
            output_asset_id=asset_id,
            media_json={
                "output_name": f"{(task.payload or {}).get('asset_name', task.name)}_水印版.mp4",
                "output_size_bytes": size,
                "duration_seconds": duration,
                "engine": meta.get("engine"),
                "note": meta.get("note"),
            },
        )
        task = db.get(Task, task_id)
        task.output_asset_id = asset_id
        db.add(task)
        db.commit()
    _set_progress(task_id, 99)


def _run_article(task_id: str) -> None:
    with SessionLocal() as db:
        task = db.get(Task, task_id)
        if not task:
            return
    _set_progress(task_id, 15)
    with SessionLocal() as db:
        task = db.get(Task, task_id)
        article = llm_service.generate_article(db, task)
        _set_progress(task_id, 70)
        _upsert_output(db, task, article_json=article)
    _set_progress(task_id, 95)


def _run_prompt(task_id: str) -> None:
    with SessionLocal() as db:
        task = db.get(Task, task_id)
        if not task:
            return
    _set_progress(task_id, 15)
    with SessionLocal() as db:
        task = db.get(Task, task_id)
        prompt = llm_service.generate_prompt(db, task)
        _set_progress(task_id, 70)
        asset_id = _materialize_prompt(db, task, prompt)
        _upsert_output(
            db,
            task,
            prompt_text=prompt.get("prompt_text"),
            prompt_json=prompt,
            output_asset_id=asset_id,
        )
        task = db.get(Task, task_id)
        task.output_asset_id = asset_id
        db.add(task)
        db.commit()
    _set_progress(task_id, 95)


def recover_stale() -> None:
    """服务启动时把卡在 processing 的任务放回 pending，避免永久卡死。"""
    with SessionLocal() as db:
        rows = db.scalars(select(Task).where(Task.status == "processing")).all()
        for t in rows:
            t.status = "pending"
            t.progress = 0
            db.add(t)
        db.commit()
        for t in rows:
            submit(t.id)
    _heartbeat()


def shutdown() -> None:
    global _executor
    if _executor is not None:
        _executor.shutdown(wait=False)
        _executor = None
