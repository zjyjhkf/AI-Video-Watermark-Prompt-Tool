import { useCallback, useEffect, useRef, useState } from 'react';
import Sidebar from './components/Sidebar';
import { Toasts } from './components/ui';
import { api, ApiError, tokens } from './lib/api';
import type { Intent, Tone } from './lib/props';
import type { User } from './lib/types';
import Login from './pages/Login';
import Workbench from './pages/Workbench';
import VideoWatermark from './pages/VideoWatermark';
import ArticleEditor from './pages/ArticleEditor';
import PromptGenerator from './pages/PromptGenerator';
import TaskCenter from './pages/TaskCenter';
import AssetLibrary from './pages/AssetLibrary';
import Members from './pages/Members';
import Settings from './pages/Settings';
import Profile from './pages/Profile';

const ROUTES = [
  'workbench',
  'video',
  'article',
  'prompt',
  'tasks',
  'assets',
  'members',
  'settings',
  'profile',
] as const;

type Route = (typeof ROUTES)[number];

/** 路由级权限：管理入口对 admin 与 super 开放；内容生产仅限编辑者及以上 */
const ROUTE_ROLES: Partial<Record<Route, string[]>> = {
  members: ['super', 'admin'],
  settings: ['super', 'admin'],
  video: ['super', 'admin', 'editor'],
  article: ['super', 'admin', 'editor'],
  prompt: ['super', 'admin', 'editor'],
};

const readHash = (): Route => {
  const h = window.location.hash.replace(/^#\/?/, '') as Route;
  return ROUTES.includes(h) ? h : 'workbench';
};

interface ToastItem {
  id: string;
  text: string;
  tone?: Tone;
}

export default function App() {
  const [user, setUser] = useState<User | null>(tokens.cachedUser());
  const [booting, setBooting] = useState(!!tokens.access);
  const [route, setRoute] = useState<Route>(readHash);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const blockedRef = useRef('');

  const toast = useCallback((text: string, tone: Tone = 'default') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((list) => [...list, { id, text, tone }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 3000);
  }, []);

  /* 已有 token 时静默恢复会话 */
  useEffect(() => {
    if (!tokens.access) return;
    api
      .me()
      .then((u) => {
        setUser(u);
        tokens.setUser(u);
      })
      .catch(() => {
        tokens.clear();
        setUser(null);
      })
      .finally(() => setBooting(false));
  }, []);

  useEffect(() => {
    const onHash = () => setRoute(readHash());
    window.addEventListener('hashchange', onHash);
    if (!window.location.hash) window.location.hash = '#/workbench';
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    document.querySelector('.main')?.scrollTo({ top: 0 });
  }, [route]);

  /* 侧栏角标：待处理 + 处理中 */
  useEffect(() => {
    if (!user) return;
    const tick = () =>
      api
        .taskStats()
        .then((s) => setPendingCount((s.pending || 0) + (s.processing || 0)))
        .catch(() => undefined);
    tick();
    const timer = window.setInterval(tick, 15000);
    return () => window.clearInterval(timer);
  }, [user, route]);

  /* 路由级拦截：进不去就回工作台，并明确告知 */
  useEffect(() => {
    if (!user) return;
    const allowed = ROUTE_ROLES[route];
    if (allowed && !allowed.includes(user.role)) {
      if (blockedRef.current !== route) {
        blockedRef.current = route;
        toast('无权访问该页面', 'warn');
      }
      window.location.hash = '#/workbench';
      setRoute('workbench');
    } else {
      blockedRef.current = '';
    }
  }, [user, route, toast]);

  const navigate = useCallback((next: string, action?: string) => {
    window.location.hash = `#/${next}`;
    setRoute(next as Route);
    setIntent(action ? { action, ts: Date.now() } : null);
  }, []);

  const login = useCallback(
    async (username: string, password: string) => {
      try {
        const data = await api.login(username, password);
        tokens.save(data);
        setUser(data.user);
        toast(`欢迎回来，${data.user.name}`);
        return true;
      } catch (err) {
        if (err instanceof ApiError) throw err;
        throw new ApiError('INTERNAL_ERROR', '登录请求失败，请检查后端服务', 0);
      }
    },
    [toast],
  );

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      /* 忽略：本地清理即可 */
    }
    tokens.clear();
    setUser(null);
    window.location.hash = '#/workbench';
  }, []);

  /* 改完个人资料后，把最新账号信息同步到侧栏与本地缓存 */
  const refreshUser = useCallback(async () => {
    const fresh = await api.me();
    setUser(fresh);
    tokens.setUser(fresh);
  }, []);

  if (booting) {
    return (
      <div className="app app--auth">
        <div className="auth" style={{ gridTemplateColumns: '1fr', placeItems: 'center' }}>
          <div>
            <div className="skeleton" style={{ width: 220, height: 18 }} />
            <div className="hint" style={{ marginTop: 12, textAlign: 'center' }}>
              正在恢复登录状态…
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!user) return <Login onLogin={login} />;

  const pageProps = { user, toast, navigate, intent, refreshUser, logout };
  /* 权限不足的路由不渲染页面本身，避免先发请求再被拦回（会产生 403 噪音） */
  const routeAllowed = (r: Route) => {
    const roles = ROUTE_ROLES[r];
    return !roles || roles.includes(user.role);
  };

  return (
    <div className="app">
      <Sidebar
        current={route}
        onNavigate={navigate}
        user={user}
        pendingCount={pendingCount}
        onLogout={logout}
      />
      <main className="main">
        {route === 'workbench' && <Workbench {...pageProps} />}
        {route === 'video' && <VideoWatermark {...pageProps} />}
        {route === 'article' && <ArticleEditor {...pageProps} />}
        {route === 'prompt' && <PromptGenerator {...pageProps} />}
        {route === 'tasks' && <TaskCenter {...pageProps} />}
        {route === 'assets' && <AssetLibrary {...pageProps} />}
        {route === 'members' && routeAllowed('members') && <Members {...pageProps} />}
        {route === 'settings' && routeAllowed('settings') && <Settings {...pageProps} />}
        {route === 'profile' && <Profile {...pageProps} />}
      </main>
      <Toasts toasts={toasts} />
    </div>
  );
}
