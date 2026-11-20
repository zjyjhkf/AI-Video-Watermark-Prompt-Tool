# 内容中转平台 · 全站重构源码（v1.1）

内容生产团队内部工具的可运行全栈实现：视频水印、文章编写、生图提示词三条生产线，统一的任务队列与素材库，配合成员权限与系统设置。前端为 React 18 + TypeScript + Vite，后端为 FastAPI + SQLAlchemy 2.0，媒体处理走 ffmpeg 子进程。

- 零外部依赖即可运行：数据库默认 SQLite，任务队列默认进程内线程池（免 Redis），未装 ffmpeg 时自动降级
- 一份代码两种形态：开发期前后端分离（Vite 热更新），生产期后端直接托管 `frontend/dist`
- 视觉稿（v1.1 demo）样式原样沿用为设计系统唯一来源：`frontend/src/styles.css`

---

## 一、快速启动

### 1. 后端

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate            # Windows；macOS/Linux 用 source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env              # 可选：不建 .env 也能跑，全部走默认值
python -m uvicorn app.main:app --host 127.0.0.1 --port 8020
```

首次启动自动建表 → 创建**唯一超级管理员账号** → 回收僵尸任务，无需手工迁移。接口文档：`http://127.0.0.1:8020/api/docs`。

初始化**不写入任何示例业务数据**（没有示例素材、任务、草稿、水印方案、词库），账号信息取自环境变量：

```bash
ADMIN_INITIAL_USERNAME=linan        # 默认 linan
ADMIN_INITIAL_NAME=林岸              # 默认 林岸
ADMIN_INITIAL_PASSWORD=demo1234     # 默认 demo1234，登录后请立即在「个人资料」修改
```

需要把某个已经用过的实例清空成「只剩超级管理员」的状态：

```bash
# 先停掉后端（Windows 下 SQLite 文件会被占用）
./backend/.venv/Scripts/python.exe scripts/purge_demo.py --dry-run   # 先看会删多少
./backend/.venv/Scripts/python.exe scripts/purge_demo.py
```

`purge_demo.py` 删除素材 / 任务 / 产物 / 附件 / 草稿 / 水印方案 / 词库 / 除 super 外的全部账号与 `storage` 文件，保留系统设置与服务心跳。
`reset_demo.py` 更彻底（连库一起重建、再初始化），用于交付前复位。

### 2. 前端

```bash
cd frontend
npm install
npm run build      # 产出 dist/，由后端托管：访问 http://127.0.0.1:8020
# 或者开发模式（热更新，/api 已代理到 8020）
npm run dev        # http://127.0.0.1:5199
```

### 3. 初始账号与角色

初始只有一个超级管理员（默认 `linan` / `demo1234`），其余账号由它在「成员与权限」里创建：

| 角色 | 权限边界 |
|---|---|
| 超级管理员 `super` | 最高权限；可管理**全部账号（含管理员）**的姓名、用户名、密码、角色、数据范围、启停；可访问系统设置 |
| 管理员 `admin` | 可访问系统设置；成员页**只显示并只能管理游客**（改姓名 / 用户名 / 密码、重置密码、启停、移除），不能调整角色、不能管理管理员或编辑者 |
| 编辑者 `editor` | 可创建任务、上传素材；无成员管理入口 |
| 游客 `guest`（原「查看者」） | 只读浏览与下载被授权的素材；无成员管理入口 |

任何角色都能在「个人资料」页修改自己的姓名、用户名、密码（改密需校验原密码，改完旧凭证立即失效并要求重新登录）。
角色键由 `viewer` 更名为 `guest`，后端 `normalize_role()` 保留了对旧值 `viewer` 的兼容映射。

---

## 二、目录结构

