"""认证与授权：bcrypt 口令 + JWT（access/refresh）+ RBAC 依赖。"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Iterable

import bcrypt
import jwt
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.core.errors import forbidden, unauthorized
from app.models import User

bearer = HTTPBearer(auto_error=False)

# 游客（原「查看者」）< 编辑者 < 管理员 < 超级管理员
ROLE_RANK = {"guest": 0, "editor": 1, "admin": 2, "super": 3}
# 历史取值兼容：viewer 已更名为 guest，旧库/旧 token 读到即等价
ROLE_ALIASES = {"viewer": "guest", "visitor": "guest", "readonly": "guest"}
# 管理入口（成员与权限 / 系统设置）：admin 与 super 均可进入
ADMIN_ROLES = ("admin", "super")
# 管理员只能管理游客；超级管理员可管理全部账号
ADMIN_MANAGED_ROLES = ("guest",)
ROLE_LABELS = {"guest": "游客", "editor": "编辑者", "admin": "管理员", "super": "超级管理员"}


def normalize_role(role: str | None) -> str:
    key = (role or "").strip().lower()
    return ROLE_ALIASES.get(key, key) or "guest"


def rank_of(user_or_role: User | str) -> int:
    role = user_or_role.role if isinstance(user_or_role, User) else user_or_role
    return ROLE_RANK.get(normalize_role(role), -1)


def can_manage(actor: User, target: User) -> bool:
    """账号管理权限：super 管全部（含 admin），admin 只管理游客，其余一律不可。"""
    if actor.id == target.id:
        return False  # 改自己走 /auth/me
    actor_role = normalize_role(actor.role)
    if actor_role == "super":
        return True
    if actor_role == "admin":
        return normalize_role(target.role) in ADMIN_MANAGED_ROLES
    return False


def assignable_roles(actor: User) -> tuple[str, ...]:
    """新建/调整角色时的可分配集合。"""
    if normalize_role(actor.role) == "super":
        return ("admin", "editor", "guest")
    if normalize_role(actor.role) == "admin":
        return ("guest",)
    return ()


def hash_password(raw: str) -> str:
    return bcrypt.hashpw(raw.encode("utf-8")[:72], bcrypt.gensalt(rounds=10)).decode()


def verify_password(raw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(raw.encode("utf-8")[:72], hashed.encode())
    except ValueError:
        return False


def _encode(user: User, kind: str, ttl: timedelta) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user.id,
        "role": normalize_role(user.role),
        "tv": user.token_version,
        "type": kind,
        "iat": int(now.timestamp()),
        "exp": int((now + ttl).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_tokens(user: User) -> tuple[str, str]:
    access = _encode(user, "access", timedelta(minutes=settings.access_token_minutes))
    refresh = _encode(user, "refresh", timedelta(days=settings.refresh_token_days))
    return access, refresh


def decode_token(token: str, expect: str = "access") -> dict:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.ExpiredSignatureError:
        raise unauthorized("登录已过期，请重新登录")
    except jwt.PyJWTError:
        raise unauthorized()
    if payload.get("type") != expect:
        raise unauthorized("凭证类型不正确")
    return payload


def current_user(
    request: Request,
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    token = creds.credentials if creds else None
    # SSE / 下载链接允许用 query 传 token（EventSource 不能自定义 header）
    if not token:
        token = request.query_params.get("access_token")
    if not token:
        raise unauthorized()
    payload = decode_token(token, "access")
    user = db.get(User, payload["sub"])
    if not user or not user.is_active:
        raise unauthorized("账号不存在或已停用")
    # 登出 / 改密 / 停用会递增 token_version，旧凭证立即失效
    if int(payload.get("tv", 0)) != int(user.token_version or 0):
        raise unauthorized("登录状态已失效，请重新登录")
    user.role = normalize_role(user.role)
    request.state.user = user
    return user


def require_roles(*roles: str):
    """用法：Depends(require_roles('editor','admin','super'))"""

    def _dep(user: User = Depends(current_user)) -> User:
        if roles and normalize_role(user.role) not in roles:
            raise forbidden("当前角色无权执行该操作")
        return user

    return _dep


def require_min_role(min_role: str):
    def _dep(user: User = Depends(current_user)) -> User:
        if rank_of(user) < ROLE_RANK[normalize_role(min_role)]:
            raise forbidden("当前角色无权执行该操作")
        return user

    return _dep


require_editor = require_min_role("editor")
require_admin = require_roles(*ADMIN_ROLES)


def is_admin(user: User) -> bool:
    return normalize_role(user.role) in ADMIN_ROLES


def is_super(user: User) -> bool:
    return normalize_role(user.role) == "super"


def scope_allows(user: User) -> bool:
    """scope_all=false 时只能看自己创建的数据。"""
    return bool(user.scope_all) or is_admin(user)


def visible_roles(user: User) -> Iterable[str]:
    return [normalize_role(user.role)]
