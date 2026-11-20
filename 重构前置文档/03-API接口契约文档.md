# 内容中转平台 · API 接口契约文档

> 文档版本：v1.1
> 更新日期：2026-10-28
> 基础路径：`/api/v1`
> 协议：HTTP/JSON，认证使用 `Authorization: Bearer <access_token>`
> 配套文档：数据库设计文档 / 系统架构设计文档

**v1.1 变更摘要**

| # | 变更 | 接口 |
|---|---|---|
| 1 | 素材来源维度 | `assets.source` 字段；`GET /assets?source=` 过滤 |
| 2 | 视频任务产物入库 | `POST /tasks` 支持 `save_to_assets`；`result.video` 返回 `output_asset_id` |
| 3 | 草稿落素材库 | `POST/PUT /articles/drafts` 返回 `asset`；新增 `/prompts/drafts` |
| 4 | 系统设置权限下放 | `/system/*` 由 `super` 改为 `super + admin` |
| 5 | 默认水印可自定义 | `system_settings.watermark_default` 可整体 PUT，并支持恢复出厂 |

---

## 0. 通用约定

### 0.1 通用响应结构

**成功**：直接返回资源对象或分页对象（见下），HTTP 200/201。

**失败**：统一错误结构，HTTP 4xx/5xx：

```json
{
  "code": "TASK_NOT_FOUND",
  "message": "任务不存在或已删除",
  "detail": {},
  "request_id": "req_xxxxxxxx"
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| code | string | 机器可读错误码（见 0.4） |
| message | string | 人类可读中文描述 |
| detail | object | 可选，字段级校验错误 |
| request_id | string | 请求链路 ID，用于排查 |

### 0.2 分页

列表接口统一使用分页：

```json
{
  "items": [],
  "total": 123,
  "page": 1,
  "page_size": 20
}
```

查询参数：`?page=1&page_size=20`（默认 `page=1`、`page_size=20`，上限 100）。

### 0.3 枚举值

| 枚举 | 取值 |
|---|---|
| 任务类型 `task_type` | `article`（图文生成）/ `video`（视频水印）/ `prompt`（生图提示词） |
| 任务状态 `status` | `pending`（待处理）/ `processing`（处理中）/ `done`（已完成）/ `failed`（失败）/ `canceled`（已取消） |
| 角色 `role` | `super` / `admin` / `editor` / `viewer` |
| 水印位置 `position` | `left_top` `top_center` `right_top` `left_middle` `center` `right_middle` `left_bottom` `bottom_center` `right_bottom` |
| 词库策略 `keyword_strategy` | `auto`（自动补采）/ `existing`（只用现成）/ `off`（不启用） |
| 内容平台 `platform` | `xhs`（小红书）/ `weibo`（微博）/ `wechat`（微信公众号）/ `douyin`（抖音） |
| 内容类型 `content_type` | `science`（科普教育）/ `commerce`（种草带货）/ `course`（课程转化）/ `event`（活动引流）/ `market`（市场分析） |
| 受众档位 `audience` | `general`（通俗）/ `professional`（专业）/ `mixed`（混合） |
| **素材来源 `asset_source`** | `upload`（手工上传）/ `task`（任务产出）/ `draft`（草稿） |
| **草稿类型 `draft_kind`** | `article`（文章草稿）/ `prompt`（提示词草稿） |

### 0.4 通用错误码

| code | HTTP | 说明 |
|---|---|---|
| `UNAUTHORIZED` | 401 | 未登录或 Token 失效 |
| `FORBIDDEN` | 403 | 权限不足 |
| `NOT_FOUND` | 404 | 资源不存在 |
| `VALIDATION_ERROR` | 422 | 请求参数校验失败 |
| `DUPLICATE_USERNAME` | 409 | 用户名已存在 |
| `TASK_NOT_FOUND` | 404 | 任务不存在 |
| `TASK_ILLEGAL_STATE` | 409 | 任务状态不允许该操作 |
| `ASSET_NOT_FOUND` | 404 | 素材不存在 |
| `FILE_TOO_LARGE` | 413 | 文件超出大小限制 |
| `UNSUPPORTED_FILE_TYPE` | 415 | 文件类型不支持 |
| `AI_NOT_CONFIGURED` | 400 | 未配置 AI 厂商/Key |
| `AI_PROVIDER_ERROR` | 502 | 调用 AI 厂商失败 |
| `WATERMARK_INVALID` | 422 | 水印配置非法 |
| `SOURCE_VIDEO_REQUIRED` | 422 | 视频任务缺少有效源视频（未导入或未入库） |
| `MEDIA_METADATA_INVALID` | 422 | 上传的媒体无法解析（时长/分辨率读取失败） |
| `DRAFT_NOT_FOUND` | 404 | 草稿不存在或已删除 |
| `LEXICON_UNAVAILABLE` | 503 | 词库服务不可用 |
| `INTERNAL_ERROR` | 500 | 服务内部错误 |

---

## 1. 认证 Auth

### 1.1 登录

`POST /auth/login`

**请求**：
```json
{ "username": "zhangjy", "password": "******" }
```

**响应 200**：
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "bearer",
  "user": {
    "id": "u_xxx",
    "username": "zhangjy",
    "name": "张嘉怡",
    "role": "admin",
    "avatar": null
  }
}
```

