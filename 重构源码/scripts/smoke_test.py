"""端到端烟测：登录 → 权限 → 素材 → 三类任务 → 草稿 → 设置 → 清理。

不依赖任何示例数据：脚本自己创建编辑器 / 游客账号，跑完把账号与产物全部清掉。

跑法：
    backend/.venv/Scripts/python.exe scripts/smoke_test.py [base_url]
"""
from __future__ import annotations

import json
import struct
import sys
import time
import zlib

import httpx

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8020") + "/api/v1"
USER, PWD = "linan", "demo1234"

EDITOR = {"name": "烟测编辑", "username": "smk_editor", "role": "editor"}
GUEST = {"name": "烟测游客", "username": "smk_guest", "role": "guest"}
TMP_PWD = "smoke12345678"

ok_count = 0
fail: list[str] = []


def check(name: str, cond: bool, extra: str = "") -> None:
    global ok_count
    if cond:
        ok_count += 1
        print(f"  ✓ {name}")
    else:
        fail.append(name)
        print(f"  ✗ {name} {extra}")


def png(w: int = 320, h: int = 240) -> bytes:
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        for x in range(w):
            raw += bytes((20 + x % 60, 120 + y % 80, 108))

    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(bytes(raw), 6))
        + chunk(b"IEND", b"")
    )


