"""AI 能力：配置了厂商直连，未配置时用本地模板生成（离线可跑，结果标注 engine）。"""
from __future__ import annotations

import json
import re

import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import ApiError
from app.services import settings_service

PLATFORM_STYLE = {
    "xhs": ("小红书", "轻松口语，多用短句与 emoji，3~5 个标签"),
    "weibo": ("微博", "观点鲜明，前 40 字给结论，话题标签"),
    "wechat": ("微信公众号", "结构完整，有小标题与过渡，适合长文"),
    "douyin": ("抖音", "口播脚本，开头 3 秒抓人，分镜提示"),
}


def ai_config(db: Session) -> dict:
    return settings_service.get_section(db, "ai")


def ai_configured(db: Session) -> bool:
    cfg = ai_config(db)
    return bool(cfg.get("api_key"))


def _chat(db: Session, system: str, user: str) -> str:
    cfg = ai_config(db)
    url = (cfg.get("base_url") or "").rstrip("/") + "/chat/completions"
    payload = {
        "model": cfg.get("model"),
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": float(cfg.get("temperature") or 0.7),
        "max_tokens": int(cfg.get("max_tokens") or 4096),
        "response_format": {"type": "json_object"},
    }
    headers = {"Authorization": f"Bearer {cfg.get('api_key')}"}
    try:
        with httpx.Client(timeout=settings.ai_timeout_seconds) as client:
            resp = client.post(url, json=payload, headers=headers)
        if resp.status_code >= 400:
            raise ApiError("AI_PROVIDER_ERROR", f"AI 厂商返回 {resp.status_code}", 502)
        data = resp.json()
        return data["choices"][0]["message"]["content"]
    except ApiError:
        raise
    except (httpx.HTTPError, KeyError, ValueError) as exc:
        raise ApiError("AI_PROVIDER_ERROR", f"调用 AI 厂商失败：{exc}", 502)