### 1.2 刷新 Token

`POST /auth/refresh`

**请求**：`{ "refresh_token": "eyJ..." }`
**响应 200**：同 1.1（新 access/refresh + user）。

### 1.3 登出

`POST /auth/logout`（需要认证）
**响应 204**：使 refresh_token 失效。

### 1.4 当前用户

`GET /auth/me`（需要认证）
**响应 200**：返回 `user` 对象（同 1.1 内嵌）。

---

## 2. 成员管理 Users（需要 admin 及以上）

### 2.1 成员列表

`GET /users?page=1&page_size=20&query=张&role=editor`

**响应 200**：
```json
{
  "items": [
    {
      "id": "u_xxx",
      "username": "zhangjy",
      "name": "张嘉怡",
      "role": "admin",
      "scope_all": true,
      "is_active": true,
      "last_login_at": "2026-10-28T09:12:00Z",
      "created_at": "2026-10-01T08:00:00Z"
    }
  ],
  "total": 1, "page": 1, "page_size": 20
}
```

### 2.2 创建成员

`POST /users`（需要 admin+）

**请求**：
```json
{
  "name": "陈默",
  "username": "chenmo",
  "password": "初始密码至少8位",
  "role": "editor",
  "scope_all": false
}
```

**响应 201**：返回成员对象（同 2.1 item）。

### 2.3 成员详情 / 更新 / 删除

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/users/{id}` | 成员详情 |
| PATCH | `/users/{id}` | 更新（name/role/scope_all/is_active） |
| DELETE | `/users/{id}` | 移除成员（软删除 is_active=false） |

**PATCH 请求示例**：
```json
{ "role": "admin", "scope_all": true }
```

### 2.4 重置密码

`POST /users/{id}/reset-password`（需要 admin+）

**请求**：`{ "password": "新密码至少8位" }`
**响应 204**。

---

## 3. 任务 Tasks

### 3.1 创建任务

`POST /tasks`（需要 editor+）

统一任务创建入口，按 `task_type` 携带不同载荷：

**视频水印**：
```json
{
  "name": "产品宣传片-水印",
  "task_type": "video",
  "asset_id": "a_video_xxx",
  "save_to_assets": true,
  "output_folder": "产物 / 视频",
  "watermark_config": {
    "text": "健衡学院",
    "text_position": "right_bottom",
    "font_size": 40,
    "font_color": "#FFFFFF",
    "text_opacity": 0.8,
    "logo_asset_id": null,
    "logo_position": "left_top",
    "logo_width": 160,
    "logo_opacity": 0.85,
    "margin": 40,
    "crf": 20,
    "preset": "medium",
    "threads": 8
  }
}
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `asset_id` | 是 | **必须**是已入库的素材 ID。前端本地导入的视频，需先调 `POST /assets/upload` 入库，再引用其 `id` |
| `save_to_assets` | 否 | 默认 `true`。为 `true` 时 worker 完成后把成品写成 `assets(source=task)`，任务详情的 `result.output_asset_id` 可下载 |
| `output_folder` | 否 | 成品在素材库中的目录，默认 `产物 / 视频` |