def main() -> int:
    c = httpx.Client(timeout=60, trust_env=False)  # 本机烟测绕过系统代理

    print("\n[1] 认证")
    r = c.post(f"{BASE}/auth/login", json={"username": USER, "password": PWD})
    check("登录 200", r.status_code == 200, r.text[:200])
    if r.status_code != 200:
        print("  请确认超级管理员账号密码（默认 linan / demo1234，可通过环境变量覆盖）")
        return 1
    token = r.json()["access_token"]
    H = {"Authorization": f"Bearer {token}"}
    check("返回 access/refresh", bool(r.json().get("refresh_token")))
    r = c.get(f"{BASE}/auth/me", headers=H)
    check("me 返回 super", r.json().get("role") == "super", r.text[:120])

    r = c.post(f"{BASE}/auth/login", json={"username": USER, "password": "wrong"})
    check("错误密码 401", r.status_code == 401)
    check("错误结构含 code", r.json().get("code") == "UNAUTHORIZED", r.text[:120])

    print("\n[2] 权限（三层拦截）")
    # 幂等：先清掉上次可能残留的测试账号（物理删除，无业务引用）
    for spec in (EDITOR, GUEST):
        page = c.get(f"{BASE}/users?page_size=100", headers=H).json()
        for u in page["items"]:
            if u["username"] == spec["username"]:
                c.delete(f"{BASE}/users/{u['id']}", headers=H)

    created_users: list[str] = []
    for spec in (EDITOR, GUEST):
        existing = next(
            (
                u
                for u in c.get(f"{BASE}/users?page_size=100", headers=H).json()["items"]
                if u["username"] == spec["username"]
            ),
            None,
        )
        if existing:
            # 上次中断可能留下软删的账号：直接恢复并重置密码，避免用户名占用
            c.patch(f"{BASE}/users/{existing['id']}", headers=H, json={"is_active": True})
            c.post(
                f"{BASE}/users/{existing['id']}/reset-password",
                headers=H,
                json={"password": TMP_PWD},
            )
            check(f"复用已存在的{spec['name']}", True)
            continue
        r = c.post(
            f"{BASE}/users",
            headers=H,
            json={**spec, "password": TMP_PWD, "scope_all": True},
        )
        check(f"创建{spec['name']} 201", r.status_code == 201, r.text[:200])
        if r.status_code == 201:
            created_users.append(r.json()["id"])

    et = c.post(f"{BASE}/auth/login", json={"username": EDITOR["username"], "password": TMP_PWD})
    EH = {"Authorization": f"Bearer {et.json()['access_token']}"}
    gt = c.post(f"{BASE}/auth/login", json={"username": GUEST["username"], "password": TMP_PWD})
    GH = {"Authorization": f"Bearer {gt.json()['access_token']}"}

    r = c.get(f"{BASE}/users", headers=EH)
    check("editor 访问成员 → 403", r.status_code == 403, r.text[:120])
    r = c.get(f"{BASE}/system/settings", headers=EH)
    check("editor 访问设置 → 403", r.status_code == 403)
    r = c.get(f"{BASE}/users", headers=GH)
    check("guest 访问成员 → 403", r.status_code == 403)
    r = c.post(
        f"{BASE}/tasks",
        headers=GH,
        json={"name": "游客不该能建任务", "task_type": "prompt", "requirement": "x"},
    )
    check("guest 创建任务 → 403", r.status_code == 403, r.status_code)
    r = c.post(
        f"{BASE}/tasks",
        headers=EH,
        json={"name": "烟测-编辑者任务", "task_type": "prompt", "requirement": "靠墙静蹲动作示意"},
    )
    check("editor 创建任务 → 201", r.status_code == 201, r.text[:200])
    if r.status_code == 201:
        c.delete(f"{BASE}/tasks/{r.json()['id']}", headers=H)
    r = c.get(f"{BASE}/users", headers=H)
    check("super 访问成员 200", r.status_code == 200)

    print("\n[3] 素材")
    files = [("files", ("smoke-test.png", png(), "image/png"))]
    r = c.post(f"{BASE}/assets/upload", files=files, headers=H)
    check("上传图片 201", r.status_code == 201, r.text[:200])
    img = r.json()["items"][0]
    asset_ids = [img["id"]]
    check("source=upload", img["source"] == "upload")
    check("有下载地址", img["download_url"].endswith("/download"))
    r = c.get(f"{BASE}{img['download_url'].replace('/api/v1', '')}", headers=H)
    check("下载图片 200", r.status_code == 200 and len(r.content) > 100)

    # 无 ffmpeg 时上传视频也应可用（元信息降级为 None）
    fake_mp4 = ("files", ("smoke-clip.mp4", b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 4096, "video/mp4"))
    r = c.post(f"{BASE}/assets/upload", files=[fake_mp4], headers=H)
    check("上传视频 201", r.status_code == 201, r.text[:200])
    vid = r.json()["items"][0] if r.status_code == 201 else None
    if vid:
        asset_ids.append(vid["id"])

    print("\n[4] 任务：提示词")
    r = c.post(
        f"{BASE}/tasks",
        headers=H,
        json={"name": "烟测-提示词", "task_type": "prompt", "requirement": "女生在客厅做靠墙静蹲，风格干净专业"},
    )
    check("创建提示词任务 201", r.status_code == 201, r.text[:200])
    tid = r.json()["id"]
    for _ in range(40):
        d = c.get(f"{BASE}/tasks/{tid}", headers=H).json()
        if d["status"] in ("done", "failed"):
            break
        time.sleep(0.3)
    check("提示词任务完成", d["status"] == "done", str(d.get("error"))[:200])
    check("结果含 prompt_text", bool((d.get("result") or {}).get("prompt_text")))
    check("进度=100", d["progress"] == 100)

    print("\n[5] 任务：文章")
    r = c.post(
        f"{BASE}/tasks",
        headers=H,
        json={
            "name": "烟测-文章",
            "task_type": "article",
            "requirement": "突出轻便与高颜值，400 字以内",
            "platform": "xhs",
            "content_type": "commerce",
            "audience": "general",
            "keyword": "气压靴",
        },
    )
    check("创建文章任务 201", r.status_code == 201, r.text[:200])
    tid = r.json()["id"]
    for _ in range(40):
        d = c.get(f"{BASE}/tasks/{tid}", headers=H).json()
        if d["status"] in ("done", "failed"):
            break
        time.sleep(0.3)
    check("文章任务完成", d["status"] == "done", str(d.get("error"))[:200])
    art = (d.get("result") or {}).get("article") or {}
    check("文章含 title/body", bool(art.get("title")) and bool(art.get("body")))
    check("详情有中文列名", "平台" in (d.get("detail") or {}))

    print("\n[6] 任务：视频")
    if vid:
        r = c.post(
            f"{BASE}/tasks",
            headers=H,
            json={
                "name": "烟测-视频水印",
                "task_type": "video",
                "asset_id": vid["id"],
                "save_to_assets": True,
                "watermark_config": {"text": "健衡学院", "text_position": "right_bottom"},
            },
        )
        check("创建视频任务 201", r.status_code == 201, r.text[:300])
        tid = r.json().get("id")
        if not tid:
            print(f"\n结果：{ok_count} 通过，{len(fail)} 失败（视频链路中断）")
            return 1
        for _ in range(80):
            d = c.get(f"{BASE}/tasks/{tid}", headers=H).json()
            if d["status"] in ("done", "failed"):
                break
            time.sleep(0.3)
        check("视频任务完成", d["status"] == "done", str(d.get("error"))[:300])
        res = d.get("result") or {}
        check(
            "产物已入库 materialized",
            res.get("materialized") is True,
            json.dumps(res, ensure_ascii=False)[:200],
        )
        if res.get("output_asset_id"):
            r = c.get(f"{BASE}/assets?source=task", headers=H)
            ids = [a["id"] for a in r.json()["items"]]
            check("素材库可按 source=task 查到产物", res["output_asset_id"] in ids)
            r = c.get(f"{BASE}{res['download_url'].replace('/api/v1', '')}", headers=H)
            check("成品可下载", r.status_code == 200 and len(r.content) > 0)
    r = c.post(
        f"{BASE}/tasks",
        headers=H,
        json={"name": "缺源视频", "task_type": "video", "watermark_config": {"text": "x"}},
    )
    check(
        "缺源视频 422 SOURCE_VIDEO_REQUIRED",
        r.status_code == 422 and r.json()["code"] == "SOURCE_VIDEO_REQUIRED",
    )

    print("\n[7] 草稿 → 素材库")
    body = {
        "title": "烟测草稿",
        "platform": "xhs",
        "requirement": "测试草稿落库",
        "body": "正文内容",
        "tags": ["#测试"],
        "save_to_assets": True,
    }
    r = c.post(f"{BASE}/articles/drafts", headers=H, json=body)
    check("新建草稿 201", r.status_code == 201, r.text[:200])
    draft = r.json()["draft"]
    asset1 = r.json()["asset"]
    check(
        "草稿带 asset",
        asset1 and asset1["source"] == "draft",
        json.dumps(asset1, ensure_ascii=False)[:200] if asset1 else "None",
    )
    r = c.put(f"{BASE}/articles/drafts/{draft['id']}", headers=H, json={**body, "body": "正文内容 v2"})
    asset2 = r.json()["asset"]
    check("重复保存不新增素材", asset2["id"] == asset1["id"], f"{asset1['id']} vs {asset2['id']}")
    r = c.get(f"{BASE}/assets?source=draft", headers=H)
    check("素材库能按 draft 过滤", any(a["id"] == asset1["id"] for a in r.json()["items"]))
    r = c.get(f"{BASE}/articles/drafts/{draft['id']}/export", headers=H)
    check("草稿可导出 md", r.status_code == 200 and "正文内容 v2" in r.text)

    print("\n[8] 系统设置 / 默认水印")
    r = c.get(f"{BASE}/system/settings", headers=H)
    check("读取设置 200", r.status_code == 200)
    check("api_key 已脱敏", "api_key" not in r.json()["ai"] and "api_key_masked" in r.json()["ai"])
    original_wm = r.json()["watermark_default"]
    wm = {"text_on": True, "text": "健衡学院 · 烟测", "text_position": "right_bottom", "font_size": 44}
    r = c.put(f"{BASE}/system/watermark-default", headers=H, json=wm)
    check(
        "PUT 默认水印 200",
        r.status_code == 200 and r.json()["text"] == "健衡学院 · 烟测",
        r.text[:200],
    )
    r = c.put(f"{BASE}/system/watermark-default", headers=H, json={"text_on": False, "logo_on": False})
    check(
        "非法水印 422 WATERMARK_INVALID",
        r.status_code == 422 and r.json()["code"] == "WATERMARK_INVALID",
    )
    r = c.post(f"{BASE}/system/watermark-default/reset", headers=H)
    check("恢复出厂 200", r.status_code == 200 and r.json()["text"] == "健衡学院")

    print("\n[9] 水印方案")
    r = c.post(
        f"{BASE}/watermark/configs",
        headers=H,
        json={"name": "烟测方案", "config": wm, "is_default": False},
    )
    check("新建方案 201", r.status_code == 201, r.text[:200])
    preset_id = r.json().get("id") if r.status_code == 201 else None
    r = c.get(f"{BASE}/watermark/configs", headers=H)
    check("方案列表 200", r.status_code == 200)
    cfg = next((item["config"] for item in r.json() if item["id"] == preset_id), {})
    check("方案 config 与默认水印同构", "text_on" in cfg and "preset" in cfg, json.dumps(cfg)[:160])
    if preset_id:
        r = c.delete(f"{BASE}/watermark/configs/{preset_id}", headers=H)
        check("方案可删除", r.status_code in (200, 204), r.status_code)

    print("\n[10] 任务运维")
    r = c.get(f"{BASE}/tasks?page_size=50", headers=H)
    check("任务列表含 counts", (r.json().get("counts") or {}).get("all", 0) >= 3)
    r = c.get(f"{BASE}/system/status", headers=H)
    check("服务状态 200", r.status_code == 200 and r.json()["state"] == "online")

    print("\n[11] 清理测试数据")
    # 带产物与附件的任务删除曾因外键约束 500，这里显式回归
    done_tasks = [
        t
        for t in c.get(f"{BASE}/tasks?page_size=100", headers=H).json()["items"]
        if t["status"] == "done"
    ]
    if done_tasks:
        r = c.delete(f"{BASE}/tasks/{done_tasks[0]['id']}", headers=H)
        check("删除已产出任务（含产物/附件）204", r.status_code == 204, r.text[:150])
    for t in c.get(f"{BASE}/tasks?page_size=100", headers=H).json()["items"]:
        c.delete(f"{BASE}/tasks/{t['id']}", headers=H)
    for a in c.get(f"{BASE}/assets?page_size=100", headers=H).json()["items"]:
        c.delete(f"{BASE}/assets/{a['id']}", headers=H)
    c.delete(f"{BASE}/articles/drafts/{draft['id']}", headers=H)
    c.put(f"{BASE}/system/watermark-default", headers=H, json=original_wm)
    for uid in created_users:
        c.delete(f"{BASE}/users/{uid}", headers=H)
    # 兜底：清掉所有测试账号（含上次复用过的）
    for u in c.get(f"{BASE}/users?page_size=100", headers=H).json()["items"]:
        if u["username"].startswith("smk_"):
            c.delete(f"{BASE}/users/{u['id']}", headers=H)

    left_users = c.get(f"{BASE}/users?page_size=100", headers=H).json()
    left_tasks = c.get(f"{BASE}/tasks?page_size=100", headers=H).json()
    # 被移除的账号若仍有（软删的）素材/任务引用会保留为停用态，不可登录即视为清理完成
    active_others = [
        u for u in left_users["items"] if u["role"] != "super" and u["is_active"]
    ]
    check("清理后无遗留可用账号", not active_others, [u["username"] for u in active_others])
    check("清理后无残留任务", left_tasks["counts"]["all"] == 0, left_tasks["counts"])

    print(f"\n结果：{ok_count} 通过，{len(fail)} 失败")
    if fail:
        print("失败项：" + " / ".join(fail))
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
