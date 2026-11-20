/** 素材库：类型分类 + 来源筛选（上传 / 任务产出 / 草稿），支持批量下载与删除。 */
import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon';
import { Confirm, Empty, Modal } from '../components/ui';
import { api, assetUrl, ApiError, downloadAsset, saveBlob } from '../lib/api';
import {
  ASSET_SOURCE,
  ASSET_SOURCE_FILTERS,
  ASSET_TYPES,
  ICON_BY_TYPE,
  TONE_BY_TYPE,
  fmtDuration,
  fmtSize,
  fmtTime,
} from '../lib/constants';
import type { PageProps } from '../lib/props';
import type { Asset, Page } from '../lib/types';

const PAGE_SIZE = 24;

const kindOf = (file: File): string => {
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('image/')) return 'image';
  return 'document';
};

interface PendingFile {
  id: string;
  file: File;
  name: string;
  size: string;
  kind: string;
}

interface Counts {
  by_type: Record<string, number>;
  storage: { used_bytes: number; quota_bytes: number; percent: number };
}

export default function AssetLibrary({ toast, intent }: PageProps) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('video');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<Asset> | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState<string[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const timerRef = useRef<number | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const [list, c] = await Promise.all([
          api.assets({
            page,
            page_size: PAGE_SIZE,
            type,
            source: sourceFilter === 'all' ? undefined : sourceFilter,
            q: query.trim() || undefined,
          }),
          api.assetCounts().catch(() => null),
        ]);
        setData(list);
        if (c) setCounts(c);
      } catch (err) {
        if (!silent) toast(err instanceof ApiError ? err.message : '素材加载失败', 'warn');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [page, type, sourceFilter, query, toast],
  );

  useEffect(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => load(), 240);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, sourceFilter, query, page]);

  /* 深度链接：任务中心「在素材库查看」/ 草稿条目 */
  useEffect(() => {
    if (!intent) return;
    if (intent.action === 'upload') setUploadOpen(true);
    if (intent.action === 'download') toast('勾选素材后，点「下载所选」即可批量下载');
    if (intent.action === 'delete') toast('勾选要清理的素材，再点「删除」');
    if (intent.action === 'draft') {
      setType('document');
      setSourceFilter('draft');
      setPage(1);
      toast('已筛选出「草稿」来源的文档');
    }
    if (intent.action === 'task') {
      setType('video');
      setSourceFilter('task');
      setPage(1);
      toast('已筛选出「任务产出」的成品');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent?.ts]);

  const list = data?.items || [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  /* 切换来源：当前分类下没有该来源时自动跳到第一个有内容的分类 */
  const pickSource = async (key: string) => {
    setSourceFilter(key);
    setPage(1);
    setSelected([]);
    const has = list.some((a) => a.type === type && (key === 'all' || a.source === key));
    if (has) return;
    for (const t of ASSET_TYPES) {
      if (t.key === type) continue;
      try {
        const probe = await api.assets({
          type: t.key,
          source: key === 'all' ? undefined : key,
          page_size: 1,
        });
        if (probe.total > 0) {
          setType(t.key);
          setQuery('');
          return;
        }
      } catch {
        /* 探测失败忽略 */
      }
    }
  };

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const next: PendingFile[] = Array.from(files).map((file) => ({
      id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`,
      file,
      name: file.name,
      size: fmtSize(file.size),
      kind: kindOf(file),
    }));
    setPending((p) => [...p, ...next]);
  };

  const doUpload = async () => {
    if (!pending.length) {
      toast('请先选择要上传的文件', 'warn');
      return;
    }
    setUploading(true);
    try {
      const { items } = await api.upload(pending.map((p) => p.file));
      setPending([]);
      setUploadOpen(false);
      const first = items[0];
      if (first && first.type !== type) {
        setType(first.type);
        setSourceFilter('all');
        setQuery('');
      }
      setPage(1);
      await load(true);
      toast(`已上传 ${items.length} 个素材`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '上传失败', 'warn');
    } finally {
      setUploading(false);
    }
  };

  const downloadOne = async (a: Asset) => {
    try {
      await downloadAsset(a.id, `${a.name}.${(a.ext || 'bin').toLowerCase()}`);
      toast(`已开始下载「${a.name}」`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '下载失败', 'warn');
    }
  };

  const downloadSelected = async () => {
    if (!selected.length) return;
    try {
      const blob = await api.batchDownload(selected);
      saveBlob(blob, `assets-${Date.now()}.zip`);
      toast(`已打包下载 ${selected.length} 个素材`);
      setSelected([]);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '打包下载失败', 'warn');
    }
  };

  const removeOne = async (a: Asset) => {
    try {
      await api.deleteAsset(a.id);
      setSelected((s) => s.filter((x) => x !== a.id));
      await load(true);
      toast(`已删除「${a.name}」`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '删除失败', 'warn');
    }
  };

  const removeSelected = async () => {
    try {
      const { deleted } = await api.batchDelete(selected);
      setSelected([]);
      setConfirmOpen(false);
      await load(true);
      toast(`已删除 ${deleted} 个素材`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '删除失败', 'warn');
    }
  };

  const thumbOf = (a: Asset) => {
    if (a.type === 'image') return assetUrl(a.thumbnail_url || a.download_url);
    if (a.type === 'video' && a.thumbnail_url) return assetUrl(a.thumbnail_url);
    return '';
  };

  const storage = counts?.storage;
  const srcKey = sourceFilter === 'all' ? '' : sourceFilter;

  return (
    <div className="page">
      <header className="head">
        <div>
          <h1 className="head__title">素材库</h1>
          <div className="head__sub">统一管理上传素材、任务产出与草稿文件，供视频水印与内容编写引用</div>
        </div>
        <div className="head__actions">
          <button className="btn btn--primary" onClick={() => setUploadOpen(true)}>
            <Icon name="upload" size={16} stroke={1.9} />
            上传素材
          </button>
        </div>
      </header>

      <div className="toolbar">
        <div className="toolbar__left">
          <div className="toolbar__search">
            <Icon name="search" size={15} stroke={1.9} />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="搜索素材名称或扩展名…"
            />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {ASSET_TYPES.map((t) => (
              <button
                key={t.key}
                className={`chip${type === t.key ? ' is-active' : ''}`}
                onClick={() => {
                  setType(t.key);
                  setPage(1);
                  setSelected([]);
                }}
              >
                {t.label}
                <span className="chip__count">{counts?.by_type?.[t.key] || 0}</span>
              </button>
            ))}
          </div>
          <span className="toolbar__sep" />
          <div className="srcfilter">
            {ASSET_SOURCE_FILTERS.map((s) => (
              <button
                key={s.key}
                className={`srcfilter__item${sourceFilter === s.key ? ' is-active' : ''}`}
                onClick={() => pickSource(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div className="toolbar__right">
          <button className="tool-btn" disabled={!selected.length} onClick={downloadSelected}>
            <Icon name="download" size={15} stroke={1.9} />
            下载所选{selected.length ? ` (${selected.length})` : ''}
          </button>
          <button
            className="tool-btn tool-btn--danger"
            disabled={!selected.length}
            onClick={() => setConfirmOpen(true)}
          >
            <Icon name="trash" size={15} stroke={1.8} />
            删除
          </button>
        </div>
      </div>

      {loading && !data ? (
        <div className="grid">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div className="asset" key={i}>
              <div className="asset__thumb" style={{ height: 150 }}>
                <span className="skeleton" style={{ width: '100%', height: '100%' }} />
              </div>
              <div className="asset__name">
                <span className="skeleton" style={{ width: '70%', height: 12 }} />
              </div>
            </div>
          ))}
        </div>
      ) : list.length ? (
        <>
          <div className="grid">
            {list.map((a) => {
              const isSelected = selected.includes(a.id);
              const thumb = thumbOf(a);
              return (
                <div
                  key={a.id}
                  className={`asset${isSelected ? ' is-selected' : ''}`}
                  onClick={() => toggle(a.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggle(a.id);
                    }
                  }}
                >
                  <div className={`asset__thumb${thumb ? '' : ` ${TONE_BY_TYPE[a.type] || 'g2'}`}`}>
                    {thumb ? (
                      <img src={thumb} alt={a.name} />
                    ) : (
                      <div className="asset__thumb-center">
                        <Icon
                          name={ICON_BY_TYPE[a.type] || 'doc'}
                          size={40}
                          stroke={1.3}
                          style={a.type === 'video' ? { color: 'rgba(255,255,255,0.62)' } : undefined}
                        />
                      </div>
                    )}
                    <span className="asset__kind">{(a.ext || 'FILE').toUpperCase()}</span>
                    {a.source && a.source !== 'upload' ? (
                      <span className={`asset__src asset__src--${a.source}`}>
                        {ASSET_SOURCE[a.source]?.label || a.source}
                      </span>
                    ) : null}
                    {a.type === 'video' && a.duration_seconds ? (
                      <span className="asset__dur num">{fmtDuration(a.duration_seconds)}</span>
                    ) : null}
                    <span className="asset__check">
                      <Icon name="check" size={13} stroke={2.6} />
                    </span>
                    <span className="asset__hover" onClick={(e) => e.stopPropagation()}>
                      <button className="icon-btn" title="下载" onClick={() => downloadOne(a)}>
                        <Icon name="download" size={14} stroke={1.9} />
                      </button>
                      <button
                        className="icon-btn icon-btn--danger"
                        title="删除"
                        onClick={() => removeOne(a)}
                      >
                        <Icon name="trash" size={14} stroke={1.8} />
                      </button>
                    </span>
                  </div>
                  <div className="asset__name">{a.name}</div>
                  <div className="asset__meta">
                    {(a.ext || '—').toUpperCase()} · {fmtSize(a.size_bytes)} · {fmtTime(a.created_at)}
                  </div>
                </div>
              );
            })}
          </div>
          {totalPages > 1 ? (
            <div className="pager">
              <button
                className="btn btn--ghost btn--sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                上一页
              </button>
              <span className="hint num">
                {page} / {totalPages} · 共 {data?.total} 个
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
        </>
      ) : (
        <Empty
          icon="folder"
          title="没有找到匹配的素材"
          sub={
            srcKey && (counts?.by_type?.[type] || 0) > 0
              ? `当前分类下没有「${ASSET_SOURCE[srcKey]?.label}」来源的素材，可切换分类或来源`
              : '试试换一个关键词，或切换素材类型'
          }
        >
          <button className="btn btn--ghost btn--sm" onClick={() => setUploadOpen(true)}>
            上传第一个素材
          </button>
        </Empty>
      )}

      <div className="storage">
        <div>
          <div className="storage__label">存储用量</div>
          <div className="storage__value">
            {storage ? fmtSize(storage.used_bytes) : '—'} /{' '}
            {storage ? fmtSize(storage.quota_bytes) : '—'}
          </div>
        </div>
        <div className="storage__right">
          <div className="storage__track">
            <div
              className="storage__fill"
              style={{ width: `${Math.min(100, storage?.percent || 0)}%` }}
            />
          </div>
          <span className="storage__pct">{Math.round(storage?.percent || 0)}%</span>
        </div>
      </div>

      <Modal
        open={uploadOpen}
        onClose={() => {
          setUploadOpen(false);
          setPending([]);
        }}
        title="上传素材"
        sub="支持视频、图片与文档；上传后按类型自动分类，可被任务引用"
        footer={
          <>
            <button
              className="btn btn--ghost"
              onClick={() => {
                setUploadOpen(false);
                setPending([]);
              }}
            >
              取消
            </button>
            <button className="btn btn--primary" onClick={doUpload} disabled={uploading}>
              {uploading ? '上传中…' : `上传${pending.length ? ` ${pending.length} 个文件` : ''}`}
            </button>
          </>
        }
      >
        <div
          className={`dropzone${dragging ? ' is-over' : ''}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            addFiles(e.dataTransfer.files);
          }}
        >
          <div className="dropzone__icon">
            <Icon name="upload2" size={20} stroke={1.9} />
          </div>
          <div className="dropzone__title">点击选择文件，或直接拖拽到这里</div>
          <div className="dropzone__sub">MP4 / MOV / MKV / PNG / JPG / DOCX / XLSX / PDF</div>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".mp4,.mov,.mkv,.avi,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.pdf,.txt,.md"
            hidden
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>

        {pending.length ? (
          <div className="pick-list">
            {pending.map((p) => (
              <div className="pick" key={p.id}>
                <Icon
                  name={ICON_BY_TYPE[p.kind]}
                  size={14}
                  style={{ color: p.kind === 'image' ? '#8a6fbf' : '#7fc9bd' }}
                />
                <span className="pick__name">{p.name}</span>
                <span className="pick__size">{p.size}</span>
                <button
                  className="pick__x"
                  onClick={() => setPending((l) => l.filter((x) => x.id !== p.id))}
                  aria-label="移除"
                >
                  <Icon name="close" size={12} stroke={2} />
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </Modal>

      <Confirm
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={removeSelected}
        title={`删除 ${selected.length} 个素材？`}
        sub="删除后不可恢复，已引用这些素材的内容会显示为空"
        confirmText="确认删除"
        list={list
          .filter((a) => selected.includes(a.id))
          .map((a) => ({ id: a.id, name: a.name, size: fmtSize(a.size_bytes) }))}
      />
    </div>
  );
}
