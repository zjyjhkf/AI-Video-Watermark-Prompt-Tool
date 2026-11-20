"""存储抽象层：默认本地磁盘，预留 S3/MinIO（换 backend 即可，业务代码不感知）。"""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from app.core.config import settings


class LocalStorage:
    backend = "local"

    def __init__(self, root: Path) -> None:
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------ 基础
    def path_of(self, key: str) -> Path:
        p = (self.root / key).resolve()
        if not str(p).startswith(str(self.root.resolve())):
            raise ValueError("非法存储路径")
        return p

    def save_bytes(self, key: str, data: bytes) -> int:
        p = self.path_of(key)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)
        return len(data)

    def save_stream(self, key: str, src) -> int:
        p = self.path_of(key)
        p.parent.mkdir(parents=True, exist_ok=True)
        with p.open("wb") as fh:
            shutil.copyfileobj(src, fh, length=1024 * 1024)
        return p.stat().st_size

    def read_bytes(self, key: str) -> bytes:
        return self.path_of(key).read_bytes()

    def exists(self, key: str | None) -> bool:
        return bool(key) and self.path_of(key).exists()

    def size_of(self, key: str) -> int:
        p = self.path_of(key)
        return p.stat().st_size if p.exists() else 0

    def delete(self, key: str | None) -> None:
        if not key:
            return
        p = self.path_of(key)
        if p.exists():
            p.unlink()

    def usage_bytes(self) -> int:
        total = 0
        for p in self.root.rglob("*"):
            if p.is_file():
                total += p.stat().st_size
        return total


storage: LocalStorage = LocalStorage(settings.storage_root)


# ---------------------------------------------------------------------- 媒体探测
def have(binary: str) -> bool:
    return shutil.which(binary) is not None


def ffmpeg_available() -> bool:
    if settings.render_engine == "copy":
        return False
    if settings.render_engine == "ffmpeg":
        return True
    return have(settings.ffmpeg_path)


def ffprobe_available() -> bool:
    return have(settings.ffprobe_path)


def probe_media(path: Path) -> dict | None:
    """用 ffprobe 复算媒体元信息；不可用时返回 None（调用方降级处理）。"""
    if not ffprobe_available():
        return None
    cmd = [
        settings.ffprobe_path,
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height,duration,codec_name",
        "-show_entries",
        "format=duration,format_name",
        "-of",
        "json",
        str(path),
    ]
    try:
        out = subprocess.run(cmd, capture_output=True, timeout=30, check=True)
    except (subprocess.SubprocessError, OSError):
        return None
    import json

    try:
        data = json.loads(out.stdout.decode("utf-8", "ignore"))
    except json.JSONDecodeError:
        return None
    stream = (data.get("streams") or [{}])[0]
    fmt = data.get("format") or {}
    duration = stream.get("duration") or fmt.get("duration") or 0
    try:
        duration_f = float(duration)
    except (TypeError, ValueError):
        duration_f = 0.0
    return {
        "duration_seconds": int(round(duration_f)) if duration_f else None,
        "width": stream.get("width"),
        "height": stream.get("height"),
        "codec": stream.get("codec_name"),
        "format": fmt.get("format_name"),
    }
