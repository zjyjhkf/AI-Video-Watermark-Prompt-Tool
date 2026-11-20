"""草稿服务：文章 / 提示词草稿，保存即落素材库（source=draft, ext=MD）。"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import not_found
from app.models import Asset, Draft, User
from app.services import asset_service

PLATFORM_LABEL = {
    "xhs": "小红书",
    "weibo": "微博",
    "wechat": "微信公众号",
    "douyin": "抖音",
}
CONTENT_LABEL = {
    "science": "科普教育",
    "commerce": "种草带货",
    "course": "课程转化",
    "event": "活动引流",
    "market": "市场分析",
}
AUDIENCE_LABEL = {"general": "通俗", "professional": "专业", "mixed": "混合"}


def _fallback_title(requirement: str | None) -> str:
    text = (requirement or "").strip().replace("\n", " ")
    return (text[:20] or "未命名草稿") if text else "未命名草稿"


def build_article_md(d: Draft) -> str:
    lines = [f"# {d.title or _fallback_title(d.requirement)}", ""]
    meta = [
        PLATFORM_LABEL.get(d.platform or "", None),
        CONTENT_LABEL.get(d.content_type or "", None),
        AUDIENCE_LABEL.get(d.audience or "", None),
    ]
    meta = [m for m in meta if m]
    if meta:
        lines += [f"> {' · '.join(meta)}", ""]
    if d.requirement:
        lines += ["## 需求", "", d.requirement.strip(), ""]
    if d.body:
        lines += ["## 正文", "", d.body.strip(), ""]
    if d.tags:
        lines += ["## 标签", "", " ".join(f"`{t}`" for t in d.tags), ""]
    if d.compliance_check:
        lines += ["## 合规自检", "", d.compliance_check.strip(), ""]
    if d.coverage_check:
        lines += ["## 搜索覆盖自检", "", d.coverage_check.strip(), ""]
    lines += ["---", "", f"_草稿 ID：{d.id} · 更新于 {datetime.now(timezone.utc):%Y-%m-%d %H:%M} UTC_"]
    return "\n".join(lines) + "\n"


def build_prompt_md(d: Draft) -> str:
    p = d.prompt_json or {}
    lines = [f"# {d.title or _fallback_title(d.requirement)}", ""]
    if d.requirement:
        lines += ["## 需求描述", "", d.requirement.strip(), ""]
    if p.get("prompt_text"):
        lines += ["## 英文提示词", "", "```text", p["prompt_text"].strip(), "```", ""]
    if p.get("prompt_cn"):
        lines += ["## 中文释义", "", p["prompt_cn"].strip(), ""]
    if p.get("elements"):
        lines += ["## 要素拆解", "", p["elements"].strip(), ""]
    if p.get("params"):
        lines += ["## 生成参数", "", p["params"].strip(), ""]
    lines += ["---", "", f"_草稿 ID：{d.id} · 更新于 {datetime.now(timezone.utc):%Y-%m-%d %H:%M} UTC_"]
    return "\n".join(lines) + "\n"


def _upsert_asset(db: Session, d: Draft, user: User) -> Asset | None:
    """同 id 反复保存只覆盖同一个 .md 素材，不新增副本。"""
    text = build_article_md(d) if d.kind == "article" else build_prompt_md(d)
    data = text.encode("utf-8")
    folder = "草稿 / 文章" if d.kind == "article" else "草稿 / 提示词"
    name = f"{d.title or _fallback_title(d.requirement)} · {'草稿' if d.kind == 'article' else '提示词草稿'}"

    existing: Asset | None = None
    if d.asset_id:
        existing = db.get(Asset, d.asset_id)
        if existing and existing.deleted_at is not None:
            existing = None
    if existing is None:
        existing = db.scalars(
            select(Asset).where(
                Asset.source == "draft", Asset.ref_id == d.id, Asset.deleted_at.is_(None)
            )
        ).first()

    asset = asset_service.create_internal(
        db,
        name=name,
        ext="md",
        data=data,
        user_id=d.created_by,
        folder=folder,
        source="draft",
        ref_id=d.id,
        mime="text/markdown",
        kind="document",
        reuse=existing,
    )
    if asset.name != name:
        asset.name = name
        asset.folder = folder
        db.add(asset)
        db.commit()
    return asset


def save_article_draft(db: Session, user: User, payload: dict, draft_id: str | None) -> tuple[Draft, Asset | None]:
    draft = None
    if draft_id:
        draft = db.get(Draft, draft_id)
        if not draft or draft.created_by != user.id or draft.kind != "article":
            raise not_found("DRAFT_NOT_FOUND", "草稿不存在或无权访问")
    if draft is None:
        draft = Draft(kind="article", created_by=user.id)
        db.add(draft)
        db.flush()

    draft.title = payload.get("title") or draft.title or _fallback_title(payload.get("requirement"))
    draft.platform = payload.get("platform") or draft.platform
    draft.content_type = payload.get("content_type") or draft.content_type
    draft.audience = payload.get("audience") or draft.audience
    draft.requirement = payload.get("requirement", draft.requirement)
    draft.body = payload.get("body", draft.body)
    draft.tags = payload.get("tags") or draft.tags or []
    draft.compliance_check = payload.get("compliance_check", draft.compliance_check)
    draft.coverage_check = payload.get("coverage_check", draft.coverage_check)
    draft.updated_at = datetime.now(timezone.utc)
    db.add(draft)
    db.commit()
    db.refresh(draft)

    asset = _upsert_asset(db, draft, user) if payload.get("save_to_assets", True) else None
    if asset and draft.asset_id != asset.id:
        draft.asset_id = asset.id
        db.add(draft)
        db.commit()
        db.refresh(draft)
    return draft, asset


def save_prompt_draft(db: Session, user: User, payload: dict, draft_id: str | None) -> tuple[Draft, Asset | None]:
    draft = None
    if draft_id:
        draft = db.get(Draft, draft_id)
        if not draft or draft.created_by != user.id or draft.kind != "prompt":
            raise not_found("DRAFT_NOT_FOUND", "草稿不存在或无权访问")
    if draft is None:
        draft = Draft(kind="prompt", created_by=user.id)
        db.add(draft)
        db.flush()

    prompt_json = {
        "prompt_text": payload.get("prompt_text") or "",
        "prompt_cn": payload.get("prompt_cn") or "",
        "elements": payload.get("elements") or "",
        "params": payload.get("params") or "",
    }
    draft.requirement = payload.get("requirement", draft.requirement)
    draft.prompt_json = prompt_json
    if not draft.title:
        draft.title = _fallback_title(draft.requirement)
    draft.updated_at = datetime.now(timezone.utc)
    db.add(draft)
    db.commit()
    db.refresh(draft)

    asset = _upsert_asset(db, draft, user) if payload.get("save_to_assets", True) else None
    if asset and draft.asset_id != asset.id:
        draft.asset_id = asset.id
        db.add(draft)
        db.commit()
        db.refresh(draft)
    return draft, asset


def list_drafts(
    db: Session, user: User, kind: str, page: int, page_size: int
) -> tuple[list[Draft], int]:
    stmt = select(Draft).where(Draft.created_by == user.id, Draft.kind == kind)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = list(
        db.scalars(
            stmt.order_by(Draft.updated_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    )
    return rows, total


def get_draft(db: Session, user: User, draft_id: str) -> Draft:
    draft = db.get(Draft, draft_id)
    if not draft or draft.created_by != user.id:
        raise not_found("DRAFT_NOT_FOUND", "草稿不存在或无权访问")
    return draft


def delete_draft(db: Session, user: User, draft_id: str) -> None:
    draft = get_draft(db, user, draft_id)
    if draft.asset_id:
        asset = db.get(Asset, draft.asset_id)
        if asset and asset.deleted_at is None:
            asset_service.soft_delete(db, asset)
    db.delete(draft)
    db.commit()
