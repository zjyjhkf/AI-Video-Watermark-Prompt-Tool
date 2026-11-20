"""成员与权限。

权限矩阵（三层：路由 / 接口 / 数据范围）：
- 超级管理员（super）：可查看并管理全部账号（含管理员、编辑者、游客）
- 管理员（admin）：只能查看并管理「游客」账号，且不能把游客提升为其它角色
- 编辑者 / 游客：无成员管理入口

任何账号修改自己的姓名、用户名、密码，统一走 `PATCH /auth/me`，不经本路由。
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.errors import ApiError, forbidden, not_found
from app.core.security import (
    ADMIN_MANAGED_ROLES,
    can_manage,
    hash_password,
    is_super,
    normalize_role,
    require_admin,
)
from app.models import Asset, Draft, Task, User, WatermarkConfig
from app.schemas import Page, ResetPasswordIn, UserCreate, UserOut, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])


def _out(user: User) -> UserOut:
    data = UserOut.model_validate(user)
    data.role = normalize_role(user.role)
    return data


def _guard_target(actor: User, target: User) -> None:
    if not can_manage(actor, target):
        raise forbidden("只能管理游客账号，该账号需由超级管理员处理")


def _ensure_username_free(db: Session, username: str, exclude_id: str | None = None) -> str:
    key = username.strip().lower()
    stmt = select(User).where(User.username == key)
    if exclude_id:
        stmt = stmt.where(User.id != exclude_id)
    if db.scalars(stmt).first():
        raise ApiError("DUPLICATE_USERNAME", "用户名已存在", 409)
    return key


@router.get("", response_model=Page[UserOut])
def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    query: str | None = None,
    role: str | None = None,
    db: Session = Depends(get_db),
    actor: User = Depends(require_admin),
) -> Page[UserOut]:
    stmt = select(User)
    if not is_super(actor):
        # 管理员的数据范围：只有游客
        stmt = stmt.where(User.role.in_(ADMIN_MANAGED_ROLES))
    if role:
        wanted = normalize_role(role)
        if not is_super(actor) and wanted not in ADMIN_MANAGED_ROLES:
            stmt = stmt.where(User.id.is_(None))
        else:
            stmt = stmt.where(User.role == wanted)
    if query:
        like = f"%{query.strip()}%"
        stmt = stmt.where(or_(User.name.ilike(like), User.username.ilike(like)))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = list(
        db.scalars(
            stmt.order_by(User.created_at.asc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    )
    return Page[UserOut](
        items=[_out(u) for u in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=UserOut, status_code=201)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_admin),
) -> UserOut:
    wanted = normalize_role(payload.role)
    if not is_super(actor) and wanted not in ADMIN_MANAGED_ROLES:
        raise forbidden("管理员只能创建游客账号")
    username = _ensure_username_free(db, payload.username)
    user = User(
        username=username,
        name=payload.name.strip(),
        password_hash=hash_password(payload.password),
        role=wanted,
        scope_all=payload.scope_all,
        must_change_password=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _out(user)


@router.get("/{user_id}", response_model=UserOut)
def get_user(
    user_id: str, db: Session = Depends(get_db), actor: User = Depends(require_admin)
) -> UserOut:
    user = db.get(User, user_id)
    if not user:
        raise not_found("NOT_FOUND", "成员不存在")
    _guard_target(actor, user)
    return _out(user)


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: str,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_admin),
) -> UserOut:
    user = db.get(User, user_id)
    if not user:
        raise not_found("NOT_FOUND", "成员不存在")
    _guard_target(actor, user)

    data = payload.model_dump(exclude_none=True)
    target_role = normalize_role(user.role)

    if "role" in data:
        wanted = normalize_role(data["role"])
        if wanted != target_role and not is_super(actor):
            raise forbidden("管理员不能调整角色，只能管理游客资料")
        if target_role == "super" and wanted != "super":
            raise forbidden("不能降级超级管理员，请先转移账号所有权")
        data["role"] = wanted
    if "is_active" in data and data["is_active"] is False and user.id == actor.id:
        raise forbidden("不能停用自己的账号")
    if "username" in data:
        data["username"] = _ensure_username_free(db, data["username"], exclude_id=user.id)
    if "name" in data:
        data["name"] = str(data["name"]).strip()
        if not data["name"]:
            raise ApiError("VALIDATION_ERROR", "姓名不能为空", 422)

    password = data.pop("password", None)
    for key, value in data.items():
        setattr(user, key, value)

    if password:
        user.password_hash = hash_password(password)
        user.must_change_password = True
        user.token_version += 1
    elif data.get("is_active") is False:
        user.token_version += 1

    db.add(user)
    db.commit()
    db.refresh(user)
    return _out(user)


@router.delete("/{user_id}", status_code=204)
def delete_user(
    user_id: str,
    db: Session = Depends(get_db),
    actor: User = Depends(require_admin),
) -> Response:
    user = db.get(User, user_id)
    if not user:
        raise not_found("NOT_FOUND", "成员不存在")
    if normalize_role(user.role) == "super":
        raise forbidden("超级管理员不可移除")
    if user.id == actor.id:
        raise forbidden("不能移除自己")
    _guard_target(actor, user)

    # 没有任何业务引用时物理删除，避免停用账号长期占着成员列表；
    # 有引用（任务 / 素材 / 草稿 / 水印方案）则软删，保留审计线索。
    refs = 0
    for model in (Task, Asset, Draft, WatermarkConfig):
        refs += (
            db.scalar(
                select(func.count()).select_from(model).where(model.created_by == user.id)
            )
            or 0
        )
    if refs == 0:
        db.delete(user)
        db.commit()
        return Response(status_code=204)

    user.is_active = False
    user.token_version += 1
    db.add(user)
    db.commit()
    return Response(status_code=204)


@router.post("/{user_id}/reset-password", status_code=204)
def reset_password(
    user_id: str,
    payload: ResetPasswordIn,
    db: Session = Depends(get_db),
    actor: User = Depends(require_admin),
) -> Response:
    user = db.get(User, user_id)
    if not user:
        raise not_found("NOT_FOUND", "成员不存在")
    _guard_target(actor, user)
    user.password_hash = hash_password(payload.password)
    user.must_change_password = True
    user.token_version += 1
    db.add(user)
    db.commit()
    return Response(status_code=204)
