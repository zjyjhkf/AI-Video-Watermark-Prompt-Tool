"""权限矩阵专项验证（不依赖任何示例数据，跑完自动清理测试账号）。

覆盖：
1. 初始状态只有超级管理员
2. 超级管理员可改自己的姓名 / 用户名 / 密码（改密后旧 token 失效）
3. 超级管理员可创建管理员 / 编辑者 / 游客，并可修改任意账号的姓名 / 用户名 / 密码
4. 管理员只能看到游客、只能创建游客、只能改游客，越权一律 403
5. 游客无成员管理入口（403）
"""
from __future__ import annotations

import sys

import httpx

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8020") + "/api/v1"
c = httpx.Client(timeout=30, trust_env=False)

ok = 0
fail = 0
created: list[str] = []


def check(name: str, cond: bool, extra: str = "") -> None:
    global ok, fail
    if cond:
        ok += 1
        print(f"  ✓ {name}")
    else:
        fail += 1
        print(f"  ✗ {name} {extra}")


def login(username: str, password: str) -> str:
    r = c.post(f"{BASE}/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def h(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}"}


SUPER_USER = "linan"
SUPER_PWD = "demo1234"

print("== 1. 初始账号 ==")
super_tok = login(SUPER_USER, SUPER_PWD)
me = c.get(f"{BASE}/auth/me", headers=h(super_tok)).json()
check("唯一账号是超级管理员", me["role"] == "super", me)
users = c.get(f"{BASE}/users?page_size=100", headers=h(super_tok)).json()
check("成员列表仅 1 个账号", users["total"] == 1, users["total"])

print("== 2. 超级管理员改自己 ==")
r = c.patch(f"{BASE}/auth/me", headers=h(super_tok), json={"name": "林岸（主）"})
check("可修改自己的姓名", r.status_code == 200 and r.json()["name"] == "林岸（主）", r.text[:120])
r = c.patch(f"{BASE}/auth/me", headers=h(super_tok), json={"name": "林岸"})
check("姓名可改回", r.status_code == 200 and r.json()["name"] == "林岸")

print("== 3. 超级管理员创建三类账号 ==")
admin = c.post(
    f"{BASE}/users",
    headers=h(super_tok),
    json={"name": "临时管理员", "username": "tmpadmin", "password": "tmp12345678", "role": "admin"},
)
check("创建管理员", admin.status_code == 201 and admin.json()["role"] == "admin", admin.text[:150])
created.append(admin.json()["id"])

editor = c.post(
    f"{BASE}/users",
    headers=h(super_tok),
    json={"name": "临时编辑", "username": "tmpeditor", "password": "tmp12345678", "role": "editor"},
)
check("创建编辑者", editor.status_code == 201 and editor.json()["role"] == "editor", editor.text[:150])
created.append(editor.json()["id"])

guest = c.post(
    f"{BASE}/users",
    headers=h(super_tok),
    json={"name": "临时游客", "username": "tmpguest", "password": "tmp12345678", "role": "guest"},
)
check("创建游客（角色已更名为 guest）", guest.status_code == 201 and guest.json()["role"] == "guest", guest.text[:150])
created.append(guest.json()["id"])

r = c.patch(
    f"{BASE}/users/{editor.json()['id']}",
    headers=h(super_tok),
    json={"name": "临时编辑B", "username": "tmpeditor2", "password": "new12345678"},
)
check("超级管理员可改编辑者的姓名/用户名/密码", r.status_code == 200 and r.json()["username"] == "tmpeditor2", r.text[:150])
r = c.patch(f"{BASE}/users/{admin.json()['id']}", headers=h(super_tok), json={"name": "临时管理员B"})
check("超级管理员可改管理员信息", r.status_code == 200 and r.json()["name"] == "临时管理员B", r.text[:150])

