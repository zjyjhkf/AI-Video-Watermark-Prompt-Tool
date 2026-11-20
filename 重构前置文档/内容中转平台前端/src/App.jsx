import React, { useCallback, useEffect, useRef, useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import { Toasts } from './components/ui.jsx';
import Workbench from './pages/Workbench.jsx';
import VideoWatermark from './pages/VideoWatermark.jsx';
import ArticleEditor from './pages/ArticleEditor.jsx';
import PromptGenerator from './pages/PromptGenerator.jsx';
import TaskCenter from './pages/TaskCenter.jsx';
import AssetLibrary from './pages/AssetLibrary.jsx';
import Members from './pages/Members.jsx';
import Settings from './pages/Settings.jsx';
import Login from './pages/Login.jsx';
import { initialAssets, initialMembers, initialSettings, initialTasks } from './data/mock.js';

const ROUTES = [
  'workbench',
  'video',
  'article',
  'prompt',
  'tasks',
  'assets',
  'members',
  'settings',
];

const ROUTE_ROLES = { members: ['super', 'admin'], settings: ['super', 'admin'] };

const readHash = () => {
  const hash = window.location.hash.replace(/^#\/?/, '');
  return ROUTES.includes(hash) ? hash : 'workbench';
};

export default function App() {
  const [user, setUser] = useState(null);
  const [route, setRoute] = useState(readHash);
  const [assets, setAssets] = useState(initialAssets);
  const [members, setMembers] = useState(initialMembers);
  const [tasks, setTasks] = useState(initialTasks);
  const [settings, setSettings] = useState(initialSettings);
  const [toasts, setToasts] = useState([]);
  const [intent, setIntent] = useState(null);
  const timers = useRef([]);
  const intervals = useRef([]);

  useEffect(() => {
    const onHash = () => setRoute(readHash());
    window.addEventListener('hashchange', onHash);
    if (!window.location.hash) window.location.hash = '#/workbench';
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      intervals.current.forEach(clearInterval);
    },
    []
  );

  useEffect(() => {
    const main = document.querySelector('.main');
    if (main) main.scrollTop = 0;
  }, [route]);

  const toast = useCallback((text, tone) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((list) => [...list, { id, text, tone }]);
    setTimeout(() => {
      setToasts((list) => list.filter((t) => t.id !== id));
    }, 2800);
  }, []);

  /* 路由级权限拦截：无权限直接回到工作台，并给出明确反馈 */
  const blockedRef = useRef('');
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

  const navigate = useCallback((next, action) => {
    if (next) window.location.hash = `#/${next}`;
    setRoute(next || 'workbench');
    setIntent(action ? { action, ts: Date.now() } : null);
  }, []);

  const login = useCallback(
    (username, password) => {
      const found = members.find(
        (m) => m.username.toLowerCase() === username.toLowerCase() && m.active
      );
      if (!found || found.password !== password) return false;
      setUser(found);
      setMembers((list) =>
        list.map((m) => (m.id === found.id ? { ...m, lastActive: '在线', online: true } : m))
      );
      toast(`欢迎回来，${found.name}`);
      return true;
    },
    [members, toast]
  );

  const logout = useCallback(() => {
    setUser(null);
    setToasts([]);
  }, []);

  /* 素材写入：手工上传 / 任务产出 / 草稿 共用一条通道，id 已存在则更新 */
  const createAsset = useCallback((payload) => {
    const id = payload.id || `a_${Date.now().toString().slice(-6)}`;
    const asset = {
      type: 'document',
      ext: 'MD',
      size: '4 KB',
      time: '刚刚',
      folder: '未分类',
      source: 'upload',
      tone: 'g2',
      ...payload,
      id,
    };
    setAssets((list) => {
      const exists = list.some((a) => a.id === id);
      return exists ? list.map((a) => (a.id === id ? { ...a, ...asset } : a)) : [asset, ...list];
    });
    return id;
  }, []);

  /* 草稿保存：同一份草稿重复保存只更新，不新增素材 */
  const saveDraft = useCallback(
    (payload, existingId) => {
      const content = payload.content || '';
      const size = `${Math.max(2, Math.ceil(content.length / 1024))} KB`;
      const id = createAsset({
        type: 'document',
        ext: 'MD',
        folder: '草稿 / 文章',
        source: 'draft',
        tone: 'g6',
        icon: 'doc',
        ...payload,
        id: existingId,
        size,
      });
      return id;
    },
    [createAsset]
  );

  /* 任务提交：排队 → 处理中（进度持续推进）→ 完成；视频任务完成时把成品写入素材库 */
  const createTask = useCallback((payload) => {
    const id = `t_${String(Date.now()).slice(-5)}`;
    const task = {
      id,
      name: payload.name,
      type: payload.type,
      status: 'pending',
      owner: (user && user.name) || '—',
      createdAt: '刚刚',
      startedAt: '—',
      finishedAt: '—',
      node: null,
      progress: 0,
      error: null,
      detail: payload.detail || null,
      result: payload.result || null,
    };
    setTasks((list) => [task, ...list]);

    timers.current.push(
      setTimeout(() => {
        setTasks((list) =>
          list.map((t) =>
            t.id === id && t.status === 'pending'
              ? { ...t, status: 'processing', startedAt: '刚刚', node: 'worker-1#5182', progress: 0.06 }
              : t
          )
        );
      }, 1400)
    );

    const tick = setInterval(() => {
      setTasks((list) =>
        list.map((t) => {
          if (t.id !== id || t.status !== 'processing') return t;
          const next = Math.min(0.94, (t.progress || 0) + 0.07 + Math.random() * 0.05);
          return { ...t, progress: Number(next.toFixed(2)) };
        })
      );
    }, 620);
    intervals.current.push(tick);

    timers.current.push(
      setTimeout(() => {
        clearInterval(tick);
        let outputId = null;
        if (payload.outputAsset) {
          outputId = `a_out_${String(Date.now()).slice(-6)}`;
          setAssets((list) => [
            {
              type: 'video',
              ext: 'MP4',
              size: '—',
              time: '刚刚',
              folder: '产物 / 视频',
              tone: 'g3',
              icon: 'film',
              iconColor: 'rgba(255,255,255,0.62)',
              source: 'task',
              ...payload.outputAsset,
              id: outputId,
              sourceTaskId: id,
            },
            ...list,
          ]);
        }
        setTasks((list) =>
          list.map((t) =>
            t.id === id && t.status === 'processing'
              ? {
                  ...t,
                  status: 'done',
                  finishedAt: '刚刚',
                  progress: 1,
                  outputAssetId: outputId,
                  result: t.result
                    ? { ...t.result, outputAssetId: outputId, materialized: !!outputId }
                    : t.result,
                }
              : t
          )
        );
      }, 7600)
    );

    return id;
  }, [user]);

  const updateTask = useCallback((id, patch) => {
    setTasks((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const deleteTask = useCallback((id) => {
    setTasks((list) => list.filter((t) => t.id !== id));
  }, []);

  const retryTask = useCallback(
    (id) => {
      updateTask(id, {
        status: 'pending',
        error: null,
        startedAt: '—',
        finishedAt: '—',
        node: null,
        progress: 0,
      });
      toast('任务已重新入队');
    },
    [toast, updateTask]
  );

  if (!user) {
    return (
      <div className="app app--auth">
        <Login onLogin={login} members={members} />
        <Toasts toasts={toasts} />
      </div>
    );
  }

  const pendingCount = tasks.filter(
    (t) => t.status === 'pending' || t.status === 'processing'
  ).length;

  return (
    <div className="app">
      <Sidebar
        current={route}
        onNavigate={(next) => navigate(next)}
        user={user}
        pendingCount={pendingCount}
        onLogout={logout}
      />

      <main className="main">
        {route === 'workbench' && (
          <Workbench
            assets={assets}
            members={members}
            tasks={tasks}
            user={user}
            onNavigate={navigate}
          />
        )}

        {route === 'video' && (
          <VideoWatermark
            assets={assets}
            settings={settings}
            tasks={tasks}
            onCreateTask={createTask}
            onNavigate={navigate}
            toast={toast}
          />
        )}

        {route === 'article' && (
          <ArticleEditor
            onCreateTask={createTask}
            onSaveDraft={saveDraft}
            onNavigate={navigate}
            toast={toast}
          />
        )}

        {route === 'prompt' && (
          <PromptGenerator
            onCreateTask={createTask}
            onSaveDraft={saveDraft}
            onNavigate={navigate}
            toast={toast}
          />
        )}

        {route === 'tasks' && (
          <TaskCenter
            tasks={tasks}
            assets={assets}
            user={user}
            onRetry={retryTask}
            onUpdateTask={updateTask}
            onDeleteTask={deleteTask}
            onNavigate={navigate}
            toast={toast}
            intent={intent}
          />
        )}

        {route === 'assets' && (
          <AssetLibrary assets={assets} setAssets={setAssets} toast={toast} intent={intent} />
        )}

        {route === 'members' && (
          <Members
            members={members}
            setMembers={setMembers}
            user={user}
            toast={toast}
            intent={intent}
          />
        )}

        {route === 'settings' && (
          <Settings settings={settings} setSettings={setSettings} toast={toast} user={user} />
        )}
      </main>

      <Toasts toasts={toasts} />
    </div>
  );
}