```
重构源码/
├── backend/
│   ├── app/
│   │   ├── main.py                 应用装配：lifespan(建表/种子/回收) + CORS + 请求 ID + 路由挂载 + 静态托管
│   │   ├── models.py               ORM：User / Task / TaskOutput / Asset / Draft / WatermarkConfig / LexiconKeyword / SystemSetting
│   │   ├── schemas.py              Pydantic 契约：任务结果、素材、草稿、水印校验规则（validate_rules）
│   │   ├── storage.py              本地存储（路径穿越防护）+ ffprobe 探测
│   │   ├── seed.py                 初始化：只建超级管理员 + 系统配置，不写示例业务数据
│   │   ├── core/                   config / db / errors（统一错误结构）/ security（JWT + RBAC + 权限矩阵）
│   │   ├── api/                    auth users assets tasks articles prompts watermark system lexicon
│   │   ├── services/               task / asset / draft / watermark / settings / llm / lexicon 业务编排
│   │   └── workers/runner.py       线程池 Worker：进度回写、取消、重试、僵尸回收
│   ├── .env.example
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.tsx                 hash 路由 + 路由级权限拦截 + 会话恢复 + 角标轮询
│   │   ├── lib/                    api（fetch 封装 / 401 自动刷新 / SSE）、types、constants（枚举与展示常量）
│   │   ├── components/             Icon（内联 SVG）、ui（Modal/Confirm/Field/Seg/Select/Switch/Empty）、Sidebar
│   │   ├── pages/                  Login Workbench VideoWatermark ArticleEditor PromptGenerator TaskCenter AssetLibrary Members Settings Profile
│   │   └── styles.css              设计系统唯一来源（沿用 v1.1 视觉稿）
│   ├── public/favicon.svg
│   └── scripts/ui-smoke.mjs        界面级联调验证（puppeteer-core，自带数据准备与清理）
├── scripts/
│   ├── smoke_test.py               接口级烟测（51 条断言，自建测试账号后清理）
│   ├── check_permissions.py        权限矩阵专项验证（28 条断言：super / admin / editor / guest）
│   ├── purge_demo.py               清空示例数据，只留超级管理员与系统配置
│   └── reset_demo.py               重建数据库并重新初始化（交付前复位）
├── storage/                        素材原件（按年/月分目录）
├── .gitignore
└── README.md
```

---

## 三、能力落地位置

| 需求 | 实现位置 |
|---|---|
| 本地导入视频 → 配置水印 → **保存方案**（参数模板，不产素材） | `VideoWatermark.tsx` → `POST /watermark/configs`（仅写 `watermark_configs`） |
| 同上 → **保存到素材库**（任务队列过渡 → 产物入库 → 可下载） | 先 `POST /assets/upload` 入库源视频，再 `POST /tasks`（`save_to_assets=true`）→ Worker 渲染 → `assets(source=task)` |
| 文章编写 / 生图提示词 → **保存草稿**（序列化 Markdown 落素材库） | `draft_service.save_*_draft` → `assets(source=draft, ref_id=draft.id)`，同草稿重复保存只覆盖不新增（部分唯一索引保证） |
| 默认水印可自定义（系统设置内编辑 + 实时预览 + 另存为方案 + 恢复出厂） | `Settings.tsx` → `GET/PUT /system/watermark-default`、`POST .../reset`、`POST /watermark/configs` |
| 系统设置与成员管理权限下放 admin（三层拦截） | 路由层 `ROUTE_ROLES`；接口层 `require_admin`；数据层 `scope_allows()` |
| 超级管理员可编辑自己与所有账号（含管理员）的姓名 / 用户名 / 密码 | 自己走 `PATCH /auth/me`（`Profile.tsx`）；他人走 `PATCH /users/{id}` + `can_manage()` |
| 管理员只能管理游客的姓名 / 用户名 / 密码 | `list_users` 对 admin 强制 `role in ('guest')`；`create/update/delete/reset` 统一过 `can_manage()`；改角色直接 403 |
| 「查看者」更名为「游客」 | 角色键 `viewer → guest`（`security.normalize_role` 兼容旧值）；前端 `ROLES.guest.label = 游客` |
| 游客为只读角色 | 侧栏与工作台不渲染内容生产入口（`PRODUCER_ROLES`），路由层拦截 `video/article/prompt`，接口层写操作需 `require_editor` |
| 全站清空示例数据，只留超级管理员 | `seed.py` 不再写业务数据；`scripts/purge_demo.py` 一键清空并保留 super |
| 素材库按来源（upload / task / draft）筛选与徽标 | `AssetLibrary.tsx` + `GET /assets?source=`；来源无内容时自动跳到有内容的分类 |
| 任务中心显示进度与「已入库」 | `TaskCenter.tsx` + `GET /tasks/{id}/events`（SSE，终态自动断开）与 3s 轮询兜底 |

---

## 四、验证

```bash
# 1) 接口级：51 条断言（鉴权/权限/上传下载/三类任务真实执行/草稿幂等/水印校验/运维/清理）
cd 重构源码
./backend/.venv/Scripts/python.exe scripts/smoke_test.py            # 默认 http://127.0.0.1:8020
./backend/.venv/Scripts/python.exe scripts/smoke_test.py http://127.0.0.1:9000

# 2) 权限矩阵：28 条断言（super 管全部 / admin 只管游客 / editor·guest 无入口 / 改密后旧凭证失效）
./backend/.venv/Scripts/python.exe scripts/check_permissions.py

# 3) 界面级：登录 → 9 个路由 → 个人资料改姓名 → 游客徽标 → 新建游客
#    → 游客入口隐藏与路由拦截 → 管理员只见游客 → 文章生成真实异步任务
cd frontend
node scripts/ui-smoke.mjs
```

