"""ORM 模型：与 04-数据库设计文档 v1.1 对齐（表名 / 字段 / 索引一致）。"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

ID_LEN = 40


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:20]}"


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )


# --------------------------------------------------------------------------- users
class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(ID_LEN), primary_key=True, default=lambda: new_id("u"))
    username: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False, default="guest")
    scope_all: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    avatar: Mapped[str | None] = mapped_column(String(512))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    must_change_password: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # 登出时自增，使已签发的 refresh_token 全部失效（access_token 靠短 TTL 自然过期）
    token_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    __table_args__ = (
        Index("ix_users_role", "role"),
        Index("ix_users_active", "is_active"),
    )


# --------------------------------------------------------------------------- tasks
class Task(TimestampMixin, Base):
    __tablename__ = "tasks"

    id: Mapped[str] = mapped_column(String(ID_LEN), primary_key=True, default=lambda: new_id("t"))
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    task_type: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    requirement: Mapped[str | None] = mapped_column(Text)
    platform: Mapped[str | None] = mapped_column(String(16))
    content_type: Mapped[str | None] = mapped_column(String(16))
    audience: Mapped[str | None] = mapped_column(String(16))
    keyword: Mapped[str | None] = mapped_column(String(128))
    keyword_strategy: Mapped[str | None] = mapped_column(String(16))
    payload: Mapped[dict | None] = mapped_column(JSON)          # 原始请求（水印配置 / ref 图 / asset_id）
    error: Mapped[str | None] = mapped_column(Text)
    node: Mapped[str | None] = mapped_column(String(64))
    progress: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    save_to_assets: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    output_asset_id: Mapped[str | None] = mapped_column(String(ID_LEN), ForeignKey("assets.id"))
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_by: Mapped[str] = mapped_column(String(ID_LEN), ForeignKey("users.id"), nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    output: Mapped["TaskOutput | None"] = relationship(
        back_populates="task", uselist=False, cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_tasks_status_type", "status", "task_type"),
        Index("ix_tasks_created_by", "created_by"),
        Index("ix_tasks_created_at", "created_at"),
        Index("ix_tasks_status_started", "status", "started_at"),
    )


class TaskOutput(Base):
    __tablename__ = "task_outputs"

    id: Mapped[str] = mapped_column(String(ID_LEN), primary_key=True, default=lambda: new_id("to"))
    task_id: Mapped[str] = mapped_column(
        String(ID_LEN), ForeignKey("tasks.id"), unique=True, nullable=False
    )
    article_json: Mapped[dict | None] = mapped_column(JSON)
    prompt_text: Mapped[str | None] = mapped_column(Text)
    prompt_json: Mapped[dict | None] = mapped_column(JSON)
    output_asset_id: Mapped[str | None] = mapped_column(String(ID_LEN), ForeignKey("assets.id"))
    image_asset_id: Mapped[str | None] = mapped_column(String(ID_LEN), ForeignKey("assets.id"))
    media_json: Mapped[dict | None] = mapped_column(JSON)       # 视频任务的输出元信息
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    task: Mapped[Task] = relationship(back_populates="output")

    __table_args__ = (Index("ix_task_outputs_asset", "output_asset_id"),)


# --------------------------------------------------------------------------- assets
class Asset(TimestampMixin, Base):
    __tablename__ = "assets"

    id: Mapped[str] = mapped_column(String(ID_LEN), primary_key=True, default=lambda: new_id("a"))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(16), nullable=False)
    ext: Mapped[str | None] = mapped_column(String(16))
    mime: Mapped[str | None] = mapped_column(String(128))
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    source: Mapped[str] = mapped_column(String(16), nullable=False, default="upload")
    source_task_id: Mapped[str | None] = mapped_column(String(ID_LEN), ForeignKey("tasks.id"))
    ref_id: Mapped[str | None] = mapped_column(String(ID_LEN))
    storage_key: Mapped[str] = mapped_column(String(512), nullable=False)
    thumbnail_key: Mapped[str | None] = mapped_column(String(512))
    folder: Mapped[str | None] = mapped_column(String(128))
    duration_seconds: Mapped[int | None] = mapped_column(Integer)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    created_by: Mapped[str] = mapped_column(String(ID_LEN), ForeignKey("users.id"), nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        Index("ix_assets_type", "type"),
        Index("ix_assets_source", "source"),
        Index("ix_assets_created_by", "created_by"),
        Index("ix_assets_folder", "folder"),
        Index("ix_assets_deleted_at", "deleted_at"),
        # 一个任务只产出一个成品，重试覆盖不新增
        Index(
            "uq_assets_task_output",
            "source_task_id",
            unique=True,
            sqlite_where=text("source = 'task'"),
            postgresql_where=text("source = 'task'"),
        ),
        # 一份草稿只对应一个 .md 素材
        Index(
            "uq_assets_draft",
            "ref_id",
            unique=True,
            sqlite_where=text("source = 'draft'"),
            postgresql_where=text("source = 'draft'"),
        ),
    )


class TaskAttachment(Base):
    __tablename__ = "task_attachments"

    id: Mapped[str] = mapped_column(String(ID_LEN), primary_key=True, default=lambda: new_id("ta"))
    task_id: Mapped[str] = mapped_column(String(ID_LEN), ForeignKey("tasks.id"), nullable=False)
    asset_id: Mapped[str] = mapped_column(String(ID_LEN), ForeignKey("assets.id"), nullable=False)
    role: Mapped[str] = mapped_column(String(24), nullable=False)

    __table_args__ = (
        Index("uq_task_attachment", "task_id", "asset_id", "role", unique=True),
        Index("ix_task_attachment_asset", "asset_id"),
    )


# --------------------------------------------------------------------------- watermark configs
class WatermarkConfig(TimestampMixin, Base):
    __tablename__ = "watermark_configs"

    id: Mapped[str] = mapped_column(String(ID_LEN), primary_key=True, default=lambda: new_id("wc"))
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    config: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_by: Mapped[str] = mapped_column(String(ID_LEN), ForeignKey("users.id"), nullable=False)

    __table_args__ = (Index("ix_watermark_configs_owner", "created_by"),)


# --------------------------------------------------------------------------- drafts
class Draft(TimestampMixin, Base):
    __tablename__ = "drafts"

    id: Mapped[str] = mapped_column(String(ID_LEN), primary_key=True, default=lambda: new_id("d"))
    kind: Mapped[str] = mapped_column(String(16), nullable=False, default="article")
    title: Mapped[str | None] = mapped_column(String(255))
    platform: Mapped[str | None] = mapped_column(String(16))
    content_type: Mapped[str | None] = mapped_column(String(16))
    audience: Mapped[str | None] = mapped_column(String(16))
    requirement: Mapped[str | None] = mapped_column(Text)
    body: Mapped[str | None] = mapped_column(Text)
    tags: Mapped[list | None] = mapped_column(JSON)
    compliance_check: Mapped[str | None] = mapped_column(Text)
    coverage_check: Mapped[str | None] = mapped_column(Text)
    prompt_json: Mapped[dict | None] = mapped_column(JSON)
    asset_id: Mapped[str | None] = mapped_column(String(ID_LEN), ForeignKey("assets.id"), unique=True)
    source_task_id: Mapped[str | None] = mapped_column(String(ID_LEN), ForeignKey("tasks.id"))
    created_by: Mapped[str] = mapped_column(String(ID_LEN), ForeignKey("users.id"), nullable=False)

    __table_args__ = (
        Index("ix_drafts_owner_kind", "created_by", "kind"),
        Index("ix_drafts_updated", "updated_at"),
    )


# --------------------------------------------------------------------------- lexicon
class LexiconKeyword(Base):
    __tablename__ = "lexicon_keywords"

    id: Mapped[str] = mapped_column(String(ID_LEN), primary_key=True, default=lambda: new_id("lx"))
    keyword: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    domain: Mapped[str | None] = mapped_column(String(128))
    tags: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    content_by_intent: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    hubs: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    hot: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    source: Mapped[str] = mapped_column(String(16), nullable=False, default="collected")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )


# --------------------------------------------------------------------------- settings / status
class SystemSetting(Base):
    __tablename__ = "system_settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    is_secret: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )


class ServiceStatus(Base):
    __tablename__ = "service_status"

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, default=1)
    service_name: Mapped[str] = mapped_column(String(64), nullable=False)
    state: Mapped[str] = mapped_column(String(16), nullable=False, default="online")
    node: Mapped[str | None] = mapped_column(String(64))
    running: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    pending: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    summary: Mapped[str | None] = mapped_column(String(255))
    heartbeat_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
