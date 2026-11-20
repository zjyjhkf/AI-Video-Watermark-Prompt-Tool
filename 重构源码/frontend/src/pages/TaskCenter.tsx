/** 任务中心：状态分桶 + 进度 + 产物入库；详情走 SSE 实时推送，断流回退轮询。 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../components/Icon';
import { Confirm, Empty, Modal, Pill, Select } from '../components/ui';
import { api, ApiError, downloadAsset, saveBlob, watchTask } from '../lib/api';
import { TASK_STATUS, TASK_TYPES, fmtDuration, fmtSize, fmtTime } from '../lib/constants';
import type { PageProps } from '../lib/props';
import type { ArticleResult, PromptResult, Task, TaskPage, VideoResult } from '../lib/types';

const TABS = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待处理' },
  { key: 'processing', label: '处理中' },
  { key: 'done', label: '已完成' },
  { key: 'failed', label: '失败' },
  { key: 'canceled', label: '已取消' },
];

const TYPE_OPTIONS = [
  { key: 'all', value: 'all', label: '全部类型' },
  { key: 'video', value: 'video', label: '视频水印' },
  { key: 'article', value: 'article', label: '文章编写' },
  { key: 'prompt', value: 'prompt', label: '生图提示词' },
];

const PAGE_SIZE = 20;

export default function TaskCenter({ navigate, toast, intent }: PageProps) {
  const [tab, setTab] = useState('all');
  const [type, setType] = useState('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<TaskPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Task | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const timerRef = useRef<number | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const res = await api.tasks({
          page,
          page_size: PAGE_SIZE,
          status: tab === 'all' ? undefined : tab,
          task_type: type === 'all' ? undefined : type,
          q: query.trim() || undefined,
        });
        setData(res);
      } catch (err) {
        if (!silent) toast(err instanceof ApiError ? err.message : '任务列表加载失败', 'warn');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [page, tab, type, query, toast],
  );

  /* 筛选变化：300ms 防抖后请求 */
  useEffect(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => load(false), 260);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, type, query, page]);

  const counts = data?.counts || {};
  const list = data?.items || [];
  const activeCount = (counts.pending || 0) + (counts.processing || 0);

  /* 有在跑的任务时 3s 轮询；否则不打扰 */
  useEffect(() => {
    if (!activeCount) return;
    const t = window.setInterval(() => load(true), 3000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCount, tab, type, query, page]);

  /* 详情：拉一次 + SSE 追踪 */
  const refreshDetail = useCallback(
    async (id: string) => {
      try {
        setDetail(await api.task(id));
      } catch {
        /* 忽略 */
      }
    },
    [],
  );

  useEffect(() => {
    if (!openId) {
      setDetail(null);
      return;
    }
    refreshDetail(openId);
    const close = watchTask(openId, (s) => {
      setDetail((cur) =>
        cur && cur.id === openId
          ? { ...cur, status: s.status as Task['status'], progress: Math.round((s.progress || 0) * 100) }
          : cur,
      );
      if (s.status === 'done' || s.status === 'failed' || s.status === 'canceled') {
        refreshDetail(openId);
        load(true);
      }
    });
    return close;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

  /* 从视频页跳转：直接打开对应任务 */
  useEffect(() => {
    if (intent && typeof intent.action === 'string') setOpenId(intent.action);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent?.ts]);

  const current = detail || list.find((t) => t.id === openId) || null;
  const confirmTask = list.find((t) => t.id === confirmId) || (detail?.id === confirmId ? detail : null);

  const videoResult = (t: Task | null): VideoResult | null =>
    t && t.task_type === 'video' ? (t.result as VideoResult) : null;
  const articleResult = (t: Task | null): ArticleResult['article'] | null =>
    t && t.task_type === 'article' && t.result
      ? (t.result as ArticleResult).article
      : null;
  const promptResult = (t: Task | null): PromptResult | null =>
    t && t.task_type === 'prompt' ? (t.result as PromptResult) : null;

  const downloadOutput = async (t: Task) => {
    const assetId = t.output_asset_id || videoResult(t)?.output_asset_id;
    if (!assetId) {
      toast('该任务没有可下载的产物', 'warn');
      return;
    }
    try {
      await downloadAsset(assetId, t.name.replace(/[\\/:*?"<>|]/g, '_'));
      toast('已开始下载成品');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '下载失败', 'warn');
    }
  };

  const downloadText = (name: string, text: string, ext = 'md') => {
    saveBlob(new Blob([text], { type: 'text/markdown;charset=utf-8' }), `${name}.${ext}`);
    toast('已开始下载');
  };

  const retry = async (id: string) => {
    try {
      await api.retryTask(id);
      toast('已重新提交');
      setOpenId(null);
      load(true);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '重试失败', 'warn');
    }
  };

  const cancel = async (id: string) => {
    try {
      await api.cancelTask(id);
      toast('任务已取消');
      setOpenId(null);
      load(true);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '取消失败', 'warn');
    }
  };

  const remove = async (id: string) => {
    try {
      await api.deleteTask(id);
      toast('任务已删除，已产出素材保留在素材库');
      setConfirmId(null);
      setOpenId(null);
      load(true);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '删除失败', 'warn');
    }
  };

  const detailRows = useMemo<[string, string][]>(() => {
    if (!current) return [];
    const rows: [string, string][] = [
      ['任务 ID', current.id],
      ['任务类型', TASK_TYPES[current.task_type]?.label || current.task_type],
      ['提交人', current.created_by_name || current.created_by],
      ['处理节点', current.node || '—'],
      ['提交时间', fmtTime(current.created_at)],
      ['完成时间', fmtTime(current.finished_at)],
    ];
    Object.entries(current.detail || {}).forEach(([k, v]) => rows.push([k, String(v)]));
    if (current.output_asset_id) rows.push(['产物入库', `已写入素材库 · ${current.output_asset_id}`]);
    return rows;
  }, [current]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const art = articleResult(current);
  const pr = promptResult(current);
  const vr = videoResult(current);

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
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="搜索任务名称或 ID…"
            />
          </div>
          <Select
            ariaLabel="类型筛选"
            value={type}
            onChange={(v) => {
              setType(v);
              setPage(1);
            }}
            options={TYPE_OPTIONS}
          />
        </div>
      </header>

      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tabs__item${tab === t.key ? ' is-active' : ''}`}
            onClick={() => {
              setTab(t.key);
              setPage(1);
            }}
          >
            {t.label}
            <span className="tabs__count num">{counts[t.key] || 0}</span>
          </button>
        ))}
      </div>

      {loading && !data ? (
        <section className="task-card">
          {[0, 1, 2, 3].map((i) => (
            <div className="task-row" key={i}>
              <span className="skeleton" style={{ height: 14, flex: 1 }} />
            </div>
          ))}
        </section>
      ) : list.length ? (
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
          {list.map((t) => {
            const meta = TASK_TYPES[t.task_type] || TASK_TYPES.video;
            const st = TASK_STATUS[t.status] || TASK_STATUS.pending;
            return (
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
                  <span className="task-type" style={{ background: meta.bg, color: meta.color }}>
                    <Icon name={meta.icon} size={12} stroke={1.9} />
                    {meta.label}
                  </span>
                </span>
                <span className="task-col task-col--status">
                  <Pill tone={st.tone}>{st.label}</Pill>
                  {t.status === 'processing' ? (
                    <span className="task-progress">
                      <i style={{ width: `${Math.min(100, t.progress)}%` }} />
                      <span className="task-progress__pct num">{Math.min(100, t.progress)}%</span>
                    </span>
                  ) : null}
                  {t.status === 'done' && t.save_to_assets && t.output_asset_id ? (
                    <span className="task-stored">已入库</span>
                  ) : null}
                </span>
                <span className="task-col task-col--owner">{t.created_by_name || '—'}</span>
                <span className="task-col task-col--time num">{fmtTime(t.created_at)}</span>
                <span className="task-col task-col--time num">{fmtTime(t.finished_at)}</span>
                <span className="task-col task-col--op" onClick={(e) => e.stopPropagation()}>
                  {t.status === 'failed' || t.status === 'canceled' ? (
                    <button className="link" onClick={() => retry(t.id)}>
                      重试
                    </button>
                  ) : null}
                  <button
                    className="icon-btn icon-btn--plain"
                    onClick={() => setOpenId(t.id)}
                    aria-label="查看详情"
                  >
                    <Icon name="chevronRight" size={14} stroke={2} />
                  </button>
                </span>
              </div>
            );
          })}
          {totalPages > 1 ? (
            <div className="pager">
              <button className="btn btn--ghost btn--sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                上一页
              </button>
              <span className="hint num">
                {page} / {totalPages} · 共 {data?.total} 条
              </span>
              <button
                className="btn btn--ghost btn--sm"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                下一页
              </button>
            </div>
          ) : null}
        </section>
      ) : (
        <Empty icon="list" title="没有符合条件的任务" sub="切换状态标签、类型筛选，或清空搜索关键词">
          <button className="btn btn--ghost btn--sm" onClick={() => navigate('video')}>
            去创建视频水印任务
          </button>
        </Empty>
      )}

      <Modal
        open={!!openId && !!current}
        onClose={() => setOpenId(null)}
        title={current ? current.name : ''}
        sub={current ? `${current.id} · 提交于 ${fmtTime(current.created_at)}` : ''}
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
                <button className="btn btn--primary btn--sm" onClick={() => retry(current.id)}>
                  <Icon name="refresh" size={14} stroke={1.9} />
                  重试
                </button>
              ) : null}
              {current.status === 'pending' || current.status === 'processing' ? (
                <button className="btn btn--ghost btn--sm" onClick={() => cancel(current.id)}>
                  取消任务
                </button>
              ) : null}
              {current.status === 'done' && current.output_asset_id ? (
                <>
                  <button
                    className="btn btn--ghost btn--sm"
                    onClick={() => {
                      setOpenId(null);
                      navigate('assets', 'task');
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
              <Pill tone={(TASK_STATUS[current.status] || TASK_STATUS.pending).tone}>
                {(TASK_STATUS[current.status] || TASK_STATUS.pending).label}
              </Pill>
              {current.status === 'processing' ? (
                <span className="task-detail__progress">
                  进度 {current.progress}% · 节点 {current.node || '渲染中'}
                </span>
              ) : null}
              {current.status === 'done' && current.output_asset_id ? (
                <span className="task-stored">产物已入库 · {current.output_asset_id}</span>
              ) : null}
            </div>

            {current.status === 'processing' ? (
              <div className="task-progress task-progress--lg">
                <i style={{ width: `${Math.min(100, current.progress)}%` }} />
              </div>
            ) : null}

            <div className="kv">
              {detailRows.map(([k, v]) => (
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

                {vr ? (
                  <div className="result-file">
                    <span className="result-file__icon">
                      <Icon name="film" size={18} stroke={1.7} />
                    </span>
                    <div className="result-file__main">
                      <div className="result-file__name">{vr.output_name || current.name}</div>
                      <div className="result-file__meta">
                        {vr.output_size_bytes ? fmtSize(vr.output_size_bytes) : '—'} ·{' '}
                        {fmtDuration(vr.duration_seconds)}
                        {vr.engine ? ` · 引擎 ${vr.engine}` : ''}
                      </div>
                      {vr.note ? <div className="result-file__note">{vr.note}</div> : null}
                    </div>
                    <button className="btn btn--ghost btn--sm" onClick={() => downloadOutput(current)}>
                      下载
                    </button>
                  </div>
                ) : null}

                {art ? (
                  <div className="result-article">
                    <div className="result-article__title">{art.title}</div>
                    <p className="result-article__body">{(art.body || '').slice(0, 160)}…</p>
                    <div className="tags tags--sm">
                      {(art.tags || []).slice(0, 6).map((t) => (
                        <span className="tag" key={t}>
                          {t}
                        </span>
                      ))}
                    </div>
                    <button
                      className="link"
                      onClick={() =>
                        downloadText(
                          art.title || current.name,
                          `# ${art.title}\n\n${art.body}\n\n${(art.tags || []).map((t) => `#${t}`).join(' ')}`,
                        )
                      }
                    >
                      下载 Markdown
                    </button>
                  </div>
                ) : null}

                {pr ? (
                  <div className="result-prompt">
                    <p className="prompt-en prompt-en--sm">{pr.prompt_text}</p>
                    <button
                      className="link"
                      onClick={() => downloadText(current.name, pr.prompt_text || '', 'txt')}
                    >
                      下载提示词
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
          if (confirmTask) remove(confirmTask.id);
        }}
        title="删除任务"
        sub="任务记录与结果将被删除，已产出的素材会保留在素材库"
        confirmText="确认删除"
        list={confirmTask ? [{ id: confirmTask.id, name: confirmTask.name, size: confirmTask.id }] : []}
      />
    </div>
  );
}