**文章生成**：
```json
{
  "name": "气压靴种草文",
  "task_type": "article",
  "platform": "xhs",
  "content_type": "commerce",
  "audience": "general",
  "requirement": "突出轻便与高颜值，400 字以内",
  "ref_image_asset_ids": ["a_img_1", "a_img_2"],
  "keyword": "气压靴",
  "keyword_strategy": "auto"
}
```

**生图提示词**：
```json
{
  "name": "靠墙静蹲封面图提示词",
  "task_type": "prompt",
  "requirement": "女生在客厅做靠墙静蹲，突出膝关节康复动作标准，风格干净专业",
  "ref_image_asset_ids": []
}
```

**响应 201**：
```json
{
  "id": "t_xxx",
  "name": "产品宣传片-水印",
  "task_type": "video",
  "status": "pending",
  "progress": 0,
  "created_by": "u_xxx",
  "created_at": "2026-10-28T10:00:00Z"
}
```

> 提交成功后前端应**立即跳转任务中心**（带 `task_id`），由任务卡展示「待处理 → 处理中 x% → 已完成」的过渡；不要停留在编辑页等待。

### 3.2 任务列表

`GET /tasks?page=1&page_size=20&task_type=video&status=pending&q=宣传片`

**响应 200**：
```json
{
  "items": [
    {
      "id": "t_xxx",
      "name": "产品宣传片-水印",
      "task_type": "video",
      "status": "processing",
      "node": "worker-1#1234",
      "error": null,
      "created_by_name": "张嘉怡",
      "created_at": "2026-10-28T10:00:00Z",
      "started_at": "2026-10-28T10:00:12Z",
      "finished_at": null
    }
  ],
  "total": 1, "page": 1, "page_size": 20
}
```

> `q` 按任务名模糊搜索。

### 3.3 任务详情

`GET /tasks/{id}`

**响应 200**（含结果）：
```json
{
  "id": "t_xxx",
  "name": "气压靴种草文",
  "task_type": "article",
  "status": "done",
  "node": "worker-2#5678",
  "error": null,
  "created_by_name": "张嘉怡",
  "created_at": "2026-10-28T10:00:00Z",
  "started_at": "2026-10-28T10:00:15Z",
  "finished_at": "2026-10-28T10:00:40Z",
  "result": {
    "article": {
      "title": "跑完腿沉像灌铅🦵气压靴值不值",
      "body": "……",
      "tags": ["#气压靴", "#运动恢复"],
      "compliance_check": "……",
      "coverage_check": "| 词条 | 字数 | 写入位置 | 是否覆盖 | ..."
    }
  }
}
```

**结果 `result` 按类型**：

| task_type | result 结构 |
|---|---|
| `video` | `{ "output_asset_id": "a_out_xxx", "output_name": "产品宣传片_watermarked.mp4", "output_size_bytes": 2516582, "duration_seconds": 90, "download_url": "/api/v1/assets/a_out_xxx/download", "materialized": true }` |
| `article` | `{ "article": { "title","body","tags","compliance_check","coverage_check" } }` |
| `prompt` | `{ "prompt_text": "...", "prompt_file_asset_id": "..." }` |

> `materialized=true` 表示成品已写入素材库，前端「下载成品」直接走 `download_url`；为 `false` 说明 `save_to_assets=false`，只能通过临时链接下载。

### 3.4 任务操作

| 方法 | 路径 | 说明 | 前置状态 |
|---|---|---|---|
| POST | `/tasks/{id}/retry` | 重试 | `failed` / `canceled` |
| POST | `/tasks/{id}/cancel` | 取消 | `pending` / `processing` |
| DELETE | `/tasks/{id}` | 删除 | 任意 |

**响应**：返回更新后的任务对象。

### 3.5 任务进度订阅（SSE）

`GET /tasks/{id}/events`（需要认证）

**事件流**（`text/event-stream`）：

```
event: status
data: {"status":"processing","node":"worker-1#1234","progress":0.35}

event: status
data: {"status":"done","progress":1.0}
```

