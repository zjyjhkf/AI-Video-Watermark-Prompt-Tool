"""词库：写作任务包查询与补采（原 Node/Playwright 采集收敛为库内数据 + 可插拔采集器）。"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import LexiconKeyword

TAG_SUFFIX = ["的作用", "怎么选", "哪个牌子好", "测评", "缺点"]
INTENTS = ["危害风险", "怎么选", "使用方法", "价格"]


def serialize(row: LexiconKeyword) -> dict:
    return {
        "keyword": row.keyword,
        "hit": True,
        "domain": row.domain,
        "tags": row.tags or [],
        "content_by_intent": row.content_by_intent or {},
        "hubs": row.hubs or [],
        "hot": row.hot or [],
        "updated_at": row.updated_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def plan(db: Session, keyword: str, strategy: str = "auto") -> dict:
    row = db.scalars(select(LexiconKeyword).where(LexiconKeyword.keyword == keyword)).first()
    if row:
        return serialize(row)
    return {"keyword": keyword, "hit": False, "strategy": strategy}


def ensure(db: Session, keyword: str) -> dict:
    row = db.scalars(select(LexiconKeyword).where(LexiconKeyword.keyword == keyword)).first()
    if row:
        row.updated_at = datetime.now(timezone.utc)
        db.add(row)
        db.commit()
        return serialize(row)

    tags = [f"{keyword}{s}" for s in TAG_SUFFIX]
    content = {intent: [f"{keyword}{intent}相关疑问"] for intent in INTENTS}
    hubs = [f"{keyword}的作用", f"{keyword}测评"]
    hot = [{"platform": "小红书", "word": f"{keyword}测评"}]
    row = LexiconKeyword(
        keyword=keyword,
        domain="通用消费品",
        tags=tags,
        content_by_intent=content,
        hubs=hubs,
        hot=hot,
        source="collected",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return serialize(row)
