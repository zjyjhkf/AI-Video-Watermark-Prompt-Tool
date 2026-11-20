"""清空示例数据：只保留超级管理员账号与系统配置。

会删除（不可恢复）：
    素材 / 任务 / 任务产物 / 任务附件 / 草稿 / 水印方案 / 词库 / 除超级管理员外的全部账号
    以及 storage 目录下的全部文件

会保留：
    users 表中的超级管理员（角色 super，存在多个时保留最早创建的那个）
    system_settings（系统设置里的 AI / 生图 / 默认水印 / 队列 / 存储配置）
    service_status（服务心跳）

用法：
    # 先停掉后端服务，否则 SQLite 文件被占用（Windows）
    ./backend/.venv/Scripts/python.exe scripts/purge_demo.py

加 --dry-run 只统计不删除。
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

from sqlalchemy import delete, func, select, update  # noqa: E402

from app.core.config import settings as env  # noqa: E402
from app.core.db import SessionLocal, init_db  # noqa: E402
from app.models import (  # noqa: E402
    Asset,
    Draft,
    LexiconKeyword,
    Task,
    TaskAttachment,
    TaskOutput,
    User,
    WatermarkConfig,
)

TABLES = [
    ("素材 assets", Asset),
    ("任务 tasks", Task),
    ("任务产物 task_outputs", TaskOutput),
    ("任务附件 task_attachments", TaskAttachment),
    ("草稿 drafts", Draft),
    ("水印方案 watermark_configs", WatermarkConfig),
    ("词库 lexicon_keywords", LexiconKeyword),
    ("账号 users", User),
]


def _purge_storage() -> int:
    root = Path(env.storage_root)
    if not root.exists():
        return 0
    removed = 0
    for entry in root.iterdir():
        if entry.is_dir():
            removed += sum(1 for _ in entry.rglob("*") if _.is_file())
            shutil.rmtree(entry)
        else:
            removed += 1
            entry.unlink()
    return removed


def main() -> int:
    dry = "--dry-run" in sys.argv
    init_db()

    with SessionLocal() as db:
        keeper = db.scalars(
            select(User).where(User.role == "super").order_by(User.created_at.asc())
        ).first()
        if keeper is None:
            print("未找到超级管理员账号，已中止（避免把系统清成无人可登录）。")
            return 1

        print("清理前：")
        for label, model in TABLES:
            total = db.scalar(select(func.count()).select_from(model)) or 0
            print(f"  {label:<28} {total}")

        if dry:
            print("\n--dry-run：未做任何删除。")
            return 0

        # tasks.output_asset_id 与 assets.source_task_id 互相引用，先解耦再删
        db.execute(update(Task).values(output_asset_id=None))
        db.execute(delete(TaskOutput))
        db.execute(delete(TaskAttachment))
        db.execute(delete(Draft))
        db.execute(update(Asset).values(source_task_id=None))
        db.execute(delete(Task))
        db.execute(delete(Asset))
        db.execute(delete(WatermarkConfig))
        db.execute(delete(LexiconKeyword))
        db.execute(delete(User).where(User.id != keeper.id))
        db.commit()
        db.refresh(keeper)

        files = _purge_storage()

        print("\n清理后：")
        for label, model in TABLES:
            total = db.scalar(select(func.count()).select_from(model)) or 0
            print(f"  {label:<28} {total}")
        print(f"  已删除存储文件 {files} 个（{env.storage_root}）")

        print("\n保留的唯一账号：")
        print(f"  用户名 {keeper.username}")
        print(f"  姓名   {keeper.name}")
        print(f"  角色   超级管理员（super）")
        print("  密码   未改动（初始密码见 ADMIN_INITIAL_PASSWORD，登录后可在「个人资料」修改）")
        print("\n注意：系统设置与水印默认值已保留，未做重置。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