> `progress`（0~1）对视频任务为 ffmpeg 进度，对文本任务无意义（可省略）。前端回退方案：每 3 秒轮询 `GET /tasks/{id}`。

---

## 4. 视频水印 Watermark

### 4.1 生成预览图

`POST /watermark/preview`（需要 editor+）

**请求**（`multipart/form-data`）：
| 字段 | 类型 | 说明 |
|---|---|---|
| `asset_id` | string | 源视频素材 ID（或直接 `file` 上传） |
| `file` | file | 备选：直接上传视频 |
| `watermark_config` | string(JSON) | 水印配置 JSON（同 3.1） |
| `at_seconds` | number | 抽帧时间点（秒，默认取视频 10% 处） |

**响应 200**：
```json
{ "preview_url": "https://.../preview_xxx.jpg", "expires_in": 300 }
```

> 预览图为**带水印的单帧 JPEG**，缓存 5 分钟，不落库。

### 4.2 水印方案模板 CRUD

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/watermark/configs` | 方案列表 |
| POST | `/watermark/configs` | 新建方案 |
| GET | `/watermark/configs/{id}` | 详情 |
| PATCH | `/watermark/configs/{id}` | 更新 |
| DELETE | `/watermark/configs/{id}` | 删除 |

**方案对象**：
```json
{
  "id": "wc_xxx",
  "name": "品牌标准水印",
  "is_default": false,
  "config": { "text_on": true, "text": "健衡学院", "text_position": "right_bottom", "...": "..." },
  "updated_at": "2026-10-28T11:20:00Z"
}
```

**优先级与区别（v1.1 明确）**：

| 概念 | 存储 | 作用域 | 说明 |
|---|---|---|---|
| 全局默认水印 | `system_settings.watermark_default` | 全站 | 所有人新开编辑页的初值，由管理员维护（见 8.3） |
| 方案模板 | `watermark_configs` | 创建者可见（`is_default` 时全站可见） | 命名模板，下拉选用；**不产生任何素材文件** |

> 打开视频水印页时的初值顺序：`用户上次使用` > `is_default=true 的方案` > `watermark_default` > 出厂值。

---

## 5. 文章与提示词

> 文章/提示词的**生成**统一走 `POST /tasks`（见 3.1），本节只负责**草稿**与**生成结果**的管理。
>
> **v1.1：草稿统一落素材库。** 保存草稿时服务端会把内容序列化为 Markdown 文件写入存储，并在 `assets` 建一条 `source=draft` 的记录，返回里带 `asset`，前端据此提示「已保存到素材库」。

### 5.1 草稿列表 / 详情

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/articles/drafts` | 我的文章草稿列表（分页，`?kind=article`） |
| GET | `/articles/drafts/{id}` | 草稿详情 |

**草稿对象**：
```json
{
  "id": "d_xxx",
  "kind": "article",
  "title": "气压靴种草文",
  "platform": "xhs",
  "content_type": "commerce",
  "audience": "mixed",
  "requirement": "……",
  "body": "……",
  "tags": ["#气压靴"],
  "asset_id": "a_draft_xxx",
  "updated_at": "2026-10-28T11:00:00Z"
}
```

### 5.2 保存草稿（同步，落素材库）

`POST /articles/drafts`（新建） / `PUT /articles/drafts/{id}`（更新同一条）

