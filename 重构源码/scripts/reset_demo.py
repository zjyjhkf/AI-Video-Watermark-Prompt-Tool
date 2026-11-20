"""重置演示数据：清空本地库与素材目录后重新播种。

用途：把工程交付/演示前的状态恢复到「刚 clone 下来第一次启动」的样子，
避免把联调过程中产生的测试任务、测试素材带进截图与演示。

用法：
    # 先停掉后端服务，否则 SQLite 文件被占用（Windows）
    ./backend/.venv/Scripts/python.exe scripts/reset_demo.py

注意：这是破坏性操作，仅针对本工程的 backend/data 与 storage 两个目录。
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

from app.core.config import settings as env  # noqa: E402
from app.core.db import init_db  # noqa: E402
from app.seed import seed  # noqa: E402


def _purge_data_dir() -> None:
    data_dir = BACKEND / "data"
    if not data_dir.exists():
        return
    for f in data_dir.iterdir():
        if f.is_file():
            f.unlink()
        elif f.is_dir():
            shutil.rmtree(f)


def _purge_storage() -> None:
    root = env.storage_root
    if not root.exists():
        return
    for entry in root.iterdir():
        if entry.is_dir():
            shutil.rmtree(entry)
        else:
            entry.unlink()


def main() -> int:
    print(f"[1/3] 清空 {BACKEND / 'data'}")
    _purge_data_dir()
    print(f"[2/3] 清空 {env.storage_root}")
    _purge_storage()

    print("[3/3] 建表并写入初始账号")
    init_db()
    seed()

    print("\n完成。重新启动后端即可看到干净的初始状态：")
    print("  python -m uvicorn app.main:app --host 127.0.0.1 --port 8020")
    print("说明：初始化只创建唯一超级管理员账号（ADMIN_INITIAL_USERNAME / ADMIN_INITIAL_PASSWORD），")
    print("     不写入任何示例素材、任务、草稿或水印方案。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
