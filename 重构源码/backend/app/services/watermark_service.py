"""水印渲染：ffmpeg 子进程 + 九宫格定位；无 ffmpeg 时降级为原样输出（不伪造结果）。"""
from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

from app.core.config import settings
from app.storage import ffmpeg_available


# ---------------------------------------------------------------------- 工具
def _font_file() -> str | None:
    candidates = []
    if sys.platform.startswith("win"):
        candidates += [
            r"C:\Windows\Fonts\msyh.ttc",
            r"C:\Windows\Fonts\msyhbd.ttc",
            r"C:\Windows\Fonts\simhei.ttf",
            r"C:\Windows\Fonts\simsun.ttc",
        ]
    elif sys.platform == "darwin":
        candidates += ["/System/Library/Fonts/PingFang.ttc", "/Library/Fonts/Arial.ttf"]
    else:
        candidates += [
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
            "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
        ]
    for c in candidates:
        if Path(c).exists():
            return c
    return None


def _escape_path(p: str) -> str:
    """ffmpeg filter 里 Windows 路径要转义盘符冒号，并统一用正斜杠。"""
    p = p.replace("\\", "/")
    return p.replace(":", r"\:")


def _escape_text(t: str) -> str:
    out = t.replace("\\", r"\\").replace(":", r"\:").replace("'", r"\'").replace("%", r"\%")
    return out.replace("\n", " ")


def _xy(pos: str, margin: int, is_text: bool = True) -> tuple[str, str]:
    obj_w = "text_w" if is_text else "w"
    obj_h = "text_h" if is_text else "h"
    horiz, vert = pos.split("_") if pos != "center" else ("center", "middle")
    if pos == "center":
        horiz, vert = "center", "middle"

    x = {
        "left": f"{margin}",
        "center": f"(W-{obj_w})/2" if not is_text else f"(w-{obj_w})/2",
        "right": f"W-{obj_w}-{margin}" if not is_text else f"w-{obj_w}-{margin}",
    }[horiz]
    y = {
        "top": f"{margin}",
        "middle": f"(H-{obj_h})/2" if not is_text else f"(h-{obj_h})/2",
        "bottom": f"H-{obj_h}-{margin}" if not is_text else f"h-{obj_h}-{margin}",
    }[vert]
    return x, y


def _text_filter(wm: dict, width: int, margin: int) -> str | None:
    if not wm.get("text_on"):
        return None
    text = (wm.get("text") or "").strip()
    if not text:
        return None
    scale = max(width, 1) / 1920
    size = max(8, int(round((wm.get("font_size") or 40) * scale)))
    color = (wm.get("font_color") or "#FFFFFF").replace("#", "0x")
    opacity = wm.get("text_opacity", 0.8)
    x, y = _xy(wm.get("text_position") or "right_bottom", margin, is_text=True)
    parts = [
        f"text='{_escape_text(text)}'",
        f"fontsize={size}",
        f"fontcolor={color}@{opacity}",
        "borderw=0",
        f"x={x}",
        f"y={y}",
    ]
    font = _font_file()
    if font:
        parts.insert(0, f"fontfile='{_escape_path(font)}'")
    return "drawtext=" + ":".join(parts)


def _watermark_scale(width: int) -> float:
    return max(width, 1) / 1920


def build_filter(wm: dict, width: int, has_logo: bool) -> tuple[str, bool]:
    """返回 (filter_complex, 是否需要第二路输入)。"""
    margin = int(round((wm.get("margin") or 40) * _watermark_scale(width)))
    text_f = _text_filter(wm, width, margin)

    if has_logo:
        lw = max(16, int(round((wm.get("logo_width") or 160) * _watermark_scale(width))))
        op = wm.get("logo_opacity", 0.85)
        x, y = _xy(wm.get("logo_position") or "left_top", margin, is_text=False)
        chain = f"[1:v]format=rgba,scale={lw}:-1,colorchannelmixer=aa={op}[logo]"
        if text_f:
            return (
                f"{chain};[0:v][logo]overlay={x}:{y}[base];[base]{text_f}[v]",
                True,
            )
        return f"{chain};[0:v][logo]overlay={x}:{y}[v]", True

    if text_f:
        return f"[0:v]{text_f}[v]", False
    return "[0:v]null[v]", False


# ---------------------------------------------------------------------- 渲染
def render_video(
    src: Path,
    dst: Path,
    wm: dict,
    *,
    width: int,
    duration_seconds: float | None,
    logo_path: Path | None,
    on_progress=None,
) -> dict:
    """返回 {engine, note}。engine=copy 表示仅原样输出（未检测到 ffmpeg）。"""
    dst.parent.mkdir(parents=True, exist_ok=True)

    if not ffmpeg_available():
        shutil.copyfile(src, dst)
        if on_progress:
            on_progress(1.0)
        return {
            "engine": "copy",
            "note": "未检测到 ffmpeg，已按原样输出。安装 ffmpeg 或配置 FFMPEG_PATH 后重试即可真正渲染。",
        }

    filt, need_logo = build_filter(wm, width, bool(logo_path))
    cmd = [settings.ffmpeg_path, "-y", "-i", str(src)]
    if need_logo and logo_path:
        cmd += ["-i", str(logo_path)]
    cmd += [
        "-filter_complex",
        filt,
        "-map",
        "[v]",
        "-map",
        "0:a?",
        "-c:v",
        "libx264",
        "-preset",
        str(wm.get("preset") or "medium"),
        "-crf",
        str(wm.get("crf") or 20),
        "-threads",
        str(wm.get("threads") or 8),
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "copy",
        "-progress",
        "pipe:1",
        "-nostats",
        str(dst),
    ]

    proc = subprocess.Popen(
        cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1
    )
    assert proc.stdout is not None
    total_ms = (duration_seconds or 0) * 1000
    for line in proc.stdout:
        line = line.strip()
        if line.startswith("out_time_ms=") and total_ms > 0 and on_progress:
            try:
                done_ms = int(line.split("=", 1)[1])
                on_progress(max(0.02, min(0.99, done_ms / total_ms)))
            except ValueError:
                pass
    err = proc.stderr.read() if proc.stderr else ""
    code = proc.wait()
    if code != 0 or not dst.exists():
        raise RuntimeError(f"ffmpeg 渲染失败：{err[-600:]}")
    if on_progress:
        on_progress(1.0)
    return {"engine": "ffmpeg", "note": None}


def preview_frame(
    src: Path,
    dst: Path,
    wm: dict,
    *,
    at_seconds: float,
    width: int,
    logo_path: Path | None,
) -> bool:
    """抽一帧带水印的 JPEG 作为预览；失败返回 False。"""
    if not ffmpeg_available():
        return False
    filt, need_logo = build_filter(wm, width, bool(logo_path))
    dst.parent.mkdir(parents=True, exist_ok=True)
    if need_logo and logo_path:
        cmd = [settings.ffmpeg_path, "-y", "-ss", f"{at_seconds:.2f}", "-i", str(src), "-i", str(logo_path)]
    else:
        cmd = [settings.ffmpeg_path, "-y", "-ss", f"{at_seconds:.2f}", "-i", str(src)]
    cmd += ["-filter_complex", filt, "-map", "[v]", "-frames:v", "1", "-q:v", "3", str(dst)]
    try:
        subprocess.run(cmd, capture_output=True, timeout=60, check=True)
    except (subprocess.SubprocessError, OSError):
        return False
    return dst.exists() and dst.stat().st_size > 0
