import React, { useEffect, useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Confirm, Empty, Modal, Pill, Select } from '../components/ui.jsx';
import { TASK_STATUS, TASK_TYPES } from '../data/mock.js';

const TABS = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待处理' },
  { key: 'processing', label: '处理中' },
  { key: 'done', label: '已完成' },
  { key: 'failed', label: '失败' },
  { key: 'canceled', label: '已取消' },
];

const TYPE_OPTIONS = [
  { key: 'all', label: '全部类型' },
  { key: 'video', label: '视频水印' },
  { key: 'article', label: '文章编写' },
  { key: 'prompt', label: '生图提示词' },
];

const metaRows = (task) => {
  const rows = [
    ['任务 ID', task.id],
    ['任务类型', TASK_TYPES[task.type].label],
    ['提交人', task.owner],
    ['处理节点', task.node || '—'],
    ['提交时间', task.createdAt],
    ['完成时间', task.finishedAt],
  ];
  if (task.detail) {
    Object.keys(task.detail).forEach((k) => {
      const labelMap = {
        asset: '源素材',
        text: '文字水印',
        logo: 'Logo 水印',
        crf: '画质 CRF',
        preset: '编码预设',
        platform: '平台',
        contentType: '内容类型',
        audience: '受众档位',
        keyword: '搜索关键词',
        strategy: '词库策略',
        requirement: '需求描述',
        refs: '参考图',
      };
      rows.push([labelMap[k] || k, String(task.detail[k])]);
    });
  }
  if (task.outputAssetId) rows.push(['产物入库', `已写入素材库 · ${task.outputAssetId}`]);
  return rows;
};

