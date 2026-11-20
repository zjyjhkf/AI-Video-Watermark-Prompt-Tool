"""统一错误结构：{code, message, detail, request_id}。"""
from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import settings


class ApiError(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        status: int = 400,
        detail: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.detail = detail or {}


# 常用错误快捷构造
def unauthorized(msg: str = "未登录或登录已过期") -> ApiError:
    return ApiError("UNAUTHORIZED", msg, 401)


def forbidden(msg: str = "权限不足") -> ApiError:
    return ApiError("FORBIDDEN", msg, 403)


def not_found(code: str = "NOT_FOUND", msg: str = "资源不存在") -> ApiError:
    return ApiError(code, msg, 404)


def invalid(code: str, msg: str, detail: dict | None = None) -> ApiError:
    return ApiError(code, msg, 422, detail)


def _payload(request: Request, code: str, message: str, detail: dict | None = None) -> dict:
    return {
        "code": code,
        "message": message,
        "detail": detail or {},
        "request_id": getattr(request.state, "request_id", "req_local"),
    }


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(request: Request, exc: ApiError):
        return JSONResponse(
            status_code=exc.status,
            content=_payload(request, exc.code, exc.message, exc.detail),
        )

    @app.exception_handler(RequestValidationError)
    async def _validation(request: Request, exc: RequestValidationError):
        return JSONResponse(
            status_code=422,
            content=_payload(
                request,
                "VALIDATION_ERROR",
                "请求参数校验失败",
                {"errors": exc.errors()},
            ),
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http(request: Request, exc: StarletteHTTPException):
        code = {
            401: "UNAUTHORIZED",
            403: "FORBIDDEN",
            404: "NOT_FOUND",
            413: "FILE_TOO_LARGE",
            415: "UNSUPPORTED_FILE_TYPE",
        }.get(exc.status_code, "INTERNAL_ERROR")
        return JSONResponse(
            status_code=exc.status_code,
            content=_payload(request, code, str(exc.detail)),
        )

    @app.exception_handler(Exception)
    async def _any(request: Request, exc: Exception):
        message = "服务内部错误"
        if settings.debug:
            message = f"{type(exc).__name__}: {exc}"
        return JSONResponse(
            status_code=500,
            content=_payload(request, "INTERNAL_ERROR", message),
        )