**请求**：
```json
{
  "title": "气压靴种草文",
  "platform": "xhs",
  "content_type": "commerce",
  "audience": "mixed",
  "requirement": "……",
  "body": "……",
  "tags": ["#气压靴", "#运动恢复"],
  "compliance_check": "……",
  "coverage_check": "| 词条 | 字数 | 位置 | 覆盖 |",
  "save_to_assets": true
}
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `title` | 否 | 为空时用 `requirement` 前 20 字兜底 |
| `body` | 否 | 未生成文章时可为空（此时保存的是需求草稿） |
| `save_to_assets` | 否 | 默认 `true`；为 `true` 时同步生成 `assets(source=draft, ext=MD, folder=草稿/文章)` |

**响应 201 / 200**：
```json
{
  "draft": { "id": "d_xxx", "...": "..." },
  "asset": {
    "id": "a_draft_xxx",
    "name": "气压靴种草文 · 草稿",
    "type": "document",
    "ext": "MD",
    "source": "draft",
    "size_bytes": 4210,
    "storage_key": "drafts/2026/10/d_xxx.md",
    "download_url": "/api/v1/assets/a_draft_xxx/download",
    "created_at": "2026-10-28T11:00:00Z"
  }
}
```

**幂等约定**：同一个 `draft.id` 反复保存，只覆盖该草稿对应的**同一个** `asset`（更新 `size_bytes / storage_key` 内容与 `updated_at`），不新建素材，保证素材库不出现同名副本。

### 5.3 删除草稿

`DELETE /articles/drafts/{id}` → 204；同时软删关联的 `asset`（`deleted_at` 置位）。

### 5.4 导出

`GET /articles/drafts/{id}/export?format=markdown|text`（返回文件流或文本）。

### 5.5 提示词草稿

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/prompts/drafts` | 我的提示词草稿列表 |
| GET | `/prompts/drafts/{id}` | 详情 |
| POST | `/prompts/drafts` | 新建（保存需求 + 四节结果） |
| PUT | `/prompts/drafts/{id}` | 更新同一条 |
| DELETE | `/prompts/drafts/{id}` | 删除（连带软删 asset） |

**请求**：
```json
{
  "requirement": "女生在客厅做靠墙静蹲……",
  "prompt_text": "A young Asian woman ……",
  "prompt_cn": "……",
  "elements": "主体 / 构图 / 光线 / 风格 / 画质",
  "params": "画面比例 3:4 · 适用模型 gpt-image-1",
  "save_to_assets": true
}
```

**响应**：同 5.2 结构，`asset.folder = "草稿 / 提示词"`。

---

## 6. 素材 Assets

### 6.1 上传

`POST /assets/upload`（需要 editor+）

**请求**（`multipart/form-data`，支持多文件）：
| 字段 | 说明 |
|---|---|
| `files` | 一个或多个文件 |
| `folder` | 可选，目录/分类 |

**响应 201**：
```json
{
  "items": [
    {
      "id": "a_xxx",
      "name": "夏季新品发布.mp4",
      "type": "video",
      "ext": "MP4",
      "size_bytes": 2516582,
      "mime": "video/mp4",
      "source": "upload",
      "folder": "未分类",
      "duration_seconds": 90,
      "width": 1920,
      "height": 1080,
      "thumbnail_url": "https://.../thumb_xxx.jpg",
      "created_by": "u_xxx",
      "created_at": "2026-10-28T10:00:00Z"
    }
  ]
}
```

> **视频水印的本地导入走这里**：前端选好本地文件后先调本接口入库，拿到 `id` 再 `POST /tasks` 引用。服务端用 ffprobe 复算 `duration_seconds / width / height`，不采信前端上报值；解析失败返回 `MEDIA_METADATA_INVALID`。

### 6.2 分块上传（大文件）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/assets/upload/init` | 初始化分块上传，返回 `upload_id` |
| PUT | `/assets/upload/{upload_id}/part` | 上传分块 |
| POST | `/assets/upload/{upload_id}/complete` | 合并分块 |

> 单文件 < 50MB 直接用 6.1；≥ 50MB 走分块。

### 6.3 素材列表

`GET /assets?page=1&page_size=24&type=video&source=task&q=新品`

| 参数 | 说明 |
|---|---|
| `type` | `video` / `image` / `document` |
| `source` | **v1.1 新增**：`upload` / `task` / `draft`，不传为全部 |
| `q` | 名称或扩展名模糊搜索 |
| `task_id` | 可选，按来源任务过滤（`source=task` 时可用） |

**响应 200**：分页 + 素材对象列表（同 6.1 item，含 `source`、`source_task_id`）。

### 6.4 详情 / 下载 / 删除

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/assets/{id}` | 素材元数据 |
| GET | `/assets/{id}/download` | 下载原文件（302 重定向到预签名 URL，或流式返回） |
| GET | `/assets/{id}/thumbnail` | 缩略图 |
| DELETE | `/assets/{id}` | 删除素材 |

### 6.5 批量操作

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/assets/batch-delete` | `{ "ids": ["a_1","a_2"] }` |
| POST | `/assets/batch-download` | `{ "ids": [...] }` → 打包 zip 下载 |

