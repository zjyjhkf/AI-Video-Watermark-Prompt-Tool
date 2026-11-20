/** API 客户端：统一错误结构、Token 存储、自动刷新、上传与 SSE。 */
import type {
  Asset,
  CreateTaskInput,
  Draft,
  DraftSaved,
  Page,
  ServiceStatus,
  SystemSettings,
  Task,
  TaskPage,
  TokenOut,
  User,
  WatermarkPreset,
} from './types';
import type { WatermarkConfig } from './constants';

export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || '/api/v1';

const ACCESS_KEY = 'ct.access_token';
const REFRESH_KEY = 'ct.refresh_token';
const USER_KEY = 'ct.user';

export class ApiError extends Error {
  code: string;
  status: number;
  detail: Record<string, unknown>;

  constructor(code: string, message: string, status: number, detail: Record<string, unknown> = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

export const tokens = {
  get access() {
    return localStorage.getItem(ACCESS_KEY) || '';
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY) || '';
  },
  save(t: TokenOut) {
    localStorage.setItem(ACCESS_KEY, t.access_token);
    localStorage.setItem(REFRESH_KEY, t.refresh_token);
    localStorage.setItem(USER_KEY, JSON.stringify(t.user));
  },
  cachedUser(): User | null {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? (JSON.parse(raw) as User) : null;
    } catch {
      return null;
    }
  },
  setUser(u: User) {
    localStorage.setItem(USER_KEY, JSON.stringify(u));
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

let refreshing: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  if (!tokens.refresh) return false;
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: tokens.refresh }),
  });
  if (!res.ok) {
    tokens.clear();
    return false;
  }
  tokens.save((await res.json()) as TokenOut);
  return true;
}

interface Options extends Omit<RequestInit, 'body'> {
  body?: unknown;
  raw?: boolean;
  retry?: boolean;
}

async function request<T>(path: string, opts: Options = {}): Promise<T> {
  const { body, raw, retry = true, headers, ...rest } = opts;
  const isForm = body instanceof FormData;
  const finalHeaders: Record<string, string> = {
    ...(isForm ? {} : { 'Content-Type': 'application/json' }),
    ...((headers as Record<string, string>) || {}),
  };
  if (tokens.access) finalHeaders.Authorization = `Bearer ${tokens.access}`;

  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: finalHeaders,
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
  });

  if (res.status === 401 && retry && tokens.refresh) {
    refreshing = refreshing || doRefresh().finally(() => (refreshing = null));
    const ok = await refreshing;
    if (ok) return request<T>(path, { ...opts, retry: false });
  }

  if (!res.ok) {
    let payload: { code?: string; message?: string; detail?: Record<string, unknown> } = {};
    try {
      payload = await res.json();
    } catch {
      payload = { message: res.statusText };
    }
    throw new ApiError(
      payload.code || 'INTERNAL_ERROR',
      payload.message || `请求失败（${res.status}）`,
      res.status,
      payload.detail || {},
    );
  }

  if (res.status === 204) return undefined as T;
  if (raw) return (await res.blob()) as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** <img>/<video> 不能带 header，用 query token（后端已支持）。 */
