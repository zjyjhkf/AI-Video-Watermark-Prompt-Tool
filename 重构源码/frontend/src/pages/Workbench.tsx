import { useEffect, useState } from 'react';
import Icon from '../components/Icon';
import { Pill } from '../components/ui';
import { api, assetUrl } from '../lib/api';
import { fmtSize, fmtTime, TASK_STATUS, TASK_TYPES } from '../lib/constants';
import type { PageProps } from '../lib/props';
import type { Asset, Task } from '../lib/types';

/** 内容生产入口：游客（只读）不显示 */
const PRODUCER_ROLES = ['super', 'admin', 'editor'];

interface Counts {
  by_type: Record<string, number>;
  storage: { used_bytes: number; quota_bytes: number; percent: number };
}

export default function Workbench({ user, navigate }: PageProps) {
  const [stats, setStats] = useState<Record<string, number>>({});
  const [counts, setCounts] = useState<Counts | null>(null);
  const [recent, setRecent] = useState<Task[]>([]);
  const [members, setMembers] = useState(0);
  const [recentAssets, setRecentAssets] = useState<Asset[]>([]);
  const canManageMembers = user.role === 'super' || user.role === 'admin';
  const canProduce = PRODUCER_ROLES.includes(user.role);

  useEffect(() => {
    api.taskStats().then(setStats).catch(() => undefined);
    api.assetCounts().then(setCounts).catch(() => undefined);
    api
      .tasks({ page_size: 5 })
      .then((r) => setRecent(r.items))
      .catch(() => undefined);
    api
      .assets({ page_size: 4, type: 'video' })
      .then((r) => setRecentAssets(r.items))
      .catch(() => undefined);
    // 成员数仅管理员可见，避免游客打开工作台就发一个必然 403 的请求
    if (canManageMembers) {
      api
        .users({ page_size: 1 })
        .then((r) => setMembers(r.total))
        .catch(() => undefined);
    }
  }, [canManageMembers]);

  const totalAssets = Object.values(counts?.by_type || {}).reduce((a, b) => a + b, 0);
  const modules = [
    {
      key: 'video',
      name: '视频水印',
      desc: '导入 · 配置 · 预览 · 提交渲染',
      icon: 'video',
      foot: `素材库可用 ${counts?.by_type.video || 0} 个视频`,
      roles: PRODUCER_ROLES,
    },
    {
      key: 'article',
      name: '文章编写',
      desc: '需求 + 关键词 → 分节成稿',
      icon: 'doc',
      foot: `${stats.done || 0} 个任务已完成`,
      roles: PRODUCER_ROLES,
    },
    {
      key: 'prompt',
      name: '生图提示词',
      desc: '粗略需求 → 可直接出图的提示词',
      icon: 'wand',
      foot: '四节结构化输出',
      roles: PRODUCER_ROLES,
    },
    {
      key: 'tasks',
      name: '任务中心',
      desc: '队列状态 · 结果 · 重试',
      icon: 'list',
      foot: `排队 ${stats.pending || 0} · 处理中 ${stats.processing || 0}`,
    },
    {
      key: 'assets',
      name: '素材库',
      desc: '视频 / 图片 / 文档统一管理',
      icon: 'folder',
      foot: `${totalAssets} 个素材 · 已用 ${counts?.storage.percent ?? 0}%`,
    },
    {
      key: 'members',
      name: '成员与权限',
      desc: '账号、角色与数据范围',
      icon: 'users',
      foot: `可管理 ${members} 位账号`,
      roles: ['super', 'admin'],
    },
  ].filter((m) => !m.roles || m.roles.includes(user.role));

  return (
    <div className="page">
      <header className="head">
        <div>
          <h1 className="head__title">工作台</h1>
          <div className="head__sub">
            {user.name}，今天有 {stats.all || 0} 个任务提交、
            {(stats.pending || 0) + (stats.processing || 0)} 个正在进行
          </div>
        </div>
        {canProduce ? (
          <div className="head__actions">
            <button className="btn btn--primary" onClick={() => navigate('article')}>
              <Icon name="plus" size={16} stroke={2} />
              新建任务
            </button>
          </div>
        ) : null}
      </header>

      <div className="stats">
        <div className="stat card">
          <div className="stat__label">素材总数</div>
          <div className="stat__value num">{totalAssets}</div>
          <div className="stat__hint">
            视频 {counts?.by_type.video || 0} / 图片 {counts?.by_type.image || 0} / 文档{' '}
            {counts?.by_type.document || 0}
          </div>
        </div>
        <div className="stat card">
          <div className="stat__label">任务总数</div>
          <div className="stat__value num">{stats.all || 0}</div>
          <div className="stat__hint">含全部状态</div>
        </div>
        <div className="stat card">
          <div className="stat__label">待处理任务</div>
          <div className="stat__value num">{(stats.pending || 0) + (stats.processing || 0)}</div>
          <div className="stat__hint">
            排队 {stats.pending || 0} · 处理中 {stats.processing || 0}
          </div>
        </div>
        <div className="stat card">
          <div className="stat__label">存储用量</div>
          <div className="stat__value num">{counts?.storage.percent ?? 0}%</div>
          <div className="stat__hint">
            {fmtSize(counts?.storage.used_bytes)} / {fmtSize(counts?.storage.quota_bytes)}
          </div>
        </div>
      </div>

      <div className="section-head">
        <div className="section-head__title">功能模块</div>
        <div className="section-head__hint">{modules.length} 个模块 · 点击卡片直接进入</div>
      </div>

      <div className="modules">
        {modules.map((m) => (
          <button key={m.key} className="module" onClick={() => navigate(m.key)}>
            <div className="module__head">
              <span className="module__icon">
                <Icon name={m.icon} size={18} stroke={1.8} />
              </span>
              <div className="module__titles">
                <div className="module__name">{m.name}</div>
                <div className="module__desc">{m.desc}</div>
              </div>
              <span className="module__arrow">
                <Icon name="chevronRight" size={15} stroke={2} />
              </span>
            </div>
            <div className="module__foot">{m.foot}</div>
          </button>
        ))}
      </div>

      <div className="card card--pad" style={{ marginTop: 18 }}>
        <div className="card__title panel__head">
          <span>最近任务</span>
          <button className="link" onClick={() => navigate('tasks')}>
            查看全部
          </button>
        </div>
        <div className="recent">
          {recent.length === 0 ? (
            <div className="recent__empty">还没有任务，从「文章编写」或「视频水印」开始</div>
          ) : (
            recent.map((t) => {
              const type = TASK_TYPES[t.task_type];
              const status = TASK_STATUS[t.status];
              return (
                <div key={t.id} className="recent__row" onClick={() => navigate('tasks', t.id)}>
                  <span className="recent__type" style={{ color: type.color, background: type.bg }}>
                    <Icon name={type.icon} size={13} stroke={1.9} />
                    {type.label}
                  </span>
                  <span className="recent__name">{t.name}</span>
                  <span className="recent__time">{fmtTime(t.created_at)}</span>
                  <Pill tone={status.tone}>{status.label}</Pill>
                </div>
              );
            })
          )}
        </div>
      </div>

      {recentAssets.length ? (
        <div className="section-head" style={{ marginTop: 18 }}>
          <div className="section-head__title">最近素材</div>
          <div className="section-head__hint">来自素材库的最新视频</div>
        </div>
      ) : null}
      {recentAssets.length ? (
        <div className="grid">
          {recentAssets.map((a) => (
            <div key={a.id} className="asset" onClick={() => navigate('assets')}>
              <div className={`asset__thumb ${a.thumbnail_url ? '' : 'g3'}`}>
                {a.thumbnail_url ? (
                  <img src={assetUrl(a.thumbnail_url)} alt={a.name} />
                ) : (
                  <div className="asset__thumb-center">
                    <Icon name="film" size={36} stroke={1.3} style={{ color: 'rgba(255,255,255,0.62)' }} />
                  </div>
                )}
                <span className="asset__kind">{a.ext}</span>
              </div>
              <div className="asset__name">{a.name}</div>
              <div className="asset__meta">
                {a.ext} · {fmtSize(a.size_bytes)} · {fmtTime(a.created_at)}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
