import type { User } from './types';

export type Tone = 'default' | 'warn' | 'success';

export interface Intent {
  action?: string;
  taskId?: string;
  ts: number;
}

export interface PageProps {
  user: User;
  toast: (text: string, tone?: Tone) => void;
  navigate: (route: string, action?: string) => void;
  intent?: Intent | null;
  /** 重新拉取 /auth/me 并同步到全局（改完个人资料后调用） */
  refreshUser?: () => Promise<void>;
  /** 清除本地凭证并回到登录页（改密后强制重新登录） */
  logout?: () => Promise<void> | void;
}
