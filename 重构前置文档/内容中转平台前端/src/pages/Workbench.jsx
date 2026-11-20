import React, { useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Modal, Pill } from '../components/ui.jsx';
import { TASK_STATUS, TASK_TYPES, storage } from '../data/mock.js';

const MODULES = [
  {
    key: 'video',
    name: '视频水印',
    desc: '上传 · 配置 · 预览 · 提交处理',
    icon: 'video',
    tone: { bg: '#e4f7f3', color: '#14b8a4' },
  },
  {
    key: 'article',
    name: '文章编写',
    desc: '需求 + 关键词 → 分节成稿',
    icon: 'doc',
    tone: { bg: '#e6f4fa', color: '#3ea8c9' },
  },
  {
    key: 'prompt',
    name: '生图提示词',
    desc: '粗略需求 → 可直接出图的提示词',
    icon: 'wand',
    tone: { bg: '#f2eefb', color: '#8a6fbf' },
  },
  {
    key: 'tasks',
    name: '任务中心',
    desc: '队列状态、结果与重试',
    icon: 'list',
    tone: { bg: '#e8f8f1', color: '#55c29a' },
  },
  {
    key: 'assets',
    name: '素材库',
    desc: '视频 / 图片 / 文档统一管理',
    icon: 'folder',
    tone: { bg: '#fdf4e6', color: '#b8823a' },
  },
  {
    key: 'members',
    name: '成员与权限',
    desc: '账号、角色与数据范围',
    icon: 'users',
    tone: { bg: '#eef3f7', color: '#5d87a3' },
  },
];

export default function Workbench({ assets, members, tasks, user, onNavigate }) {
  const [query, setQuery] = useState('');
  const [newOpen, setNewOpen] = useState(false);

  const counts = useMemo(() => {
    const pending = tasks.filter((t) => t.status === 'pending').length;
    const processing = tasks.filter((t) => t.status === 'processing').length;
    const today = tasks.filter((t) => t.createdAt.startsWith('今天')).length;
    return { pending, processing, today };
  }, [tasks]);

  const recent = useMemo(() => tasks.slice(0, 5), [tasks]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return recent;
    return recent.filter(
      (t) => t.name.toLowerCase().includes(q) || TASK_TYPES[t.type].label.includes(q)
    );
  }, [query, recent]);

  const footOf = (key) => {
    if (key === 'video') return `排队 ${counts.pending} · 处理中 ${counts.processing}`;
    if (key === 'article') return `今日提交 ${counts.today} 个任务`;
    if (key === 'prompt') return '四节结构化输出';
    if (key === 'tasks') return `运行中 ${counts.processing} 个`;
    if (key === 'assets') return `${assets.length} 个素材 · 已用 ${storage.pct}%`;
    return `${members.length} 位成员`;
  };

  const stats = [
    { value: assets.length, label: '素材总数', hint: '视频 / 图片 / 文档' },
    { value: counts.today, label: '今日任务', hint: '含全部状态' },
    { value: counts.pending + counts.processing, label: '待处理任务', hint: '排队 + 处理中' },
    { value: `${storage.pct}%`, label: '存储用量', hint: `${storage.used} / ${storage.total} ${storage.unit}` },
  ];

  return (
    <div className="page">
      <header className="head">
        <div>
          <h1 className="head__title">工作台</h1>
          <div className="head__sub">
            {user.name}，今天有 {counts.today} 个任务提交、{counts.processing} 个正在处理
          </div>
        </div>
        <div className="head__actions">
          <div className="toolbar-search">
            <Icon name="search" size={15} stroke={1.9} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索任务名称或类型…"
            />
          </div>
          <button className="btn btn--primary" onClick={() => setNewOpen(true)}>
            <Icon name="plus" size={16} stroke={2} />
            新建任务
          </button>
        </div>
      </header>

      <div className="stats">
        {stats.map((s) => (
          <div className="stat" key={s.label}>
            <div className="stat__value">{s.value}</div>
            <div className="stat__label">{s.label}</div>
            <div className="stat__hint">{s.hint}</div>
          </div>
        ))}
      </div>

      <div className="section-head">
        <div className="section-head__title">功能模块</div>
        <div className="section-head__hint">6 个模块 · 点击卡片直接进入</div>
      </div>

      <div className="modules modules--six">
        {MODULES.map((m) => (
          <button className="module module--compact" key={m.key} onClick={() => onNavigate(m.key)}>
            <div className="module__head">
              <div className="module__icon" style={{ background: m.tone.bg, color: m.tone.color }}>
                <Icon name={m.icon} size={18} />
              </div>
              <div className="module__titles">
                <div className="module__name">{m.name}</div>
                <div className="module__desc">{m.desc}</div>
              </div>
              <Icon name="chevronRight" size={15} className="module__arrow" />
            </div>
            <div className="module__foot">{footOf(m.key)}</div>
          </button>
        ))}
      </div>

      <section className="recent">
        <div className="recent__head">
          <div className="recent__title">最近任务</div>
          <button className="link" onClick={() => onNavigate('tasks')}>
            查看全部
          </button>
        </div>
        {filtered.map((t) => (
          <div
            className="recent__row"
            key={t.id}
            onClick={() => onNavigate('tasks', t.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onNavigate('tasks', t.id);
            }}
          >
            <span
              className="recent__type"
              style={{ background: TASK_TYPES[t.type].bg, color: TASK_TYPES[t.type].color }}
            >
              <Icon name={TASK_TYPES[t.type].icon} size={12} stroke={1.9} />
              {TASK_TYPES[t.type].label}
            </span>
            <div className="recent__name">{t.name}</div>
            <div className="recent__meta">{t.owner}</div>
            <div className="recent__time num">{t.createdAt}</div>
            <div className="recent__status">
              <Pill tone={TASK_STATUS[t.status].tone}>{TASK_STATUS[t.status].label}</Pill>
            </div>
          </div>
        ))}
        {filtered.length === 0 ? (
          <div className="recent__empty">没有匹配「{query}」的任务</div>
        ) : null}
      </section>

      <Modal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title="新建任务"
        sub="选择一条生产链路，进入对应编辑页"
      >
        <div className="new-options new-options--three">
          <button
            className="new-option"
            onClick={() => {
              setNewOpen(false);
              onNavigate('video');
            }}
          >
            <span className="new-option__icon">
              <Icon name="video" size={18} />
            </span>
            <span className="new-option__name">视频水印</span>
            <span className="new-option__desc">上传视频，配置文字与 Logo 水印</span>
          </button>
          <button
            className="new-option"
            onClick={() => {
              setNewOpen(false);
              onNavigate('article');
            }}
          >
            <span className="new-option__icon">
              <Icon name="doc" size={18} />
            </span>
            <span className="new-option__name">文章编写</span>
            <span className="new-option__desc">填需求与关键词，生成分节文章</span>
          </button>
          <button
            className="new-option"
            onClick={() => {
              setNewOpen(false);
              onNavigate('prompt');
            }}
          >
            <span className="new-option__icon">
              <Icon name="wand" size={18} />
            </span>
            <span className="new-option__name">生图提示词</span>
            <span className="new-option__desc">一段需求扩写成四节提示词</span>
          </button>
        </div>
      </Modal>
    </div>
  );
}
