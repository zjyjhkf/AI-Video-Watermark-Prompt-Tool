import React, { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Confirm, Modal } from '../components/ui.jsx';
import { ASSET_SOURCE, ASSET_SOURCE_FILTERS, ASSET_TYPES, storage } from '../data/mock.js';

const ICON_BY_TYPE = { video: 'film', image: 'image', document: 'doc' };

const typeOf = (file) => {
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('image/')) return 'image';
  return 'document';
};

const sizeOf = (bytes) => {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

const TONE = { video: 'g3', image: 'g5', document: 'g2' };

export default function AssetLibrary({ assets, setAssets, toast, intent }) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('video');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [selected, setSelected] = useState([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [pending, setPending] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!intent) return;
    if (intent.action === 'upload') setUploadOpen(true);
    if (intent.action === 'download') toast('勾选素材后，点「下载所选」即可批量下载');
    if (intent.action === 'delete') toast('勾选要清理的素材，再点「删除」');
    if (intent.action === 'draft') {
      setType('document');
      setSourceFilter('draft');
      toast('已筛选出「草稿」来源的文档');
    }
    if (intent.action === 'task') {
      setType('video');
      setSourceFilter('task');
      toast('已筛选出「任务产出」的成品');
    }
  }, [intent && intent.ts]);

  const counts = useMemo(() => {
    const map = {};
    assets.forEach((a) => {
      map[a.type] = (map[a.type] || 0) + 1;
    });
    return map;
  }, [assets]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets.filter((a) => {
      const okType = a.type === type;
      const okSource = sourceFilter === 'all' || a.source === sourceFilter;
      const okQuery = !q || a.name.toLowerCase().includes(q) || a.ext.toLowerCase().includes(q);
      return okType && okSource && okQuery;
    });
  }, [assets, query, type, sourceFilter]);

  const toggle = (id) => {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const addFiles = (files) => {
    const next = Array.from(files).map((file) => ({
      id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`,
      file,
      name: file.name,
      size: sizeOf(file.size),
      kind: typeOf(file),
    }));
    setPending((p) => [...p, ...next]);
  };

  const confirmUpload = () => {
    if (!pending.length) {
      toast('请先选择要上传的文件', 'warn');
      return;
    }
    const created = pending.map((p) => {
      const kind = p.kind;
      return {
        id: `up-${p.id}`,
        name: p.name.replace(/\.[^.]+$/, ''),
        type: kind,
        ext: (p.name.split('.').pop() || 'FILE').toUpperCase(),
        size: p.size,
        time: '刚刚',
        folder: '未分类',
        source: 'upload',
        img: kind === 'image' ? URL.createObjectURL(p.file) : null,
        tone: TONE[kind],
        icon: ICON_BY_TYPE[kind],
        iconColor: kind === 'video' ? 'rgba(255,255,255,0.62)' : undefined,
        resolution: kind === 'video' ? '1920 × 1080' : undefined,
        duration: kind === 'video' ? '00:30' : undefined,
      };
    });
    setAssets((prev) => [...created, ...prev]);
    if (created.length && created[0].type !== type) {
      setType(created[0].type);
      setQuery('');
    }
    setPending([]);
    setUploadOpen(false);
    toast(`已上传 ${created.length} 个素材`);
  };

  const downloadSelected = () => {
    const picked = assets.filter((a) => selected.includes(a.id));
    if (!picked.length) return;
    picked.forEach((a) => downloadOne(a));
    setSelected([]);
  };

  const removeSelected = () => {
    const picked = assets.filter((a) => selected.includes(a.id));
    setAssets((prev) => prev.filter((a) => !selected.includes(a.id)));
    setSelected([]);
    setConfirmOpen(false);
    toast(`已删除 ${picked.length} 个素材`);
  };

  const removeOne = (asset) => {
    setAssets((prev) => prev.filter((a) => a.id !== asset.id));
    setSelected((s) => s.filter((x) => x !== asset.id));
    toast(`已删除「${asset.name}」`);
  };

  const downloadOne = (a) => {
    if (a.content) {
      const blob = new Blob([a.content], { type: 'text/markdown;charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${a.name}.${(a.ext || 'md').toLowerCase()}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 2000);
      toast(`已下载草稿「${a.name}」`);
      return;
    }
    if (!a.img) {
      toast('该素材为示例占位，接入后端后可下载原文件', 'warn');
      return;
    }
    const link = document.createElement('a');
    link.href = a.img;
    link.download = `${a.name}.${a.ext.toLowerCase()}`;
    link.click();
    toast(`已开始下载「${a.name}」`);
  };

  return (
    <div className="page">
      <header className="head">
        <div>
          <h1 className="head__title">素材库</h1>
          <div className="head__sub">统一管理视频、图片与文档，供视频水印与文章编写引用</div>
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
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索素材名称或扩展名…"
            />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {ASSET_TYPES.map((t) => (
              <button
                key={t.key}
                className={`chip${type === t.key ? ' is-active' : ''}`}
                onClick={() => setType(t.key)}
              >
                {t.label}
                <span className="chip__count">{counts[t.key] || 0}</span>
              </button>
            ))}
          </div>
          <span className="toolbar__sep" />
          <div className="srcfilter">
            {ASSET_SOURCE_FILTERS.map((s) => (
              <button
                key={s.key}
                className={`srcfilter__item${sourceFilter === s.key ? ' is-active' : ''}`}
                onClick={() => {
                  setSourceFilter(s.key);
                  /* 当前分类下没有该来源时，自动跳到第一个有内容的分类，避免空列表 */
                  const has = assets.some(
                    (a) => a.type === type && (s.key === 'all' || a.source === s.key)
                  );
                  if (!has) {
                    const hit = assets.find((a) => s.key === 'all' || a.source === s.key);
                    if (hit) {
                      setType(hit.type);
                      setQuery('');
                    }
                  }
                }}
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

      {list.length ? (
        <div className="grid">
          {list.map((a) => {
            const isSelected = selected.includes(a.id);
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
                <div className={`asset__thumb${a.img ? '' : ` ${a.tone || 'g2'}`}`}>
                  {a.img ? (
                    <img src={a.img} alt={a.name} />
                  ) : (
                    <div className="asset__thumb-center">
                      <Icon
                        name={a.icon || ICON_BY_TYPE[a.type] || 'doc'}
                        size={40}
                        stroke={1.3}
                        style={a.iconColor ? { color: a.iconColor } : undefined}
                      />
                    </div>
                  )}
                  <span className="asset__kind">{a.ext}</span>
                  {a.source && a.source !== 'upload' ? (
                    <span className={`asset__src asset__src--${a.source}`}>
                      {ASSET_SOURCE[a.source].label}
                    </span>
                  ) : null}
                  {a.type === 'video' && a.duration ? (
                    <span className="asset__dur num">{a.duration}</span>
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
                  {a.ext} · {a.size} · {a.time}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty">
          <Icon name="folder" size={28} stroke={1.6} style={{ color: '#b6d6cf' }} />
          <div className="empty__title">没有找到匹配的素材</div>
          <div className="empty__sub">
            {sourceFilter !== 'all' && counts[type]
              ? `当前分类下没有「${ASSET_SOURCE[sourceFilter].label}」来源的素材，可切换分类或来源`
              : '试试换一个关键词，或切换素材类型'}
          </div>
        </div>
      )}

      <div className="storage">
        <div>
          <div className="storage__label">存储用量</div>
          <div className="storage__value">
            {storage.used} {storage.unit} / {storage.total} {storage.unit}
          </div>
        </div>
        <div className="storage__right">
          <div className="storage__track">
            <div className="storage__fill" style={{ width: `${storage.pct}%` }} />
          </div>
          <span className="storage__pct">{storage.pct}%</span>
        </div>
      </div>

      <Modal
        open={uploadOpen}
        onClose={() => {
          setUploadOpen(false);
          setPending([]);
        }}
        title="上传素材"
        sub="支持视频、图片与文档；单文件 < 50MB 直传，超出走分块上传"
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
            <button className="btn btn--primary" onClick={confirmUpload}>
              上传 {pending.length ? `${pending.length} 个文件` : ''}
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
        list={assets.filter((a) => selected.includes(a.id))}
      />
    </div>
  );
}
