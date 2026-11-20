"""Pydantic 契约：请求校验 + 响应模型（时间统一 ISO8601 UTC，带 Z）。"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Any, Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer, field_validator

T = TypeVar("T")


def _iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


UtcTime = Annotated[datetime, PlainSerializer(_iso, return_type=str | None)]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int


# ---------------------------------------------------------------------- 认证 / 成员
class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=32)
    password: str = Field(min_length=1, max_length=72)


class UserBrief(ORM):
    id: str
    username: str
    name: str
    role: str
    avatar: str | None = None
    # 个人资料页需要展示的账号信息（登录响应里一并带上，避免二次请求）
    scope_all: bool = False
    last_login_at: UtcTime | None = None
    created_at: UtcTime | None = None


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserBrief


class RefreshIn(BaseModel):
    refresh_token: str


class UserOut(ORM):
    id: str
    username: str
    name: str
    role: str
    scope_all: bool
    is_active: bool
    avatar: str | None = None
    last_login_at: UtcTime | None = None
    created_at: UtcTime


class UserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    username: str = Field(pattern=r"^[A-Za-z0-9_.-]{3,20}$")
    password: str = Field(min_length=8, max_length=72)
    role: Literal["super", "admin", "editor", "guest"] = "guest"
    scope_all: bool = False


class UserUpdate(BaseModel):
    """super 可改任意账号；admin 只能改游客的姓名 / 用户名 / 密码。"""

    name: str | None = Field(default=None, min_length=1, max_length=64)
    username: str | None = Field(default=None, pattern=r"^[A-Za-z0-9_.-]{3,20}$")
    password: str | None = Field(default=None, min_length=8, max_length=72)
    role: Literal["super", "admin", "editor", "guest"] | None = None
    scope_all: bool | None = None
    is_active: bool | None = None


class MeUpdate(BaseModel):
    """个人资料：改自己的姓名 / 用户名 / 密码（改密需校验原密码）。"""

    name: str | None = Field(default=None, min_length=1, max_length=64)
    username: str | None = Field(default=None, pattern=r"^[A-Za-z0-9_.-]{3,20}$")
    old_password: str | None = Field(default=None, max_length=72)
    new_password: str | None = Field(default=None, min_length=8, max_length=72)


class ResetPasswordIn(BaseModel):
    password: str = Field(min_length=8, max_length=72)


class ChangePasswordIn(BaseModel):
    old_password: str
    new_password: str = Field(min_length=8, max_length=72)


# ---------------------------------------------------------------------- 水印配置
POSITIONS = (
    "left_top",
    "top_center",
    "right_top",
    "left_middle",
    "center",
    "right_middle",
    "left_bottom",
    "bottom_center",
    "right_bottom",
)


class WatermarkPayload(BaseModel):
    text_on: bool = True
    text: str = "健衡学院"
    text_position: str = "right_bottom"
    font_size: int = 40
    font_color: str = "#FFFFFF"
    text_opacity: float = 0.8
    logo_on: bool = False
    logo_asset_id: str | None = None
    logo_position: str = "left_top"
    logo_width: int = 160
    logo_opacity: float = 0.85
    margin: int = 40
    crf: int = 20
    preset: str = "medium"
    threads: int = 8

    @field_validator("text_position", "logo_position")
    @classmethod
    def _pos(cls, v: str) -> str:
        if v not in POSITIONS:
            raise ValueError(f"位置非法：{v}")
        return v

    @field_validator("preset")
    @classmethod
    def _preset(cls, v: str) -> str:
        if v not in ("ultrafast", "veryfast", "fast", "medium", "slow"):
            raise ValueError("编码预设非法")
        return v

    def validate_rules(self) -> None:
        """对应文档 8.3 校验规则，失败抛 WATERMARK_INVALID。"""
        from app.core.errors import invalid

        if not self.text_on and not self.logo_on:
            raise invalid("WATERMARK_INVALID", "文字水印与 Logo 水印至少启用一项")
        if self.text_on and not self.text.strip():
            raise invalid("WATERMARK_INVALID", "启用文字水印时文字内容不能为空")
        if self.logo_on and not self.logo_asset_id:
            raise invalid("WATERMARK_INVALID", "启用 Logo 水印时必须选择 Logo 素材")
        if not 8 <= self.font_size <= 200:
            raise invalid("WATERMARK_INVALID", "字号需在 8~200 之间")
        if not 32 <= self.logo_width <= 800:
            raise invalid("WATERMARK_INVALID", "Logo 宽度需在 32~800 之间")
        if not 0 <= self.margin <= 400:
            raise invalid("WATERMARK_INVALID", "边距需在 0~400 之间")
        if not 18 <= self.crf <= 28:
            raise invalid("WATERMARK_INVALID", "CRF 需在 18~28 之间")
        if not 0.1 <= self.text_opacity <= 1 or not 0.1 <= self.logo_opacity <= 1:
            raise invalid("WATERMARK_INVALID", "不透明度需在 0.1~1 之间")
        if not 1 <= self.threads <= 32:
            raise invalid("WATERMARK_INVALID", "线程数需在 1~32 之间")


class WatermarkConfigIn(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    is_default: bool = False
    config: WatermarkPayload


class WatermarkConfigOut(ORM):
    id: str
    name: str
    is_default: bool
    config: dict
    updated_at: UtcTime


# ---------------------------------------------------------------------- 任务
class TaskCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    task_type: Literal["video", "article", "prompt"]

    # video
    asset_id: str | None = None
    save_to_assets: bool = True
    output_folder: str | None = None
    watermark_config: WatermarkPayload | None = None

    # article
    platform: Literal["xhs", "weibo", "wechat", "douyin"] | None = None
    content_type: Literal["science", "commerce", "course", "event", "market"] | None = None
    audience: Literal["general", "professional", "mixed"] | None = None
    keyword: str | None = None
    keyword_strategy: Literal["auto", "existing", "off"] | None = "auto"

    # article + prompt
    requirement: str | None = None
    ref_image_asset_ids: list[str] = Field(default_factory=list)

    @field_validator("name")
    @classmethod
    def _strip(cls, v: str) -> str:
        return v.strip()


class TaskOut(ORM):
    id: str
    name: str
    task_type: str
    status: str
    progress: int = 0
    node: str | None = None
    error: str | None = None
    save_to_assets: bool = True
    output_asset_id: str | None = None
    created_by: str
    created_by_name: str | None = None
    created_at: UtcTime
    started_at: UtcTime | None = None
    finished_at: UtcTime | None = None
    result: dict | None = None
    detail: dict | None = None


class TaskPage(Page[TaskOut]):
    counts: dict[str, int] | None = None


# ---------------------------------------------------------------------- 素材
class AssetOut(ORM):
    id: str
    name: str
    type: str
    ext: str | None = None
    mime: str | None = None
    size_bytes: int
    source: str
    source_task_id: str | None = None
    ref_id: str | None = None
    folder: str | None = None
    duration_seconds: int | None = None
    width: int | None = None
    height: int | None = None
    created_by: str
    created_at: UtcTime
    download_url: str | None = None
    thumbnail_url: str | None = None


class AssetPage(Page[AssetOut]):
    pass


class BatchIds(BaseModel):
    ids: list[str]


# ---------------------------------------------------------------------- 草稿
class ArticleDraftIn(BaseModel):
    title: str | None = None
    platform: str | None = None
    content_type: str | None = None
    audience: str | None = None
    requirement: str | None = None
    body: str | None = None
    tags: list[str] = Field(default_factory=list)
    compliance_check: str | None = None
    coverage_check: str | None = None
    save_to_assets: bool = True


class PromptDraftIn(BaseModel):
    requirement: str | None = None
    prompt_text: str | None = None
    prompt_cn: str | None = None
    elements: str | None = None
    params: str | None = None
    save_to_assets: bool = True


class DraftOut(ORM):
    id: str
    kind: str
    title: str | None = None
    platform: str | None = None
    content_type: str | None = None
    audience: str | None = None
    requirement: str | None = None
    body: str | None = None
    tags: list[str] | None = None
    compliance_check: str | None = None
    coverage_check: str | None = None
    prompt_json: dict | None = None
    asset_id: str | None = None
    updated_at: UtcTime


class DraftSaved(BaseModel):
    draft: DraftOut
    asset: AssetOut | None = None


# ---------------------------------------------------------------------- 系统
class SystemSettingsOut(BaseModel):
    ai: dict[str, Any]
    ai_image: dict[str, Any]
    worker: dict[str, Any]
    storage: dict[str, Any]
    lexicon: dict[str, Any]
    watermark_default: dict[str, Any]
    updated_at: UtcTime | None = None


class SystemSettingsPatch(BaseModel):
    ai: dict[str, Any] | None = None
    ai_image: dict[str, Any] | None = None
    worker: dict[str, Any] | None = None
    lexicon: dict[str, Any] | None = None


class ServiceStatusOut(ORM):
    service_name: str
    state: str
    node: str | None = None
    heartbeat_at: UtcTime
    running: int = 0
    pending: int = 0
    summary: str | None = None
