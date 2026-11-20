"""任务服务：创建、查询、序列化、重试/取消/删除。"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import ApiError, invalid, not_found
from app.models import Asset, Task, TaskAttachment, TaskOutput, User
from app.schemas import TaskCreate


def _payload(task: Task) -> dict:
    return task.payload or {}


def serialize(task: Task, *, output: TaskOutput | None = None, author: str | None = None) -> dict:
    p = _payload(task)
    result: dict | None = None
    detail: dict = {}

    if output is not None or task.status in ("done", "processing", "failed", "canceled", "pending"):
        output = output if output is not None else task.output

    if task.task_type == "video":
        media = (output.media_json if output else None) or {}
        asset_id = task.output_asset_id
        result = None
        if task.status == "done" and (media or asset_id):
            result = {
                "output_asset_id": asset_id,
                "output_name": media.get("output_name"),
                "output_size_bytes": media.get("output_size_bytes"),
                "duration_seconds": media.get("duration_seconds"),
                "download_url": f"{settings.api_prefix}/assets/{asset_id}/download" if asset_id else None,
                "materialized": bool(asset_id),
                "engine": media.get("engine"),
                "note": media.get("note"),
            }
        detail = {
            "源视频": p.get("asset_name") or "—",
            "视频来源": "素材库" if p.get("asset_source") == "upload" else "素材库 / 导入",
            "文字水印": p.get("watermark_text") or "未启用",
            "Logo水印": p.get("watermark_logo") or "未启用",
            "画质CRF": str((p.get("watermark") or {}).get("crf", "—")),
            "编码预设": (p.get("watermark") or {}).get("preset", "—"),
            "保存到素材库": "是" if task.save_to_assets else "否",
        }
    elif task.task_type == "article":
        article = (output.article_json if output else None) or {}
        if task.status == "done" and article:
            result = {"article": article}
        detail = {
            "平台": p.get("platform_label") or "—",
            "内容类型": p.get("content_type_label") or "—",
            "受众档位": p.get("audience_label") or "—",
            "搜索关键词": task.keyword or "—",
            "词库策略": p.get("keyword_strategy_label") or "—",
            "需求描述": (task.requirement or "—")[:120],
        }
    else:  # prompt
        prompt_json = (output.prompt_json if output else None) or {}
        if task.status == "done" and (output and output.prompt_text):
            result = {
                "prompt_text": output.prompt_text,
                "prompt_json": prompt_json,
                "prompt_file_asset_id": output.output_asset_id,
            }
        detail = {
            "需求描述": (task.requirement or "—")[:120],
            "参考图": f"{len(p.get('ref_image_asset_ids') or [])} 张",
            "输出结构": "英文提示词 / 中文释义 / 要素拆解 / 生成参数",
        }

    return {
        "id": task.id,
        "name": task.name,
        "task_type": task.task_type,
        "status": task.status,
        "progress": task.progress or 0,
        "node": task.node,
        "error": task.error,
        "save_to_assets": task.save_to_assets,
        "output_asset_id": task.output_asset_id,
        "created_by": task.created_by,
        "created_by_name": author or p.get("created_by_name") or "",
        "created_at": task.created_at,
        "started_at": task.started_at,
        "finished_at": task.finished_at,
        "result": result,
        "detail": detail,
    }


PLATFORM_LABEL = {"xhs": "小红书", "weibo": "微博", "wechat": "微信公众号", "douyin": "抖音"}
POSITION_LABEL = {
    "left_top": "左上",
    "top_center": "上中",
    "right_top": "右上",
    "left_middle": "左中",
    "center": "居中",
    "right_middle": "右中",
    "left_bottom": "左下",
    "bottom_center": "下中",
    "right_bottom": "右下",
}
CONTENT_LABEL = {
    "science": "科普教育",
    "commerce": "种草带货",
    "course": "课程转化",
    "event": "活动引流",
    "market": "市场分析",
}
AUDIENCE_LABEL = {"general": "通俗", "professional": "专业", "mixed": "混合"}
STRATEGY_LABEL = {"auto": "自动补采", "existing": "只用现成", "off": "不启用"}


def create_task(db: Session, user: User, payload: TaskCreate) -> Task:
    data = payload.model_dump()
    task = Task(
        name=payload.name,
        task_type=payload.task_type,
        status="pending",
        created_by=user.id,
        save_to_assets=payload.save_to_assets,
    )

    if payload.task_type == "video":
        if not payload.asset_id:
            raise invalid("SOURCE_VIDEO_REQUIRED", "请先导入视频或从素材库选择")
        asset = db.get(Asset, payload.asset_id)
        if not asset or asset.deleted_at is not None or asset.type != "video":
            raise invalid("SOURCE_VIDEO_REQUIRED", "源视频不存在或不是视频素材")
        wm = payload.watermark_config
        if wm is None:
            raise invalid("WATERMARK_INVALID", "缺少水印配置")
        wm.validate_rules()
        logo = None
        if wm.logo_on and wm.logo_asset_id:
            logo = db.get(Asset, wm.logo_asset_id)
            if not logo or logo.deleted_at is not None:
                raise invalid("WATERMARK_INVALID", "Logo 素材不存在")

        text_label = (
            f"{wm.text} · {POSITION_LABEL.get(wm.text_position, wm.text_position)}"
            if wm.text_on
            else "未启用"
        )
        logo_label = (
            f"{logo.name if logo else wm.logo_asset_id} · "
            f"{POSITION_LABEL.get(wm.logo_position, wm.logo_position)}"
            if wm.logo_on
            else "未启用"
        )
        task.payload = {
            **data,
            "asset_name": asset.name,
            "asset_source": asset.source,
            "watermark": wm.model_dump(),
            "watermark_text": text_label,
            "watermark_logo": logo_label,
            "output_folder": payload.output_folder or "产物 / 视频",
            "created_by_name": user.name,
        }

    elif payload.task_type == "article":
        if not (payload.requirement or "").strip():
            raise invalid("VALIDATION_ERROR", "请填写写作需求")
        task.requirement = payload.requirement
        task.platform = payload.platform or "xhs"
        task.content_type = payload.content_type or "commerce"
        task.audience = payload.audience or "mixed"
        task.keyword = payload.keyword
        task.keyword_strategy = payload.keyword_strategy or "auto"
        task.payload = {
            **data,
            "platform_label": PLATFORM_LABEL.get(task.platform, task.platform),
            "content_type_label": CONTENT_LABEL.get(task.content_type, task.content_type),
            "audience_label": AUDIENCE_LABEL.get(task.audience, task.audience),
            "keyword_strategy_label": STRATEGY_LABEL.get(task.keyword_strategy, "自动补采"),
            "created_by_name": user.name,
        }
    else:
        if not (payload.requirement or "").strip():
            raise invalid("VALIDATION_ERROR", "请填写需求描述")
        task.requirement = payload.requirement
        task.payload = {**data, "created_by_name": user.name}

    db.add(task)
    db.commit()
    db.refresh(task)

    # 主键在 flush 后才生成，关联表必须在这之后写
    if payload.task_type == "video" and payload.asset_id:
        db.add(TaskAttachment(task_id=task.id, asset_id=payload.asset_id, role="input_video"))
    for aid in payload.ref_image_asset_ids or []:
        if db.get(Asset, aid):
            db.add(TaskAttachment(task_id=task.id, asset_id=aid, role="ref_image"))
    db.commit()

    from app.workers.runner import submit

    submit(task.id)
    return task


def get_task(db: Session, user: User, task_id: str, *, scope_all: bool = True) -> Task:
    task = db.get(Task, task_id)
    if not task:
        raise not_found("TASK_NOT_FOUND", "任务不存在或已删除")
    if not scope_all and task.created_by != user.id:
        raise ApiError("FORBIDDEN", "无权访问他人任务", 403)
    return task


def list_tasks(
    db: Session,
    user: User,
    *,
    page: int = 1,
    page_size: int = 20,
    status: str | None = None,
    task_type: str | None = None,
    q: str | None = None,
    scope_all: bool = True,
) -> tuple[list[dict], int, dict]:
    stmt = select(Task)
    if not scope_all:
        stmt = stmt.where(Task.created_by == user.id)
    if status:
        stmt = stmt.where(Task.status == status)
    if task_type:
        stmt = stmt.where(Task.task_type == task_type)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Task.name.ilike(like), Task.id.ilike(like)))

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = list(
        db.scalars(
            stmt.order_by(Task.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
        )
    )

    authors = {
        u.id: u.name
        for u in db.scalars(select(User).where(User.id.in_({t.created_by for t in rows}))).all()
    } if rows else {}

    # 顶部计数：全部 / 待处理 / 处理中 / 已完成 / 失败 / 已取消
    count_stmt = select(Task.status, func.count(Task.id))
    if not scope_all:
        count_stmt = count_stmt.where(Task.created_by == user.id)
    count_stmt = count_stmt.group_by(Task.status)
    by_status = {s: c for s, c in db.execute(count_stmt).all()}
    counts = {
        "all": sum(by_status.values()),
        "pending": by_status.get("pending", 0),
        "processing": by_status.get("processing", 0),
        "done": by_status.get("done", 0),
        "failed": by_status.get("failed", 0),
        "canceled": by_status.get("canceled", 0),
    }

    items = [serialize(t, author=authors.get(t.created_by)) for t in rows]
    return items, total, counts


def update_status(db: Session, task: Task, status: str, **fields) -> Task:
    task.status = status
    for k, v in fields.items():
        setattr(task, k, v)
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def retry(db: Session, task: Task) -> Task:
    if task.status not in ("failed", "canceled"):
        raise ApiError("TASK_ILLEGAL_STATE", "只有失败或已取消的任务可以重试", 409)
    task.retry_count = (task.retry_count or 0) + 1
    task.status = "pending"
    task.error = None
    task.progress = 0
    task.node = None
    task.started_at = None
    task.finished_at = None
    db.add(task)
    db.commit()
    db.refresh(task)

    from app.workers.runner import submit

    submit(task.id)
    return task


def cancel(db: Session, task: Task) -> Task:
    if task.status not in ("pending", "processing"):
        raise ApiError("TASK_ILLEGAL_STATE", "当前状态不允许取消", 409)
    return update_status(db, task, "canceled", finished_at=datetime.now(timezone.utc))


def delete(db: Session, task: Task) -> None:
    # 成品素材保留，仅解除与任务的引用关系
    if task.output_asset_id:
        asset = db.get(Asset, task.output_asset_id)
        if asset:
            asset.source_task_id = None
            db.add(asset)
        task.output_asset_id = None
    for row in db.scalars(select(Asset).where(Asset.source_task_id == task.id)).all():
        row.source_task_id = None
        db.add(row)
    db.flush()

    # 先清子表（产物 / 附件都带 tasks.id 外键），否则删除任务会触发外键约束
    for model in (TaskOutput, TaskAttachment):
        for row in db.scalars(select(model).where(model.task_id == task.id)).all():
            db.delete(row)
    db.flush()

    db.delete(task)
    db.commit()