### 6.6 素材来源与回写约定（v1.1）

| source | 产生方式 | 谁写入 | 备注 |
|---|---|---|---|
| `upload` | 用户上传 / 视频水印导入 | `POST /assets/upload` | 用户可删 |
| `task` | 任务完成时的成品 | worker（`asset_materializer`） | 带 `source_task_id`；删除任务不删素材 |
| `draft` | 文章/提示词保存草稿 | `draft_service` | 带 `ref_id=draft_id`；删除草稿连带软删 |

**一致性要求**：

- `task` 类素材必须是「先落存储、再写 DB」，且 `(source_task_id, task_type)` 唯一，重试不产生重复成品。
- `draft` 类素材与草稿一一对应，重复保存只更新不新增。
- 三类素材的下载接口一致：`GET /assets/{id}/download`，`Content-Disposition` 用素材 `name + ext`。

---

## 7. 词库 Lexicon

### 7.1 查询写作任务包

`GET /lexicon/{keyword}/plan?strategy=auto`（需要 editor+）

**响应 200**（词库命中）：
```json
{
  "keyword": "气压靴",
  "domain": "运动恢复产品",
  "tags": ["气压靴的作用", "气压裤", "气压恢复靴"],
  "content_by_intent": {
    "危害风险": ["气压靴的四大害处", "气压靴压力大了会怎样"],
    "怎么选": ["气压靴哪个牌子好"]
  },
  "hubs": ["气压靴的作用", "气压裤"],
  "hot": [{ "platform": "小红书", "word": "气压靴测评" }],
  "updated_at": "2026-10-20"
}
```

**响应 200（未命中）**：`{ "keyword": "气压靴", "hit": false }`

### 7.2 触发采集

`POST /lexicon/{keyword}/ensure`（需要 editor+）
**响应 200**：`{ "keyword": "气压靴", "collected": true, "updated_at": "..." }`

> 采集较慢（数十秒），建议由后端在文章生成任务中按策略自动调用，前端仅用于手动「补采」按钮。

---

## 8. 系统 System

### 8.1 服务状态

`GET /system/status`（需要 admin+）

**响应 200**：
```json
{
  "service_name": "内容中转平台",
  "state": "online",
  "node": "worker-1",
  "heartbeat_at": "2026-10-28T10:01:00Z",
  "running": 1,
  "pending": 3,
  "summary": "found=12 ok=8 fail=1 skipped=3"
}
```

### 8.2 系统设置

> **权限（v1.1）**：`super` 与 `admin` 均可读写，两者能力完全一致；`editor` / `viewer` 调用返回 403 `FORBIDDEN`。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/system/settings` | 全部配置（敏感项脱敏） |
| PATCH | `/system/settings` | 更新配置（按分区合并） |

**GET 响应示例**（脱敏）：
```json
{
  "ai": {
    "provider": "deepseek",
    "api_key_masked": "sk-3d36****f0b8",
    "base_url": "https://api.deepseek.com/v1",
    "model": "deepseek-flash",
    "max_tokens": 16384
  },
  "ai_image": {
    "enabled": false,
    "provider": "dashscope",
    "model": "wanx-v1",
    "size": "1024x1024"
  },
  "worker": { "video_workers": 2, "text_workers": 4, "claim_timeout_minutes": 30 },
  "storage": { "backend": "local", "quota_bytes": 214748364800 },
  "lexicon": { "tag_max_len": 7, "collect_timeout_seconds": 300 },
  "watermark_default": {
    "text_on": true,
    "text": "健衡学院",
    "text_position": "right_bottom",
    "font_size": 40,
    "font_color": "#FFFFFF",
    "text_opacity": 0.8,
    "logo_on": false,
    "logo_asset_id": null,
    "logo_position": "left_top",
    "logo_width": 160,
    "logo_opacity": 0.85,
    "margin": 40,
    "crf": 20,
    "preset": "medium",
    "threads": 8
  },
  "updated_at": "2026-10-28T09:00:00Z"
}
```

**PATCH 请求**：提交要修改的分区，未提交的分区保持不变：
```json
{
  "ai": { "provider": "deepseek", "api_key": "sk-新Key", "model": "deepseek-flash" }
}
```

### 8.3 默认水印（可自定义）

> 编辑者打开「视频水印」页时，以 `watermark_default` 作为初始配置。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/system/watermark-default` | 读取当前全局默认水印 |
| PUT | `/system/watermark-default` | **整体覆盖**默认水印（校验通过后写库并热加载） |
| POST | `/system/watermark-default/reset` | 恢复出厂预设 |