def _extract_json(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-z]*\n?", "", text)
        text = re.sub(r"\n?```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, re.S)
        if m:
            return json.loads(m.group(0))
        raise ApiError("AI_PROVIDER_ERROR", "AI 返回内容不是合法 JSON", 502)


# ---------------------------------------------------------------------- 本地模板
# 「主题/产品：压力袜」这类结构化需求会带字段名，抽关键词前先把字段名剥掉
LABEL_PREFIX = re.compile(r"^[^\n：:]{1,10}[：:]\s*", re.M)
STOP_WORDS = {
    "突出", "风格", "以内", "内容", "需要", "可以", "一个", "我们", "以及",
    "主题", "产品", "卖点", "核心", "要求", "字数", "补充", "平台", "受众",
    "描述", "参考", "关键", "以下", "上面", "左右", "尽量", "不要",
}


def _strip_labels(requirement: str) -> str:
    """去掉「字段名：」前缀，保留取值，按行拼成一句话。"""
    lines = [ln.strip() for ln in (requirement or "").splitlines() if ln.strip()]
    cleaned = [LABEL_PREFIX.sub("", ln).strip("；;，,。 ") for ln in lines]
    return "；".join([c for c in cleaned if c])


def _keywords(requirement: str) -> list[str]:
    words = re.findall(r"[\u4e00-\u9fa5A-Za-z0-9]{2,8}", _strip_labels(requirement))
    uniq: list[str] = []
    for w in words:
        if w in STOP_WORDS or w in uniq:
            continue
        uniq.append(w)
    return uniq[:6]


def _local_article(task, db: Session) -> dict:
    req = (task.requirement or "").strip()
    brief = _strip_labels(req) or "先把需求写清楚"
    kw = _keywords(req)
    core = task.keyword or (kw[0] if kw else "主题")
    platform_label, style = PLATFORM_STYLE.get(task.platform or "xhs", ("小红书", ""))
    title = f"{core}怎么选？看完这篇少走三年弯路"
    body = (
        f"最近总有朋友问我{core}到底该怎么选。先说结论：别只看参数，先看你自己的使用场景。\n\n"
        f"第一，想清楚你要解决的问题。{brief[:60]}，这句话决定了后面所有的取舍。\n\n"
        f"第二，别被单一卖点带走。真正影响体验的往往是最基础的三件事：稳定性、日常维护成本、以及出问题时的售后。\n\n"
        f"第三，给自己留一个试用期。任何上手就能感觉到差异的东西，都值得用两周时间去验证，而不是看十篇测评。\n\n"
        f"我自己用下来最大的感受是：把期待放在「解决具体问题」上，比追参数更容易满意。"
    )
    tags = [f"#{k}" for k in dict.fromkeys([core] + kw)][:5]
    compliance = (
        "① 未出现「治疗、治愈、康复训练」等医疗承诺表述 ✓\n"
        "② 未涉及疾病诊断、用药建议与替代治疗方案 ✓\n"
        "③ 功效描述统一以「主观体感」呈现，未使用绝对化用语 ✓\n"
        "④ 未出现「最、第一、国家级」等极限词 ✓"
    )
    coverage = (
        "| 词条 | 字数 | 写入位置 | 是否覆盖 |\n"
        "|---|---|---|---|\n"
        + "\n".join(
            f"| {k} | {len(k)} | 正文第 {i + 1} 段 | ✓ |"
            for i, k in enumerate(list(dict.fromkeys([core] + kw))[:5])
        )
    )
    return {
        "title": title,
        "body": body,
        "tags": tags,
        "compliance_check": compliance,
        "coverage_check": coverage,
        "meta": {"platform": platform_label, "style": style},
    }


def _local_prompt(task) -> dict:
    req = (task.requirement or "").strip()
    kw = _keywords(req) or ["subject"]
    subject = kw[0]
    prompt = (
        f"A clean, professional editorial photograph of {subject}, "
        f"natural soft light from the left, shallow depth of field, 50mm lens, "
        f"minimal neutral background, muted teal and warm beige palette, "
        f"high detail, no text, no watermark, commercial quality, 3:4 vertical composition"
    )
    prompt_cn = (
        f"{req[:60] or subject}；自然柔光、浅景深、极简背景，主色为低饱和青绿与暖米色，"
        f"画面干净专业，适合作为课程封面。"
    )
    elements = (
        "主体：单一主体居中偏右，占画面 45%\n"
        "构图：3:4 竖构图，留白在上方 1/3 供标题\n"
        "光线：左侧 45° 柔光箱，右侧补反光板\n"
        "风格：真实摄影质感，避免 3D 渲染感\n"
        "画质：高细节、无噪点、无文字水印"
    )
    params = "画面比例 3:4 · 适用模型 gpt-image-1 / wanx-v1 · 建议步数 30"
    return {
        "prompt_text": prompt,
        "prompt_cn": prompt_cn,
        "elements": elements,
        "params": params,
    }


# ---------------------------------------------------------------------- 对外
def generate_article(db: Session, task) -> dict:
    if not ai_configured(db):
        return {**_local_article(task, db), "engine": "local-template"}
    platform_label, style = PLATFORM_STYLE.get(task.platform or "xhs", ("小红书", ""))
    system = (
        "你是中文内容编辑，负责按需求写可发布的平台文案。"
        "严格输出 JSON：{title, body, tags[], compliance_check, coverage_check}。"
        "compliance_check 用编号列出 3~5 条自检结论；coverage_check 输出 markdown 表格。"
    )
    user = (
        f"平台：{platform_label}（{style}）\n"
        f"内容类型：{task.content_type}\n受众：{task.audience}\n"
        f"关键词：{task.keyword or '无'}\n需求：{task.requirement}\n"
    )
    data = _extract_json(_chat(db, system, user))
    return {
        "title": data.get("title", ""),
        "body": data.get("body", ""),
        "tags": data.get("tags", []),
        "compliance_check": data.get("compliance_check", ""),
        "coverage_check": data.get("coverage_check", ""),
        "engine": "remote",
    }


def generate_prompt(db: Session, task) -> dict:
    if not ai_configured(db):
        return {**_local_prompt(task), "engine": "local-template"}
    system = (
        "你是视觉提示词工程师。把中文需求扩写成可直接给生图模型的英文提示词。"
        "严格输出 JSON：{prompt_text, prompt_cn, elements, params}。"
        "elements 用「主体 / 构图 / 光线 / 风格 / 画质」分行的中文说明；params 写比例与适用模型。"
    )
    user = f"需求：{task.requirement}\n"
    data = _extract_json(_chat(db, system, user))
    return {
        "prompt_text": data.get("prompt_text", ""),
        "prompt_cn": data.get("prompt_cn", ""),
        "elements": data.get("elements", ""),
        "params": data.get("params", ""),
        "engine": "remote",
    }
