"""系统设置：分区读写 + 全局默认水印（对应 API 8.2 / 8.3）。"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings as env
from app.core.errors import invalid
from app.models import SystemSetting
from app.schemas import WatermarkPayload

DEFAULT_WATERMARK: dict = {
    "text_on": True,
    "text": "健衡学院",
    "text_position": "right_bottom",
    "font_size": 40,
    "font_color": "#FFFFFF",
    "text_opacity": 0.8,
    "logo_on": False,
    "logo_asset_id": None,
    "logo_position": "left_top",
    "logo_width": 160,
    "logo_opacity": 0.85,
    "margin": 40,
    "crf": 20,
    "preset": "medium",
    "threads": 8,
}

SECTION_DEFAULTS: dict[str, dict] = {
    "ai": {
        "provider": env.ai_provider,
        "base_url": env.ai_base_url,
        "model": env.ai_model,
        "api_key": env.ai_api_key,
        "max_tokens": 16384,
        "system_prompt_file": "prompts/article_system.md",
        "temperature": 0.7,
    },
    "ai_image": {
        "enabled": False,
        "provider": "dashscope",
        "model": "wanx-v1",
        "size": "1024x1024",
        "api_key": "",
    },
    "worker": {
        "video_workers": env.worker_concurrency,
        "text_workers": 4,
        "claim_timeout_minutes": env.claim_timeout_minutes,
    },
    "storage": {
        "backend": env.storage_backend,
        "quota_bytes": env.storage_quota_bytes,
    },
    "lexicon": {"tag_max_len": 7, "collect_timeout_seconds": 300},
    "watermark_default": dict(DEFAULT_WATERMARK),
}

SECRET_KEYS = {"api_key"}


def _row(db: Session, key: str) -> SystemSetting | None:
    return db.get(SystemSetting, key)


def get_section(db: Session, key: str) -> dict:
    row = _row(db, key)
    base = dict(SECTION_DEFAULTS.get(key, {}))
    if row and isinstance(row.value, dict):
        base.update(row.value)
    return base


def set_section(db: Session, key: str, value: dict) -> None:
    row = _row(db, key)
    if row:
        row.value = value
        row.updated_at = datetime.now(timezone.utc)
    else:
        db.add(SystemSetting(key=key, value=value, is_secret=key.endswith("secret")))
    db.commit()


def mask_secret(value: str | None) -> str | None:
    if not value:
        return None
    if len(value) <= 8:
        return "****"
    return f"{value[:5]}****{value[-4:]}"


def public_settings(db: Session) -> dict:
    ai = get_section(db, "ai")
    ai_view = {k: v for k, v in ai.items() if k != "api_key"}
    ai_view["api_key_masked"] = mask_secret(ai.get("api_key"))
    ai_image = get_section(db, "ai_image")
    ai_image_view = {k: v for k, v in ai_image.items() if k != "api_key"}
    ai_image_view["api_key_masked"] = mask_secret(ai_image.get("api_key"))

    latest = db.scalars(
        select(SystemSetting).order_by(SystemSetting.updated_at.desc()).limit(1)
    ).first()
    return {
        "ai": ai_view,
        "ai_image": ai_image_view,
        "worker": get_section(db, "worker"),
        "storage": get_section(db, "storage"),
        "lexicon": get_section(db, "lexicon"),
        "watermark_default": get_section(db, "watermark_default"),
        "updated_at": latest.updated_at if latest else datetime.now(timezone.utc),
    }


def patch_settings(db: Session, patch: dict) -> None:
    for section in ("ai", "ai_image", "worker", "lexicon"):
        incoming = patch.get(section)
        if not incoming:
            continue
        current = get_section(db, section)
        merged = {**current, **incoming}
        # 空字符串代表「不修改」，避免前端脱敏值把真 Key 覆盖掉
        for k in list(merged):
            if k in SECRET_KEYS and merged.get(k) == "":
                merged[k] = current.get(k, "")
        set_section(db, section, merged)


def get_watermark_default(db: Session) -> dict:
    return get_section(db, "watermark_default")


def put_watermark_default(db: Session, payload: WatermarkPayload) -> dict:
    payload.validate_rules()
    value = payload.model_dump()
    set_section(db, "watermark_default", value)
    return value


def reset_watermark_default(db: Session) -> dict:
    set_section(db, "watermark_default", dict(DEFAULT_WATERMARK))
    return dict(DEFAULT_WATERMARK)


def current_watermark_or_default(db: Session) -> dict:
    cfg = get_watermark_default(db)
    try:
        WatermarkPayload(**cfg).validate_rules()
        return cfg
    except Exception:  # 配置被改坏时回落出厂值，避免整个视频页不可用
        return dict(DEFAULT_WATERMARK)


def storage_usage(db: Session) -> dict:
    from app.storage import storage

    used = storage.usage_bytes()
    quota = int(get_section(db, "storage").get("quota_bytes") or env.storage_quota_bytes)
    pct = round(used / quota * 100) if quota else 0
    return {"used_bytes": used, "quota_bytes": quota, "percent": min(pct, 100)}


def ensure_watermark_valid(cfg: dict) -> None:
    try:
        WatermarkPayload(**cfg).validate_rules()
    except ValueError as exc:
        raise invalid("WATERMARK_INVALID", f"水印配置非法：{exc}")
