"""认证路由：登录 / 刷新 / 当前用户 / 登出 / 改密。"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.errors import ApiError, unauthorized
from app.core.security import (
    create_tokens,
    current_user,
    decode_token,
    hash_password,
    verify_password,
)
from app.models import User
from app.schemas import (
    ChangePasswordIn,
    LoginIn,
    MeUpdate,
    RefreshIn,
    TokenOut,
    UserBrief,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _token_response(user: User) -> TokenOut:
    access, refresh = create_tokens(user)
    return TokenOut(
        access_token=access,
        refresh_token=refresh,
        user=UserBrief.model_validate(user),
    )


@router.post("/login", response_model=TokenOut)
def login(payload: LoginIn, db: Session = Depends(get_db)) -> TokenOut:
    user = db.scalars(
        select(User).where(User.username == payload.username.strip().lower())
    ).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise unauthorized("用户名或密码错误，请向管理员确认账号信息")
    if not user.is_active:
        raise ApiError("FORBIDDEN", "账号已停用，请联系管理员", 403)
    user.last_login_at = datetime.now(timezone.utc)
    db.add(user)
    db.commit()
    db.refresh(user)
    return _token_response(user)


@router.post("/refresh", response_model=TokenOut)
def refresh(payload: RefreshIn, db: Session = Depends(get_db)) -> TokenOut:
    data = decode_token(payload.refresh_token, "refresh")
    user = db.get(User, data["sub"])
    if not user or not user.is_active:
        raise unauthorized()
    if int(data.get("tv", 0)) != user.token_version:
        raise unauthorized("登录状态已失效，请重新登录")
    return _token_response(user)


@router.get("/me", response_model=UserBrief)
def me(user: User = Depends(current_user)) -> UserBrief:
    return UserBrief.model_validate(user)


@router.patch("/me", response_model=UserBrief)
def update_me(
    payload: MeUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> UserBrief:
    """个人资料：姓名 / 用户名 / 密码（改密需原密码，改后旧凭证立即失效）。"""
    data = payload.model_dump(exclude_none=True)
    if not data:
        raise ApiError("VALIDATION_ERROR", "没有需要更新的内容", 422)

    new_password = data.pop("new_password", None)
    old_password = data.pop("old_password", None)
    if new_password:
        if not old_password:
            raise ApiError("VALIDATION_ERROR", "修改密码需提供原密码", 422)
        if not verify_password(old_password, user.password_hash):
            raise ApiError("VALIDATION_ERROR", "原密码不正确", 422)
        user.password_hash = hash_password(new_password)
        user.must_change_password = False
        user.token_version += 1
    elif old_password:
        raise ApiError("VALIDATION_ERROR", "请同时填写新密码", 422)

    if "username" in data:
        username = str(data["username"]).strip().lower()
        exists = db.scalars(
            select(User).where(User.username == username, User.id != user.id)
        ).first()
        if exists:
            raise ApiError("DUPLICATE_USERNAME", "用户名已存在", 409)
        user.username = username
    if "name" in data:
        name = str(data["name"]).strip()
        if not name:
            raise ApiError("VALIDATION_ERROR", "姓名不能为空", 422)
        user.name = name

    db.add(user)
    db.commit()
    db.refresh(user)
    return UserBrief.model_validate(user)


@router.post("/logout", status_code=204)
def logout(user: User = Depends(current_user), db: Session = Depends(get_db)) -> Response:
    user.token_version += 1
    db.add(user)
    db.commit()
    return Response(status_code=204)


@router.post("/change-password", status_code=204)
def change_password(
    payload: ChangePasswordIn,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> Response:
    if not verify_password(payload.old_password, user.password_hash):
        raise ApiError("VALIDATION_ERROR", "原密码不正确", 422)
    user.password_hash = hash_password(payload.new_password)
    user.must_change_password = False
    user.token_version += 1
    db.add(user)
    db.commit()
    return Response(status_code=204)