最近一次实测：接口 **51 通过 / 0 失败**，权限矩阵 **28 通过 / 0 失败**，界面 **31 通过 / 0 失败**。截图落在 `frontend/.ui-shots/`（已在 `.gitignore` 中忽略）。

`GET /api/v1/health` 会返回 `render_engine` 与 `ffmpeg_available`，前端据此在视频水印页如实提示降级情况。

---

## 五、配置切换（横向扩展）

| 目标 | 做法 |
|---|---|
| 换 PostgreSQL | `.env` 设 `DATABASE_URL=postgresql+psycopg://...`，装 `psycopg[binary]`；建表仍由启动钩子完成，后续需要版本化再加 alembic |
| 换对象存储 | `storage.py` 的 `LocalStorage` 已隔离为唯一读写入口，替换为 S3/MinIO 实现即可，业务层无感 |
| 队列外置 / 多 worker | `WORKER_MODE=external` 后由独立进程消费 `tasks` 表（`pending → processing → done`），天然支持多副本抢占 |
| 真实 AI 生成 | 系统设置填 `api_key`（或 `.env` 配 `AI_API_KEY`）即走 httpx 直连；未配置时用内置模板，结果标 `engine=local-template` |
| 视频真实渲染 | 安装 ffmpeg 并确保 `FFMPEG_PATH` 可执行；缺失时降级为复制源文件，结果里注明 `engine=copy` 与原因，不伪造成渲染成功 |

---

## 六、关键设计决策

1. **素材是唯一文件实体**：上传、任务产物、草稿文件都落在 `assets` 一张表，用 `source` 区分，用两个部分唯一索引（`source_task_id` where `source='task'`、`ref_id` where `source='draft'`）解决「重试产生重复成品」与「草稿重复保存产生副本」。
2. **职责边界前轻后重**：浏览器只负责本地预览与 DOM 叠加；元信息以服务端 ffprobe 复算为准，不采信前端上报；渲染只在 Worker 里发生。
3. **统一错误结构**：所有失败返回 `{code, message, detail, request_id}`，前端 `ApiError` 直接取 `message` 展示，用户看到的是中文原因而不是状态码。
4. **权限三层一致**：路由隐藏入口、接口返回 403、数据查询按 `scope_all` 过滤，避免「看不到入口但能越过接口」的漏洞。
5. **可运行优先**：SQLite / 线程池 / 本地磁盘 / 本地模板，四件套让工程在任何一台开发机上 `pip install && npm install` 后即可跑通完整链路。

---

## 七、已知边界与环境差异

- **本机未安装 ffmpeg**：写作此版本时所在环境 `ffmpeg` / `ffprobe` 均不在 PATH，因此视频任务走降级路径 `engine=copy`（按原样复制、不叠加水印），结果里明确写明原因，视频水印页也会显示提示条。装好 ffmpeg 或配置 `FFMPEG_PATH` 后重启服务即可走真实渲染（`drawtext` + `overlay` + 进度回读），无需改代码。
- **账号移除是「停用」而非物理删除**：`DELETE /users/{id}` 在账号仍有任务 / 素材 / 草稿引用时置为停用（保留审计线索与关联数据），无任何引用时才物理删除。停用账号会立刻失去登录能力，成员列表里标记为「已停用」。
- **素材删除是软删**：`deleted_at` 标记后列表不再展示，但文件仍保留在磁盘（可恢复）；因此长期使用后 `storage` 会大于「素材库可见体积」，需要回收空间时执行 `purge_demo.py` 或自行清理。
- `storage` 分区的后端类型与配额由环境变量决定，页面内只读展示（避免页面配置与运行期实际路径不一致）。
- 上传为整体直传（受 `MAX_UPLOAD_MB` 限制），分块上传留给后续大文件场景。
- 未接入 alembic：当前靠 `Base.metadata.create_all` 建表；表结构变更进入生产前需补迁移脚本。
- 草稿为「仅本人可见」的个人工作副本（`list_drafts` 按 `created_by` 过滤），不随 admin 的 `scope_all` 放开；任务与素材则遵循数据范围。
- 生图任务只产出提示词与参数，不生成图片（`ai_image.enabled` 为开关位，图片生成链路预留未实现）。