export const assetUrl = (path?: string | null): string => {
  if (!path) return '';
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}access_token=${encodeURIComponent(tokens.access)}`;
};

export const api = {
  // ---- 运维
  health: () =>
    request<{ ok: boolean; service: string; version: string; render_engine: string; ffmpeg_available: boolean }>(
      '/health',
    ),

  // ---- 认证
  login: (username: string, password: string) =>
    request<TokenOut>('/auth/login', { method: 'POST', body: { username, password } }),
  me: () => request<User>('/auth/me'),
  updateMe: (body: {
    name?: string;
    username?: string;
    old_password?: string;
    new_password?: string;
  }) => request<User>('/auth/me', { method: 'PATCH', body }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),

  // ---- 成员
  users: (params: { page?: number; page_size?: number; query?: string; role?: string } = {}) =>
    request<Page<User>>(`/users?${qs(params)}`),
  createUser: (body: {
    name: string;
    username: string;
    password: string;
    role: string;
    scope_all: boolean;
  }) => request<User>('/users', { method: 'POST', body }),
  updateUser: (id: string, body: Record<string, unknown>) =>
    request<User>(`/users/${id}`, { method: 'PATCH', body }),
  deleteUser: (id: string) => request<void>(`/users/${id}`, { method: 'DELETE' }),
  resetPassword: (id: string, password: string) =>
    request<void>(`/users/${id}/reset-password`, { method: 'POST', body: { password } }),

  // ---- 素材
  assets: (params: {
    page?: number;
    page_size?: number;
    type?: string;
    source?: string;
    q?: string;
    task_id?: string;
  } = {}) => request<Page<Asset>>(`/assets?${qs(params)}`),
  assetCounts: () =>
    request<{ by_type: Record<string, number>; storage: { used_bytes: number; quota_bytes: number; percent: number } }>(
      '/assets/counts',
    ),
  upload: (files: File[], folder?: string) => {
    const form = new FormData();
    files.forEach((f) => form.append('files', f));
    if (folder) form.append('folder', folder);
    return request<{ items: Asset[] }>('/assets/upload', { method: 'POST', body: form });
  },
  deleteAsset: (id: string) => request<void>(`/assets/${id}`, { method: 'DELETE' }),
  batchDelete: (ids: string[]) =>
    request<{ deleted: number }>('/assets/batch-delete', { method: 'POST', body: { ids } }),
  batchDownload: (ids: string[]) =>
    request<Blob>('/assets/batch-download', { method: 'POST', body: { ids }, raw: true }),

  // ---- 任务
  tasks: (params: { page?: number; page_size?: number; status?: string; task_type?: string; q?: string } = {}) =>
    request<TaskPage>(`/tasks?${qs(params)}`),
  taskStats: () => request<Record<string, number>>('/tasks/stats'),
  task: (id: string) => request<Task>(`/tasks/${id}`),
  createTask: (body: CreateTaskInput) => request<Task>('/tasks', { method: 'POST', body }),
  retryTask: (id: string) => request<Task>(`/tasks/${id}/retry`, { method: 'POST' }),
  cancelTask: (id: string) => request<Task>(`/tasks/${id}/cancel`, { method: 'POST' }),
  deleteTask: (id: string) => request<void>(`/tasks/${id}`, { method: 'DELETE' }),

  // ---- 草稿
  articleDrafts: () => request<Page<Draft>>('/articles/drafts'),
  saveArticleDraft: (body: Record<string, unknown>, id?: string) =>
    id
      ? request<DraftSaved>(`/articles/drafts/${id}`, { method: 'PUT', body })
      : request<DraftSaved>('/articles/drafts', { method: 'POST', body }),
  promptDrafts: () => request<Page<Draft>>('/prompts/drafts'),
  savePromptDraft: (body: Record<string, unknown>, id?: string) =>
    id
      ? request<DraftSaved>(`/prompts/drafts/${id}`, { method: 'PUT', body })
      : request<DraftSaved>('/prompts/drafts', { method: 'POST', body }),

  // ---- 水印
  presets: () => request<WatermarkPreset[]>('/watermark/configs'),
  createPreset: (name: string, config: WatermarkConfig, isDefault = false) =>
    request<WatermarkPreset>('/watermark/configs', {
      method: 'POST',
      body: { name, config, is_default: isDefault },
    }),
  deletePreset: (id: string) => request<void>(`/watermark/configs/${id}`, { method: 'DELETE' }),

  // ---- 系统
  settings: () => request<SystemSettings>('/system/settings'),
  patchSettings: (body: Record<string, unknown>) =>
    request<SystemSettings>('/system/settings', { method: 'PATCH', body }),
  watermarkDefault: () => request<WatermarkConfig>('/system/watermark-default'),
  saveWatermarkDefault: (body: WatermarkConfig) =>
    request<WatermarkConfig>('/system/watermark-default', { method: 'PUT', body }),
  resetWatermarkDefault: () =>
    request<WatermarkConfig>('/system/watermark-default/reset', { method: 'POST' }),
  status: () => request<ServiceStatus>('/system/status'),

  // ---- 词库
  lexicon: (keyword: string) =>
    request<Record<string, unknown>>(`/lexicon/${encodeURIComponent(keyword)}/plan?strategy=auto`),
  lexiconEnsure: (keyword: string) =>
    request<Record<string, unknown>>(`/lexicon/${encodeURIComponent(keyword)}/ensure`, {
      method: 'POST',
    }),
};

function qs(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') sp.append(k, String(v));
  });
  return sp.toString();
}

/** 任务进度 SSE；返回关闭函数。断流时调用方回退轮询。 */
export function watchTask(taskId: string, onUpdate: (s: { status: string; progress: number }) => void) {
  const url = `${API_BASE}/tasks/${taskId}/events?access_token=${encodeURIComponent(tokens.access)}`;
  const es = new EventSource(url);
  let closed = false;
  es.addEventListener('status', (e) => {
    try {
      onUpdate(JSON.parse((e as MessageEvent).data));
    } catch {
      /* 忽略坏帧 */
    }
  });
  es.onerror = () => {
    if (!closed) es.close();
  };
  return () => {
    closed = true;
    es.close();
  };
}

/** 触发浏览器下载（带鉴权）。 */
export async function downloadAsset(assetId: string, filename?: string) {
  const blob = await request<Blob>(`/assets/${assetId}/download`, { raw: true });
  saveBlob(blob, filename || 'download');
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