print("== 4. 管理员只能管游客 ==")
admin_tok = login("tmpadmin", "tmp12345678")
lst = c.get(f"{BASE}/users?page_size=100", headers=h(admin_tok)).json()
check("管理员只看到游客", lst["total"] == 1 and lst["items"][0]["role"] == "guest", lst)
r = c.get(f"{BASE}/users/{editor.json()['id']}", headers=h(admin_tok))
check("管理员查编辑者 → 403", r.status_code == 403, r.status_code)
r = c.get(f"{BASE}/users/{admin.json()['id']}", headers=h(admin_tok))
check("管理员查其他管理员 → 403", r.status_code == 403, r.status_code)
r = c.patch(f"{BASE}/users/{admin.json()['id']}", headers=h(admin_tok), json={"name": "越权"})
check("管理员改其他管理员 → 403", r.status_code == 403, r.status_code)
r = c.patch(f"{BASE}/users/{editor.json()['id']}", headers=h(admin_tok), json={"name": "越权"})
check("管理员改编辑者 → 403", r.status_code == 403, r.status_code)
r = c.post(
    f"{BASE}/users",
    headers=h(admin_tok),
    json={"name": "越权编辑", "username": "tmpeditor3", "password": "tmp12345678", "role": "editor"},
)
check("管理员创建编辑者 → 403", r.status_code == 403, r.status_code)
r = c.patch(f"{BASE}/users/{guest.json()['id']}", headers=h(admin_tok), json={"role": "editor"})
check("管理员把游客提权 → 403", r.status_code == 403, r.status_code)
r = c.patch(
    f"{BASE}/users/{guest.json()['id']}",
    headers=h(admin_tok),
    json={"name": "游客改名", "username": "tmpguest2", "password": "guest12345678"},
)
check(
    "管理员可改游客的姓名/用户名/密码",
    r.status_code == 200 and r.json()["username"] == "tmpguest2" and r.json()["name"] == "游客改名",
    r.text[:150],
)
r = c.patch(f"{BASE}/users/{guest.json()['id']}", headers=h(super_tok), json={"username": "tmpguest"})
check("超级管理员把用户名改回来", r.status_code == 200, r.text[:120])

print("== 5. 游客 / 编辑者无管理入口 ==")
guest_tok = login("tmpguest", "guest12345678")
for label, tok in (("游客", guest_tok),):
    r = c.get(f"{BASE}/users", headers=h(tok))
    check(f"{label}访问成员列表 → 403", r.status_code == 403, r.status_code)

print("== 6. 游客可改自己 ==")
r = c.patch(f"{BASE}/auth/me", headers=h(guest_tok), json={"name": "游客自改"})
check("游客可改自己姓名", r.status_code == 200 and r.json()["name"] == "游客自改", r.text[:120])

print("== 7. 改密后旧凭证失效 ==")
r = c.patch(
    f"{BASE}/auth/me",
    headers=h(guest_tok),
    json={"old_password": "guest12345678", "new_password": "guest87654321"},
)
check("游客改自己密码", r.status_code == 200, r.text[:120])
r = c.get(f"{BASE}/auth/me", headers=h(guest_tok))
check("旧 token 已失效（401）", r.status_code == 401, r.status_code)
new_tok = login("tmpguest", "guest87654321")
check("新密码可登录", bool(new_tok))
r = c.patch(f"{BASE}/auth/me", headers=h(new_tok), json={"old_password": "wrong", "new_password": "abcdefgh12"})
check("原密码错误 → 422", r.status_code == 422, r.status_code)

print("== 8. 清理测试账号 ==")
for uid in created:
    r = c.delete(f"{BASE}/users/{uid}", headers=h(super_tok))
    check(f"移除测试账号 {uid[:8]}", r.status_code == 204, r.status_code)
users = c.get(f"{BASE}/users?page_size=100", headers=h(super_tok)).json()
check("清理后仅剩超级管理员", users["total"] == 1, users["total"])

print(f"\n结果：{ok} 通过 / {fail} 失败")
sys.exit(0 if fail == 0 else 1)