**PUT 请求**：
```json
{
  "text_on": true,
  "text": "健衡学院 · 官方",
  "text_position": "right_bottom",
  "font_size": 44,
  "font_color": "#0E9C8B",
  "text_opacity": 0.75,
  "logo_on": true,
  "logo_asset_id": "a_logo_xxx",
  "logo_position": "left_top",
  "logo_width": 180,
  "logo_opacity": 0.9,
  "margin": 48,
  "crf": 21,
  "preset": "medium",
  "threads": 8
}
```

**校验规则**：

| 规则 | 失败码 |
|---|---|
| `text_on` 与 `logo_on` 不能同时为 `false` | `WATERMARK_INVALID` |
| `text_on=true` 时 `text` 不能为空 | `WATERMARK_INVALID` |
| `logo_on=true` 时必须提供有效 `logo_asset_id` | `WATERMARK_INVALID` |
| `font_size` ∈ [8, 200]、`logo_width` ∈ [32, 800]、`margin` ∈ [0, 400] | `WATERMARK_INVALID` |
| `crf` ∈ [18, 28] | `WATERMARK_INVALID` |

**另存为方案**：在设置页编辑完后调 `POST /watermark/configs`（见 4.2），`body = { "name": "品牌标准水印", "is_default": false, "config": {...} }`，即可在视频水印页方案下拉中复用。

**生效范围**：只影响之后新打开的编辑会话，**不追溯**已提交任务的历史参数。

---

## 9. 认证与权限速查

| 接口 | super | admin | editor | viewer |
|---|:---:|:---:|:---:|:---:|
| `/auth/*`（登录/刷新/me） | ✅ | ✅ | ✅ | ✅ |
| `GET /tasks` | ✅ | ✅ | ✅(仅自己) | ✅(只读) |
| `POST /tasks` | ✅ | ✅ | ✅ | ❌ |
| `/tasks/{id}/retry|cancel|delete` | ✅ | ✅ | ✅(仅自己) | ❌ |
| `/watermark/*`（预览/方案） | ✅ | ✅ | ✅ | ❌ |
| `/articles/drafts`、`/prompts/drafts` | ✅ | ✅ | ✅(仅自己) | ❌ |
| `POST /assets/upload`（含视频导入入库） | ✅ | ✅ | ✅ | ❌ |
| `GET /assets`、`download` | ✅ | ✅ | ✅ | ✅(下载) |
| `DELETE /assets` | ✅ | ✅ | ✅(仅自己) | ❌ |
| `/users/*` | ✅ | ✅ | ❌ | ❌ |
| `/system/settings`、`/system/watermark-default` | ✅ | ✅ | ❌ | ❌ |
| `/system/status` | ✅ | ✅ | ❌ | ❌ |
| `/lexicon/*` | ✅ | ✅ | ✅ | ❌ |

> 「仅自己」= 通过后端按 `created_by` 过滤数据范围（`scope_all=false` 时）。
>
> **v1.1 变更**：`/system/*` 由「仅 super」改为「super + admin」；新增 `/prompts/drafts`；`/assets/upload` 同时承担视频本地导入的入库职责。

---

## 10. 契约演进约定

- 所有时间字段为 ISO 8601 UTC（`2026-10-28T10:00:00Z`）。
- ID 采用带前缀的 ULID/UUID 字符串（`t_`/`a_`/`u_`/`wc_`/`d_`）。
- 新增字段遵循**向后兼容**：只增不删、必填字段需大版本升级。
- 破坏性变更走 `/api/v2`。
- 前端通过生成的 OpenAPI（`/api/v1/openapi.json`）同步 TS 类型。
