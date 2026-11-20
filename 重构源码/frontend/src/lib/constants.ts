/** 枚举与展示常量：与 API 契约 0.3 的取值一一对应，不做二次翻译。 */

export type Role = 'super' | 'admin' | 'editor' | 'guest';

export const ROLES: Record<Role, { label: string; short: string; color: string; bg: string }> = {
  super: { label: '超级管理员', short: '超级', color: '#3e9b77', bg: '#e8f8f1' },
  admin: { label: '管理员', short: '管理员', color: '#3e86a9', bg: '#e6f4fa' },
  editor: { label: '编辑者', short: '编辑', color: '#0e9c8b', bg: '#edfaf7' },
  guest: { label: '游客', short: '游客', color: '#7c9b96', bg: '#f3f6f6' },
};

export const ROLE_KEYS: Role[] = ['super', 'admin', 'editor', 'guest'];

export const ASSET_TYPES = [
  { key: 'video', label: '视频' },
  { key: 'image', label: '图片' },
  { key: 'document', label: '文档' },
];

export const ASSET_SOURCE: Record<string, { key: string; label: string }> = {
  upload: { key: 'upload', label: '上传' },
  task: { key: 'task', label: '任务产出' },
  draft: { key: 'draft', label: '草稿' },
};

export const ASSET_SOURCE_FILTERS = [
  { key: 'all', label: '全部来源' },
  { key: 'upload', label: '上传' },
  { key: 'task', label: '任务产出' },
  { key: 'draft', label: '草稿' },
];

export const VIDEO_ACCEPT = ['.mp4', '.mov', '.mkv', '.webm'];
export const VIDEO_MAX_BYTES = 2 * 1024 * 1024 * 1024;

export const TASK_TYPES: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  video: { label: '视频水印', icon: 'video', color: '#0e9c8b', bg: '#edfaf7' },
  article: { label: '文章编写', icon: 'doc', color: '#3e86a9', bg: '#e6f4fa' },
  prompt: { label: '生图提示词', icon: 'wand', color: '#8a6fbf', bg: '#f2eefb' },
};

export const TASK_STATUS: Record<string, { label: string; tone: string }> = {
  pending: { label: '待处理', tone: 'amber' },
  processing: { label: '处理中', tone: 'blue' },
  done: { label: '已完成', tone: 'mint' },
  failed: { label: '失败', tone: 'danger' },
  canceled: { label: '已取消', tone: 'gray' },
};

export const POSITIONS = [
  { key: 'left_top', label: '左上' },
  { key: 'top_center', label: '上中' },
  { key: 'right_top', label: '右上' },
  { key: 'left_middle', label: '左中' },
  { key: 'center', label: '居中' },
  { key: 'right_middle', label: '右中' },
  { key: 'left_bottom', label: '左下' },
  { key: 'bottom_center', label: '下中' },
  { key: 'right_bottom', label: '右下' },
];

export const positionLabel = (key: string): string =>
  POSITIONS.find((p) => p.key === key)?.label ?? '右下';

export const PLATFORMS = [
  { key: 'xhs', label: '小红书' },
  { key: 'weibo', label: '微博' },
  { key: 'wechat', label: '微信公众号' },
  { key: 'douyin', label: '抖音' },
];

export const CONTENT_TYPES = [
  { key: 'science', label: '科普教育' },
  { key: 'commerce', label: '种草带货' },
  { key: 'course', label: '课程转化' },
  { key: 'event', label: '活动引流' },
  { key: 'market', label: '市场分析' },
];

export const AUDIENCES = [
  { key: 'general', label: '通俗' },
  { key: 'professional', label: '专业' },
  { key: 'mixed', label: '混合' },
];

export const KEYWORD_STRATEGIES = [
  { key: 'auto', label: '自动补采' },
  { key: 'existing', label: '只用现成' },
  { key: 'off', label: '不启用' },
];

export const ENCODE_PRESETS = ['ultrafast', 'fast', 'medium', 'slow'];

export const AI_PROVIDERS = [
  { key: 'deepseek', label: 'DeepSeek' },
  { key: 'zhipu', label: '智谱 AI' },
  { key: 'dashscope', label: '阿里云百炼' },
  { key: 'openai', label: 'OpenAI' },
  { key: 'openai_compatible', label: 'OpenAI 兼容' },
];

export const labelOf = (list: { key: string; label: string }[], key?: string | null): string =>
  list.find((i) => i.key === key)?.label ?? (key || '—');

export const ICON_BY_TYPE: Record<string, string> = {
  video: 'film',
  image: 'image',
  document: 'doc',
  other: 'folder',
};

export const TONE_BY_TYPE: Record<string, string> = {
  video: 'g3',
  image: 'g1',
  document: 'g2',
  other: 'g2',
};

export const SWATCHES = ['#FFFFFF', '#111111', '#14B8A4', '#F2C879'];

export interface WatermarkConfig {
  text_on: boolean;
  text: string;
  text_position: string;
  font_size: number;
  font_color: string;
  text_opacity: number;
  logo_on: boolean;
  logo_asset_id: string | null;
  logo_position: string;
  logo_width: number;
  logo_opacity: number;
  margin: number;
  crf: number;
  preset: string;
  threads: number;
}

export const DEFAULT_WATERMARK: WatermarkConfig = {
  text_on: true,
  text: '健衡学院',
  text_position: 'right_bottom',
  font_size: 40,
  font_color: '#FFFFFF',
  text_opacity: 0.8,
  logo_on: false,
  logo_asset_id: null,
  logo_position: 'left_top',
  logo_width: 160,
  logo_opacity: 0.85,
  margin: 40,
  crf: 20,
  preset: 'medium',
  threads: 8,
};

export const fmtDuration = (sec?: number | null): string => {
  if (!sec || sec <= 0) return '—';
  const s = Math.round(sec);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export const fmtSize = (bytes?: number | null): string => {
  if (!bytes) return '—';
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${bytes} B`;
};

export const fmtTime = (iso?: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const now = Date.now();
  const diff = (now - d.getTime()) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
