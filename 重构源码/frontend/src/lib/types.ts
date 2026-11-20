/** 与后端 Pydantic 契约对齐的类型（字段名保持 snake_case，不做二次映射）。 */
import type { Role, WatermarkConfig } from './constants';

export interface User {
  id: string;
  username: string;
  name: string;
  role: Role;
  avatar?: string | null;
  scope_all?: boolean;
  is_active?: boolean;
  last_login_at?: string | null;
  created_at?: string;
}

export interface TokenOut {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
}

export interface Asset {
  id: string;
  name: string;
  type: 'video' | 'image' | 'document' | 'other';
  ext: string | null;
  mime: string | null;
  size_bytes: number;
  source: 'upload' | 'task' | 'draft';
  source_task_id: string | null;
  ref_id: string | null;
  folder: string | null;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  created_by: string;
  created_at: string;
  download_url: string | null;
  thumbnail_url: string | null;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export type TaskType = 'video' | 'article' | 'prompt';
export type TaskStatus = 'pending' | 'processing' | 'done' | 'failed' | 'canceled';

export interface Task {
  id: string;
  name: string;
  task_type: TaskType;
  status: TaskStatus;
  progress: number;
  node: string | null;
  error: string | null;
  save_to_assets: boolean;
  output_asset_id: string | null;
  created_by: string;
  created_by_name?: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  result?: VideoResult | ArticleResult | PromptResult | null;
  detail?: Record<string, string> | null;
}

export interface VideoResult {
  output_asset_id: string | null;
  output_name: string | null;
  output_size_bytes: number | null;
  duration_seconds: number | null;
  download_url: string | null;
  materialized: boolean;
  engine?: string | null;
  note?: string | null;
}

export interface ArticleResult {
  article: {
    title: string;
    body: string;
    tags: string[];
    compliance_check: string;
    coverage_check: string;
    engine?: string;
  };
}

export interface PromptResult {
  prompt_text: string;
  prompt_json: {
    prompt_text?: string;
    prompt_cn?: string;
    elements?: string;
    params?: string;
  };
  prompt_file_asset_id: string | null;
}

export interface TaskPage extends Page<Task> {
  counts?: Record<string, number>;
}

export interface Draft {
  id: string;
  kind: 'article' | 'prompt';
  title: string | null;
  platform: string | null;
  content_type: string | null;
  audience: string | null;
  requirement: string | null;
  body: string | null;
  tags: string[] | null;
  compliance_check: string | null;
  coverage_check: string | null;
  prompt_json: {
    prompt_text?: string;
    prompt_cn?: string;
    elements?: string;
    params?: string;
  } | null;
  asset_id: string | null;
  updated_at: string;
}

export interface DraftSaved {
  draft: Draft;
  asset: Asset | null;
}

export interface WatermarkPreset {
  id: string;
  name: string;
  is_default: boolean;
  config: WatermarkConfig;
  updated_at: string;
}

export interface SystemSettings {
  ai: {
    provider: string;
    base_url: string;
    model: string;
    api_key_masked: string | null;
    max_tokens: number;
    system_prompt_file?: string;
    temperature?: number;
  };
  ai_image: {
    enabled: boolean;
    provider: string;
    model: string;
    size: string;
    api_key_masked: string | null;
  };
  worker: { video_workers: number; text_workers: number; claim_timeout_minutes: number };
  storage: {
    backend: string;
    quota_bytes: number;
    used_bytes?: number;
    percent?: number;
    ffmpeg_available?: boolean;
  };
  lexicon: { tag_max_len: number; collect_timeout_seconds: number };
  watermark_default: WatermarkConfig;
  updated_at: string;
}

export interface ServiceStatus {
  service_name: string;
  state: string;
  node: string | null;
  heartbeat_at: string;
  running: number;
  pending: number;
  summary: string | null;
}

export interface CreateTaskInput {
  name: string;
  task_type: TaskType;
  asset_id?: string;
  save_to_assets?: boolean;
  output_folder?: string;
  watermark_config?: WatermarkConfig;
  platform?: string;
  content_type?: string;
  audience?: string;
  keyword?: string;
  keyword_strategy?: string;
  requirement?: string;
  ref_image_asset_ids?: string[];
}