export default function TaskCenter({
  tasks,
  assets = [],
  onRetry,
  onUpdateTask,
  onDeleteTask = () => {},
  onNavigate,
  toast,
  intent,
}) {
  const [tab, setTab] = useState('all');
  const [type, setType] = useState('all');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState(null);
  const [confirmId, setConfirmId] = useState(null);

  useEffect(() => {
    if (intent && typeof intent.action === 'string' && tasks.some((t) => t.id === intent.action)) {
      setOpenId(intent.action);
    }
  }, [intent && intent.ts]);

  const counts = useMemo(() => {
    const map = { all: tasks.length };
    tasks.forEach((t) => {
      map[t.status] = (map[t.status] || 0) + 1;
    });
    return map;
  }, [tasks]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter((t) => {
      const okTab = tab === 'all' || t.status === tab;
      const okType = type === 'all' || t.type === type;
      const okQuery = !q || t.name.toLowerCase().includes(q) || t.id.toLowerCase().includes(q);
      return okTab && okType && okQuery;
    });
  }, [tasks, tab, type, query]);

  const current = tasks.find((t) => t.id === openId) || null;
  const confirmTask = tasks.find((t) => t.id === confirmId) || null;

  const assetOf = (task) =>
    task && task.outputAssetId ? assets.find((a) => a.id === task.outputAssetId) : null;

  const downloadOutput = (task) => {
    const asset = assetOf(task);
    if (!asset) {
      toast('成品素材不存在或已删除', 'warn');
      return;
    }
    if (asset.content) {
      const blob = new Blob([asset.content], { type: 'text/markdown;charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${asset.name}.${(asset.ext || 'md').toLowerCase()}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 2000);
    } else if (asset.img) {
      const link = document.createElement('a');
      link.href = asset.img;
      link.download = `${asset.name}.${(asset.ext || 'mp4').toLowerCase()}`;
      link.click();
    }
    toast(`已开始下载「${asset.name}」`);
  };

  return (
    <div className="page page--fill page--auto">
      <header className="head">
        <div>
          <h1 className="head__title">任务中心</h1>
          <div className="head__sub">
            <span className="live">
              <i />
              实时
            </span>
            统一查看排队、处理与结果，状态由后台推送更新
          </div>
        </div>
        <div className="head__actions">
          <div className="toolbar-search">
            <Icon name="search" size={15} stroke={1.9} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索任务名称或 ID…"
            />
          </div>
          <Select ariaLabel="类型筛选" value={type} onChange={setType} options={TYPE_OPTIONS} />
        </div>
      </header>

      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tabs__item${tab === t.key ? ' is-active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            <span className="tabs__count num">{counts[t.key] || 0}</span>
          </button>
        ))}
      </div>

      {list.length ? (
        <section className="task-card">
          <div className="task-head">
            <span className="task-col task-col--name">任务名称</span>
            <span className="task-col task-col--type">类型</span>
            <span className="task-col task-col--status">状态</span>
            <span className="task-col task-col--owner">提交人</span>
            <span className="task-col task-col--time">提交时间</span>
            <span className="task-col task-col--time">完成时间</span>
            <span className="task-col task-col--op">操作</span>
          </div>
          {list.map((t) => (
            <div
              className="task-row"
              key={t.id}
              onClick={() => setOpenId(t.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setOpenId(t.id);
              }}
            >
              <span className="task-col task-col--name">
                <span className="task-name">{t.name}</span>
                <span className="task-id num">{t.id}</span>
              </span>
              <span className="task-col task-col--type">
                <span
                  className="task-type"
                  style={{ background: TASK_TYPES[t.type].bg, color: TASK_TYPES[t.type].color }}
                >
                  <Icon name={TASK_TYPES[t.type].icon} size={12} stroke={1.9} />
                  {TASK_TYPES[t.type].label}
                </span>
              </span>
              <span className="task-col task-col--status">
                <Pill tone={TASK_STATUS[t.status].tone}>{TASK_STATUS[t.status].label}</Pill>
                {t.status === 'processing' && typeof t.progress === 'number' ? (
                  <span className="task-progress">
                    <i style={{ width: `${Math.round(t.progress * 100)}%` }} />
                    <span className="task-progress__pct num">
                      {Math.round(t.progress * 100)}%
                    </span>
                  </span>
                ) : null}
                {t.status === 'done' && t.type === 'video' && t.outputAssetId ? (
                  <span className="task-stored">已入库</span>
                ) : null}
              </span>
              <span className="task-col task-col--owner">{t.owner}</span>
              <span className="task-col task-col--time num">{t.createdAt}</span>
              <span className="task-col task-col--time num">{t.finishedAt}</span>
              <span className="task-col task-col--op" onClick={(e) => e.stopPropagation()}>
                {t.status === 'failed' || t.status === 'canceled' ? (
                  <button className="link" onClick={() => onRetry(t.id)}>
                    重试
                  </button>
                ) : null}
                <button className="icon-btn icon-btn--plain" onClick={() => setOpenId(t.id)} aria-label="查看详情">
                  <Icon name="chevronRight" size={14} stroke={2} />
                </button>
              </span>
            </div>
          ))}
        </section>
      ) : (
        <Empty
          icon="list"
          title="没有符合条件的任务"
          sub="切换状态标签、类型筛选，或清空搜索关键词"
        />
      )}

      <Modal
        open={!!current}
        onClose={() => setOpenId(null)}
        title={current ? current.name : ''}
        sub={current ? `${current.id} · 提交于 ${current.createdAt}` : ''}
        width={760}
        footer={
          current ? (
            <>
              <button
                className="btn btn--danger btn--sm"
                onClick={() => {
                  setConfirmId(current.id);
                  setOpenId(null);
                }}
              >
                删除任务
              </button>
              <span className="modal__spacer" />
              {current.status === 'failed' || current.status === 'canceled' ? (
                <button
                  className="btn btn--primary btn--sm"
                  onClick={() => {
                    onRetry(current.id);
                    setOpenId(null);
                  }}
                >
                  <Icon name="refresh" size={14} stroke={1.9} />
                  重试
                </button>
              ) : null}
              {current.status === 'pending' || current.status === 'processing' ? (
                <button
                  className="btn btn--ghost btn--sm"
                  onClick={() => {
                    onUpdateTask(current.id, {
                      status: 'canceled',
                      finishedAt: '刚刚',
                      progress: 0,
                    });
                    toast('任务已取消');
                    setOpenId(null);
                  }}
                >
                  取消任务
                </button>
              ) : null}
              {current.status === 'done' && current.type === 'video' ? (
                <>
                  <button
                    className="btn btn--ghost btn--sm"
                    onClick={() => {
                      setOpenId(null);
                      onNavigate('assets', 'task');
                    }}
                  >
                    <Icon name="folder" size={14} stroke={1.9} />
                    在素材库查看
                  </button>
                  <button className="btn btn--primary btn--sm" onClick={() => downloadOutput(current)}>
                    <Icon name="download" size={14} stroke={1.9} />
                    下载成品
                  </button>
                </>
              ) : null}
              <button className="btn btn--ghost btn--sm" onClick={() => setOpenId(null)}>
                关闭
              </button>
            </>
          ) : null
        }
      >
        {current ? (
          <div className="task-detail">
            <div className="task-detail__status">
              <Pill tone={TASK_STATUS[current.status].tone}>
                {TASK_STATUS[current.status].label}
              </Pill>
              {current.status === 'processing' ? (
                <span className="task-detail__progress">
                  进度 {Math.round((current.progress || 0) * 100)}% · 节点 {current.node}
                </span>
              ) : null}
            </div>

            <div className="kv">
              {metaRows(current).map(([k, v]) => (
                <div className="kv__row" key={k}>
                  <span className="kv__k">{k}</span>
                  <span className="kv__v">{v}</span>
                </div>
              ))}
            </div>

            {current.error ? (
              <div className="alert-box">
                <div className="alert-box__title">
                  <Icon name="alert" size={14} stroke={1.9} />
                  失败原因
                </div>
                <div className="alert-box__text">{current.error}</div>
              </div>
            ) : null}

            {current.status === 'done' && current.result ? (
              <div className="result-box">
                <div className="result-box__title">处理结果</div>
                {current.type === 'video' ? (
                  <div className="result-file">
                    <span className="result-file__icon">
                      <Icon name="film" size={18} stroke={1.7} />
                    </span>
                    <div className="result-file__main">
                      <div className="result-file__name">{current.result.outputName}</div>
                      <div className="result-file__meta">
                        {current.result.outputSize} · {current.result.duration}
                      </div>
                    </div>
                    <button className="btn btn--ghost btn--sm" onClick={() => downloadOutput(current)}>
                      下载
                    </button>
                  </div>
                ) : null}

                {current.type === 'article' && current.result.article ? (
                  <div className="result-article">
                    <div className="result-article__title">{current.result.article.title}</div>
                    <p className="result-article__body">
                      {current.result.article.body.slice(0, 160)}…
                    </p>
                    <div className="tags tags--sm">
                      {current.result.article.tags.slice(0, 6).map((t) => (
                        <span className="tag" key={t}>
                          {t}
                        </span>
                      ))}
                    </div>
                    <button
                      className="link"
                      onClick={() => {
                        setOpenId(null);
                        onNavigate('article');
                      }}
                    >
                      进入文章编写查看完整结果
                    </button>
                  </div>
                ) : null}

                {current.type === 'prompt' && current.result.promptText ? (
                  <div className="result-prompt">
                    <p className="prompt-en prompt-en--sm">{current.result.promptText}</p>
                    <button
                      className="link"
                      onClick={() => {
                        setOpenId(null);
                        onNavigate('prompt');
                      }}
                    >
                      进入生图提示词查看四节结果
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Confirm
        open={!!confirmTask}
        onClose={() => setConfirmId(null)}
        onConfirm={() => {
          if (confirmTask) onDeleteTask(confirmTask.id);
          setConfirmId(null);
          toast('任务已删除');
        }}
        title="删除任务"
        sub="任务记录与结果将被删除，已产出的素材会保留在素材库"
        confirmText="确认删除"
        list={confirmTask ? [{ id: confirmTask.id, name: confirmTask.name, size: confirmTask.id }] : []}
      />
    </div>
  );
}
