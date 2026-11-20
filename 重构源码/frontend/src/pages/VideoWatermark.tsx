/** 视频水印：本地导入 → 参数配置 → 保存方案（模板）/ 保存到素材库（走任务队列渲染）。 */
import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../components/Icon';
import { Field, Modal, Seg, Select, Switch } from '../components/ui';
import { api, assetUrl, ApiError } from '../lib/api';
import {
  DEFAULT_WATERMARK,
  ENCODE_PRESETS,
  POSITIONS,
  SWATCHES,
  VIDEO_ACCEPT,
  VIDEO_MAX_BYTES,
  fmtDuration,
  fmtSize,
  positionLabel,
  type WatermarkConfig,
} from '../lib/constants';
import type { PageProps } from '../lib/props';
import type { Asset, WatermarkPreset } from '../lib/types';

const fmtClock = (sec: number) => {
  const s = Math.max(0, Math.round(sec || 0));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/** 九宫格锚点 → 绝对定位样式（预览叠加层用） */
function anchorStyle(pos: string, margin: number): React.CSSProperties {
  const parts = String(pos).split('_');
  let h = 'center';
  let v = 'middle';
  if (pos !== 'center') {
    parts.forEach((p) => {
      if (p === 'left' || p === 'right') h = p;
      if (p === 'top' || p === 'bottom') v = p;
    });
  }
  const style: React.CSSProperties = {};
  style.left = h === 'left' ? margin : h === 'right' ? 'auto' : '50%';
  if (h === 'right') style.right = margin;
  style.top = v === 'top' ? margin : v === 'bottom' ? 'auto' : '50%';
  if (v === 'bottom') style.bottom = margin;
  const tx = h === 'center' ? '-50%' : '0';
  const ty = v === 'middle' ? '-50%' : '0';
  if (tx !== '0' || ty !== '0') style.transform = `translate(${tx}, ${ty})`;
  return style;
}

function PositionPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="pospick" role="group" aria-label="水印位置">
      {POSITIONS.map((p) => (
        <button
          key={p.key}
          type="button"
          className={`pospick__cell${value === p.key ? ' is-active' : ''}`}
          onClick={() => onChange(p.key)}
          title={p.label}
          aria-label={p.label}
          aria-pressed={value === p.key}
        >
          <i />
        </button>
      ))}
    </div>
  );
}

interface LocalVideo {
  file: File;
  name: string;
  ext: string;
  sizeText: string;
  duration: number;
  resolution: string;
  src: string;
}

export default function VideoWatermark({ toast, navigate }: PageProps) {
  const [videos, setVideos] = useState<Asset[]>([]);
  const [images, setImages] = useState<Asset[]>([]);
  const [presets, setPresets] = useState<WatermarkPreset[]>([]);
  const [presetId, setPresetId] = useState('');

  const [assetId, setAssetId] = useState('');
  const [local, setLocal] = useState<LocalVideo | null>(null);
  const [importing, setImporting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);

  const [wm, setWm] = useState<WatermarkConfig>(DEFAULT_WATERMARK);
  const [logoPreview, setLogoPreview] = useState('');
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [stageW, setStageW] = useState(760);
  const [flash, setFlash] = useState(false);
  const [advOpen, setAdvOpen] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState('');
  const [engine, setEngine] = useState<string | null>(null);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const logoRef = useRef<HTMLInputElement | null>(null);

  /* ---------- 初始化：素材 / 方案 / 默认水印 ---------- */
  const loadPresets = async () => {
    const list = await api.presets().catch(() => [] as WatermarkPreset[]);
    setPresets(list);
    const def = list.find((p) => p.is_default) || list[0];
    if (def) {
      setPresetId(def.id);
      setWm({ ...DEFAULT_WATERMARK, ...def.config });
      if (def.config.logo_asset_id) setLogoPreview('');
    }
  };

  useEffect(() => {
    Promise.all([
      api.assets({ type: 'video', page_size: 100 }).catch(() => ({ items: [] as Asset[] })),
      api.assets({ type: 'image', page_size: 100 }).catch(() => ({ items: [] as Asset[] })),
    ]).then(([v, i]) => {
      setVideos(v.items);
      setImages(i.items);
    });
    loadPresets();
    api
      .health()
      .then((h) => setEngine(h.render_engine))
      .catch(() => setEngine(null));
  }, []);

  const hasSource = !!local || !!assetId;
  const asset = useMemo(() => videos.find((a) => a.id === assetId), [videos, assetId]);

  const total = local ? local.duration : asset?.duration_seconds || 0;
  const safeTotal = total > 0 ? total : 30;
  const resolutionText = local
    ? local.resolution
    : asset
      ? `${asset.width || 0} × ${asset.height || 0}`
      : '1920 × 1080';
  const sizeText = local ? local.sizeText : asset ? fmtSize(asset.size_bytes) : '—';
  const durationText = fmtDuration(local ? local.duration : asset?.duration_seconds);

  const videoSrc = local
    ? local.src
    : asset
      ? assetUrl(asset.download_url)
      : '';

  /* ---------- 舞台宽度（等比缩放叠加层） ---------- */
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width;
      if (w) setStageW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasSource]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (playing) {
      const p = v.play();
      if (p && p.catch) p.catch(() => setPlaying(false));
    } else {
      v.pause();
    }
  }, [playing, videoSrc]);

  const scale = stageW / 1920;
  const marginPx = Math.round(wm.margin * scale);
  const percent = Math.min(100, (current / Math.max(1, safeTotal)) * 100);

  /* ---------- 校验（与后端 validate_rules 对齐的前置提示） ---------- */
  const problems: string[] = [];
  if (!hasSource) problems.push('请先导入视频或从素材库选择');
  if (!wm.text_on && !wm.logo_on) problems.push('文字与 Logo 至少启用一项');
  if (wm.text_on && !wm.text.trim()) problems.push('请填写文字水印内容');
  if (wm.logo_on && !wm.logo_asset_id) problems.push('请上传或选择 Logo 图片');
  const invalid = problems.length > 0;

  const patch = (next: Partial<WatermarkConfig>) => setWm((cur) => ({ ...cur, ...next }));

  const applyPreset = (id: string) => {
    const found = presets.find((p) => p.id === id);
    setPresetId(id);
    if (found) {
      setWm({ ...DEFAULT_WATERMARK, ...found.config });
      setLogoPreview('');
      toast(`已应用方案「${found.name}」`);
    }
  };

  const savePreset = async () => {
    const name = `当前配置 · ${new Date().toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
    try {
      const created = await api.createPreset(name, wm, false);
      setPresets((list) => [created, ...list]);
      setPresetId(created.id);
      toast('水印方案已保存（参数模板，不占用素材库）');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '方案保存失败', 'warn');
    }
  };

  /* ---------- 本地视频导入 ---------- */
  const importFile = (file?: File | null) => {
    if (!file) return;
    const extRaw = (file.name.split('.').pop() || '').toLowerCase();
    const ext = `.${extRaw}`;
    if (!VIDEO_ACCEPT.includes(ext)) {
      toast(`不支持的格式 ${extRaw.toUpperCase()}，请使用 MP4 / MOV / MKV / WEBM`, 'warn');
      return;
    }
    if (file.size > VIDEO_MAX_BYTES) {
      toast('文件超过 2 GB，请先在素材库上传，再从素材库引用', 'warn');
      return;
    }

    setImporting(true);
    const url = URL.createObjectURL(file);
    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.muted = true;
    probe.src = url;

    let settled = false;
    const finish = (info: { duration: number; resolution: string }, warn?: string) => {
      if (settled) return;
      settled = true;
      const name = file.name.replace(/\.[^.]+$/, '');
      setLocal({
        file,
        name,
        ext: extRaw.toUpperCase(),
        sizeText: fmtSize(file.size),
        src: url,
        duration: info.duration || 0,
        resolution: info.resolution || '—',
      });
      setAssetId('');
      setImporting(false);
      setPlaying(false);
      setCurrent(0);
      setSubmittedId(null);
      if (warn) toast(warn, 'warn');
      else toast(`已导入「${name}」，可开始配置水印`);
    };

    const guard = setTimeout(() => finish({ duration: 0, resolution: '—' }), 3200);
    probe.onloadedmetadata = () => {
      const res = `${probe.videoWidth || 0} × ${probe.videoHeight || 0}`;
      if (!isFinite(probe.duration) || probe.duration === 0) {
        /* MediaRecorder 等来源的 webm 时长会读成 Infinity，先 seek 逼出真实值 */
        probe.currentTime = 1e101;
        probe.ontimeupdate = () => {
          probe.ontimeupdate = null;
          clearTimeout(guard);
          finish({ duration: Math.round(probe.duration) || 0, resolution: res });
        };
        return;
      }
      clearTimeout(guard);
      finish({ duration: Math.round(probe.duration), resolution: res });
    };
    probe.onerror = () => {
      clearTimeout(guard);
      finish(
        { duration: 0, resolution: '—' },
        '无法解析该文件画面信息，仍可保存，最终以服务端 ffprobe 结果为准',
      );
    };
  };

  /* ---------- Logo：上传即入库，拿 asset_id 供后端合成 ---------- */
  const uploadLogo = async (file?: File | null) => {
    if (!file) return;
    setLogoBusy(true);
    try {
      const { items } = await api.upload([file], 'logo');
      const up = items[0];
      setImages((list) => [up, ...list]);
      patch({ logo_asset_id: up.id });
      setLogoPreview(assetUrl(up.thumbnail_url || up.download_url));
      toast('Logo 已入库，可用于水印合成');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Logo 上传失败', 'warn');
    } finally {
      setLogoBusy(false);
    }
  };

  const pickLogoFromLibrary = (id: string) => {
    const img = images.find((i) => i.id === id);
    if (!img) return;
    patch({ logo_asset_id: img.id });
    setLogoPreview(assetUrl(img.thumbnail_url || img.download_url));
  };

  const seekTo = (sec: number) => {
    setCurrent(sec);
    const v = videoRef.current;
    if (v) v.currentTime = sec;
  };

  /* ---------- 抽帧预览：canvas 合成当前帧 + 文字水印 ---------- */
  const captureFrame = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) {
      toast('视频尚未就绪，请先播放或拖动进度', 'warn');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    if (wm.text_on && wm.text) {
      const k = canvas.width / 1920;
      const fs = Math.max(9, wm.font_size * k);
      const m = wm.margin * k;
      ctx.font = `600 ${fs}px "PingFang SC","Microsoft YaHei",sans-serif`;
      ctx.fillStyle = wm.font_color;
      ctx.globalAlpha = wm.text_opacity;
      const pos = wm.text_position;
      const h = pos.includes('left') ? 'left' : pos.includes('right') ? 'right' : 'center';
      const vert = pos.includes('top') ? 'top' : pos.includes('bottom') ? 'bottom' : 'middle';
      ctx.textAlign = h === 'left' ? 'left' : h === 'right' ? 'right' : 'center';
      ctx.textBaseline = vert === 'top' ? 'top' : vert === 'bottom' ? 'bottom' : 'middle';
      const x = h === 'left' ? m : h === 'right' ? canvas.width - m : canvas.width / 2;
      const y = vert === 'top' ? m : vert === 'bottom' ? canvas.height - m : canvas.height / 2;
      ctx.fillText(wm.text, x, y);
    }
    setFlash(true);
    setTimeout(() => setFlash(false), 700);
    setSnapshot(canvas.toDataURL('image/png'));
    toast(`已抽取第 ${fmtClock(current)} 帧（文字水印示意，最终以服务端渲染为准）`);
  };

  /* ---------- 保存到素材库：先入库源视频，再建渲染任务 ---------- */
  const saveToAssets = async () => {
    if (invalid) {
      toast(problems[0], 'warn');
      return;
    }
    if (uploading) return;
    setUploading(true);
    try {
      let sourceId = assetId;
      let sourceName = asset?.name || '';
      if (local) {
        const { items } = await api.upload([local.file], 'video');
        const up = items[0];
        sourceId = up.id;
        sourceName = up.name;
        setVideos((list) => [up, ...list]);
      }
      const task = await api.createTask({
        name: `${sourceName} · 水印版`,
        task_type: 'video',
        asset_id: sourceId,
        save_to_assets: true,
        watermark_config: wm,
      });
      setSubmittedId(task.id);
      toast('已提交，正在渲染并写入素材库');
      navigate('tasks', task.id);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '提交失败', 'warn');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="page page--fill">
      <header className="head">
        <div>
          <h1 className="head__title">视频水印</h1>
          <div className="head__sub">
            导入视频 → 调整水印参数 → 保存到素材库，后台渲染完成后可直接下载
          </div>
        </div>
        <div className="head__actions">
          <button className="btn btn--ghost" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={15} stroke={1.9} />
            导入视频
          </button>
          <button className="btn btn--ghost" onClick={savePreset} disabled={!hasSource}>
            保存方案
          </button>
          {submittedId ? (
            <button className="btn btn--primary" onClick={() => navigate('tasks', submittedId)}>
              <Icon name="list" size={16} stroke={1.9} />
              查看任务进度
            </button>
          ) : (
            <button className="btn btn--primary" onClick={saveToAssets} disabled={invalid || uploading}>
              <Icon name="folder" size={16} stroke={1.8} />
              {uploading ? '上传中…' : '保存到素材库'}
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept={VIDEO_ACCEPT.join(',')}
            hidden
            onChange={(e) => {
              importFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
      </header>

      {!hasSource ? (
        <div
          className={`wm-empty${importing ? ' is-busy' : ''}`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            importFile(e.dataTransfer.files?.[0]);
          }}
        >
          <div
            className="wm-empty__card"
            onClick={() => fileRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileRef.current?.click();
              }
            }}
          >
            <div className="wm-empty__icon">
              <Icon name="upload2" size={26} stroke={1.8} />
            </div>
            <div className="wm-empty__title">
              {importing ? '正在读取视频信息…' : '把视频拖到这里，或点击导入'}
            </div>
            <div className="wm-empty__sub">
              MP4 / MOV / MKV / WEBM · 单文件 ≤ 2 GB · 导入后本地预览，保存时才上传
            </div>
            <div className="wm-empty__or">
              <span>或</span>
            </div>
            <div className="wm-empty__lib" onClick={(e) => e.stopPropagation()}>
              <Select
                ariaLabel="从素材库选择视频"
                value=""
                onChange={(v) => {
                  if (!v) return;
                  setAssetId(v);
                  setLocal(null);
                  setCurrent(0);
                  setPlaying(false);
                  setSubmittedId(null);
                }}
                options={[
                  { key: '', value: '', label: `从素材库选择（${videos.length} 个视频）` },
                  ...videos.map((v) => ({ key: v.id, value: v.id, label: v.name })),
                ]}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="editor">
          <div className="editor__main">
            <div className={`player${flash ? ' is-flash' : ''}`}>
              <div
                className="player__stage"
                ref={stageRef}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  importFile(e.dataTransfer.files?.[0]);
                }}
              >
                {videoSrc ? (
                  <video
                    ref={videoRef}
                    className="player__video"
                    src={videoSrc}
                    muted
                    playsInline
                    onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
                    onEnded={() => setPlaying(false)}
                  />
                ) : (
                  <div className="player__blank g3">
                    <Icon name="film" size={40} stroke={1.4} />
                  </div>
                )}
                <div className="preview__veil" />

                {/* 实时水印叠加层（按 1920 宽等比缩放） */}
                <div className="wm-layer">
                  {wm.text_on && wm.text ? (
                    <span
                      className="wm-text"
                      style={{
                        ...anchorStyle(wm.text_position, marginPx),
                        fontSize: Math.max(9, wm.font_size * scale),
                        color: wm.font_color,
                        opacity: wm.text_opacity,
                      }}
                    >
                      {wm.text}
                    </span>
                  ) : null}
                  {wm.logo_on && wm.logo_asset_id ? (
                    <span
                      className="wm-logo"
                      style={{
                        ...anchorStyle(wm.logo_position, marginPx),
                        width: Math.max(36, wm.logo_width * scale),
                        opacity: wm.logo_opacity,
                      }}
                    >
                      {logoPreview ? (
                        <img src={logoPreview} alt="logo" />
                      ) : (
                        <span className="wm-logo__mark">
                          <Icon name="shield" size={15} stroke={1.9} />
                          Logo
                        </span>
                      )}
                    </span>
                  ) : null}
                </div>

                <div className="preview__badge">
                  <Icon name="film" size={12} stroke={2} />
                  {resolutionText} · {local ? local.ext : asset?.ext?.toUpperCase() || 'MP4'}
                </div>

                <span className="preview__hint">预览为效果示意</span>

                <button
                  className="preview__play"
                  onClick={() => setPlaying((p) => !p)}
                  aria-label={playing ? '暂停' : '播放'}
                >
                  <Icon name={playing ? 'pause' : 'play'} size={playing ? 24 : 26} stroke={2} />
                </button>
              </div>

              <div className="player__ctrl">
                <button
                  className="player__toggle"
                  onClick={() => setPlaying((p) => !p)}
                  aria-label={playing ? '暂停' : '播放'}
                >
                  <Icon name={playing ? 'pause' : 'play'} size={15} stroke={2} />
                </button>
                <span className="player__time num">{fmtClock(current)}</span>
                <div
                  className="player__track"
                  onClick={(e) => {
                    const box = e.currentTarget.getBoundingClientRect();
                    const ratio = (e.clientX - box.left) / box.width;
                    seekTo(Math.round(Math.max(0, Math.min(1, ratio)) * safeTotal));
                  }}
                  role="slider"
                  aria-label="播放进度"
                  aria-valuemin={0}
                  aria-valuemax={safeTotal}
                  aria-valuenow={Math.round(current)}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowRight') seekTo(Math.min(safeTotal, current + 2));
                    if (e.key === 'ArrowLeft') seekTo(Math.max(0, current - 2));
                  }}
                >
                  <i style={{ width: `${percent}%` }} />
                  <span className="player__knob" style={{ left: `${percent}%` }} />
                </div>
                <span className="player__time num">{fmtClock(safeTotal)}</span>
                <button className="tool-btn tool-btn--sm" onClick={captureFrame}>
                  <Icon name="image" size={14} stroke={1.9} />
                  抽帧预览
                </button>
              </div>
            </div>

            <section className="panel asset-card">
              <div className="asset-card__head">
                <div className="panel__title">素材信息</div>
                <div className="asset-card__tools">
                  {local ? (
                    <button className="link" onClick={() => fileRef.current?.click()}>
                      换一个视频
                    </button>
                  ) : null}
                  <Select
                    ariaLabel="选择源视频"
                    value={local ? '__local' : assetId}
                    onChange={(v) => {
                      if (v === '__local') return;
                      setLocal(null);
                      setAssetId(v);
                      setCurrent(0);
                      setPlaying(false);
                      setSubmittedId(null);
                    }}
                    options={[
                      ...(local
                        ? [{ key: '__local', value: '__local', label: `本地：${local.name}` }]
                        : []),
                      ...videos.map((v) => ({ key: v.id, value: v.id, label: v.name })),
                    ]}
                  />
                </div>
              </div>
              <div className="asset-card__grid">
                <div className="info__row">
                  <div className="info__label">文件格式</div>
                  <div className="info__value">
                    {local ? local.ext : `${asset?.ext?.toUpperCase() || 'MP4'}`}
                  </div>
                </div>
                <div className="info__row">
                  <div className="info__label">分辨率</div>
                  <div className="info__value num">{resolutionText}</div>
                </div>
                <div className="info__row">
                  <div className="info__label">时长</div>
                  <div className="info__value num">{durationText}</div>
                </div>
                <div className="info__row">
                  <div className="info__label">文件大小</div>
                  <div className="info__value num">{sizeText}</div>
                </div>
                <div className="info__row">
                  <div className="info__label">来源</div>
                  <div className="info__value">
                    {local ? (
                      <span className="src-tag src-tag--local">本地文件 · 未入库</span>
                    ) : (
                      <span className="src-tag src-tag--lib">素材库</span>
                    )}
                  </div>
                </div>
                <div className="info__row">
                  <div className="info__label">{local ? '文件 ID' : '素材 ID'}</div>
                  <div className="info__value num">{local ? '待入库' : asset?.id || '—'}</div>
                </div>
              </div>
            </section>
          </div>

          <aside className="editor__side wm-side">
            <section className="panel wm-panel">
              <Field label="水印方案" hint="默认方案由系统设置下发，可在页面内临时调整">
                <Select
                  ariaLabel="水印方案"
                  value={presetId}
                  onChange={applyPreset}
                  options={
                    presets.length
                      ? presets.map((p) => ({
                          key: p.id,
                          value: p.id,
                          label: p.is_default ? `${p.name}（默认）` : p.name,
                        }))
                      : [{ key: '', value: '', label: '暂无方案，可点击「保存方案」创建' }]
                  }
                />
              </Field>
            </section>

            <section className="panel wm-panel">
              <Switch
                label="文字水印"
                desc="叠加在画面上的文字标识"
                checked={wm.text_on}
                onChange={(v) => patch({ text_on: v })}
              />
              {wm.text_on ? (
                <div className="wm-fields">
                  <Field label="文字内容">
                    <div className="input input--sm">
                      <input
                        value={wm.text}
                        placeholder="如：健衡学院"
                        onChange={(e) => patch({ text: e.target.value })}
                      />
                    </div>
                  </Field>

                  <Field label="位置">
                    <div className="wm-pos-row">
                      <PositionPicker
                        value={wm.text_position}
                        onChange={(v) => patch({ text_position: v })}
                      />
                      <div className="wm-pos-meta">
                        <div className="wm-pos-meta__value">{positionLabel(wm.text_position)}</div>
                        <div className="wm-pos-meta__hint">九宫格对齐</div>
                      </div>
                    </div>
                  </Field>

                  <div className="wm-grid2">
                    <Field label="字号">
                      <div className="input input--sm">
                        <input
                          type="number"
                          value={wm.font_size}
                          min={8}
                          max={200}
                          onChange={(e) => patch({ font_size: Number(e.target.value) || 0 })}
                        />
                        <span className="input__suffix">px</span>
                      </div>
                    </Field>
                    <Field label="颜色">
                      <div className="wm-color">
                        <input
                          type="color"
                          value={wm.font_color}
                          onChange={(e) => patch({ font_color: e.target.value })}
                          aria-label="文字颜色"
                        />
                        {SWATCHES.map((c) => (
                          <button
                            key={c}
                            type="button"
                            className={`wm-swatch${wm.font_color.toUpperCase() === c ? ' is-active' : ''}`}
                            style={{ background: c }}
                            onClick={() => patch({ font_color: c })}
                            aria-label={`使用颜色 ${c}`}
                          />
                        ))}
                      </div>
                    </Field>
                  </div>

                  <Field label="透明度">
                    <div className="wm-range">
                      <input
                        type="range"
                        min={0.1}
                        max={1}
                        step={0.05}
                        value={wm.text_opacity}
                        onChange={(e) => patch({ text_opacity: Number(e.target.value) })}
                      />
                      <span className="num">{wm.text_opacity.toFixed(2)}</span>
                    </div>
                  </Field>
                </div>
              ) : null}
            </section>

            <section className="panel wm-panel">
              <Switch
                label="Logo 水印"
                desc="PNG 透明底效果最佳"
                checked={wm.logo_on}
                onChange={(v) => patch({ logo_on: v })}
              />
              {wm.logo_on ? (
                <div className="wm-fields">
                  <Field label="Logo 图片" hint="上传后自动入库，供服务端合成使用">
                    <div className="wm-logo-row">
                      <button
                        className="btn btn--ghost btn--sm"
                        onClick={() => logoRef.current?.click()}
                        disabled={logoBusy}
                      >
                        <Icon name="upload" size={14} stroke={1.9} />
                        {logoBusy ? '上传中…' : '上传 PNG'}
                      </button>
                      <Select
                        ariaLabel="从素材库选择 Logo"
                        value={wm.logo_asset_id || ''}
                        onChange={pickLogoFromLibrary}
                        options={[
                          { key: '', value: '', label: '从素材库选择…' },
                          ...images.map((i) => ({ key: i.id, value: i.id, label: i.name })),
                        ]}
                      />
                    </div>
                    <input
                      ref={logoRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      hidden
                      onChange={(e) => {
                        uploadLogo(e.target.files?.[0]);
                        e.target.value = '';
                      }}
                    />
                    <div className={`wm-logo-pick${wm.logo_asset_id ? ' is-on' : ''}`}>
                      <span className="wm-logo-pick__thumb">
                        {logoPreview ? (
                          <img src={logoPreview} alt="logo" />
                        ) : (
                          <Icon name="logo" size={18} stroke={1.7} />
                        )}
                      </span>
                      <span className="wm-logo-pick__name">
                        {wm.logo_asset_id
                          ? images.find((i) => i.id === wm.logo_asset_id)?.name || wm.logo_asset_id
                          : '尚未选择 Logo 图片'}
                      </span>
                      {wm.logo_asset_id ? (
                        <button
                          type="button"
                          className="pick__x"
                          aria-label="移除 Logo"
                          onClick={() => {
                            patch({ logo_asset_id: null });
                            setLogoPreview('');
                          }}
                        >
                          <Icon name="close" size={12} stroke={2} />
                        </button>
                      ) : null}
                    </div>
                  </Field>

                  <Field label="位置">
                    <div className="wm-pos-row">
                      <PositionPicker
                        value={wm.logo_position}
                        onChange={(v) => patch({ logo_position: v })}
                      />
                      <div className="wm-pos-meta">
                        <div className="wm-pos-meta__value">{positionLabel(wm.logo_position)}</div>
                        <div className="wm-pos-meta__hint">九宫格对齐</div>
                      </div>
                    </div>
                  </Field>

                  <div className="wm-grid2">
                    <Field label="宽度">
                      <div className="input input--sm">
                        <input
                          type="number"
                          value={wm.logo_width}
                          min={32}
                          max={800}
                          onChange={(e) => patch({ logo_width: Number(e.target.value) || 0 })}
                        />
                        <span className="input__suffix">px</span>
                      </div>
                    </Field>
                    <Field label="透明度">
                      <div className="wm-range">
                        <input
                          type="range"
                          min={0.1}
                          max={1}
                          step={0.05}
                          value={wm.logo_opacity}
                          onChange={(e) => patch({ logo_opacity: Number(e.target.value) })}
                        />
                        <span className="num">{wm.logo_opacity.toFixed(2)}</span>
                      </div>
                    </Field>
                  </div>
                </div>
              ) : null}
            </section>

            <section className="panel wm-panel">
              <button
                type="button"
                className={`wm-adv${advOpen ? ' is-open' : ''}`}
                onClick={() => setAdvOpen((v) => !v)}
                aria-expanded={advOpen}
              >
                <span className="panel__title">通用 · 编码参数</span>
                <span className="wm-adv__meta">
                  CRF {wm.crf} · {wm.preset} · {wm.threads || 'auto'}
                </span>
                <Icon name="chevronDown" size={14} className="wm-adv__arrow" />
              </button>
              {advOpen ? (
                <div className="wm-fields">
                  <div className="wm-grid2">
                    <Field label="边距">
                      <div className="input input--sm">
                        <input
                          type="number"
                          value={wm.margin}
                          min={0}
                          max={400}
                          onChange={(e) => patch({ margin: Number(e.target.value) || 0 })}
                        />
                        <span className="input__suffix">px</span>
                      </div>
                    </Field>
                    <Field label="画质 CRF" hint="18 更清晰，28 更小">
                      <div className="input input--sm">
                        <input
                          type="number"
                          value={wm.crf}
                          min={18}
                          max={28}
                          onChange={(e) => patch({ crf: Number(e.target.value) || 20 })}
                        />
                      </div>
                    </Field>
                  </div>
                  <Field label="编码预设">
                    <Seg
                      value={wm.preset}
                      onChange={(v) => patch({ preset: v })}
                      options={ENCODE_PRESETS.map((p) => ({ key: p, label: p }))}
                      columns={4}
                    />
                  </Field>
                  <Field label="编码线程" hint="0 表示由 ffmpeg 自动决定">
                    <div className="input input--sm">
                      <input
                        type="number"
                        value={wm.threads}
                        min={0}
                        max={64}
                        onChange={(e) => patch({ threads: Number(e.target.value) || 0 })}
                      />
                    </div>
                  </Field>
                </div>
              ) : null}
            </section>

            <div className={`wm-check${invalid ? ' is-bad' : ''}`}>
              <Icon name={invalid ? 'alert' : 'checkCircle'} size={14} stroke={1.9} />
              {invalid ? problems[0] : '水印配置校验通过，可保存到素材库'}
            </div>

            {engine === 'copy' ? (
              <div className="wm-check is-bad" style={{ marginTop: 8 }}>
                <Icon name="alert" size={14} stroke={1.9} />
                当前服务未检测到 ffmpeg，任务会按原样复制输出（engine=copy），不会真正叠加水印；装好
                ffmpeg 或配置 FFMPEG_PATH 后重启既可恢复渲染。
              </div>
            ) : null}
          </aside>
        </div>
      )}

      <Modal
        open={!!snapshot}
        onClose={() => setSnapshot('')}
        title="抽帧预览"
        sub={`第 ${fmtClock(current)} 帧 · 文字水印按 canvas 合成，最终以服务端渲染为准`}
        footer={
          <>
            <button className="btn btn--ghost" onClick={() => setSnapshot('')}>
              关闭
            </button>
            <a
              className="btn btn--primary"
              href={snapshot}
              download={`${local ? local.name : asset?.name || 'frame'}_${Math.round(current)}s.png`}
            >
              <Icon name="download" size={15} stroke={1.9} />
              下载预览图
            </a>
          </>
        }
        width={880}
      >
        {snapshot ? <img src={snapshot} alt="抽帧预览" style={{ width: '100%', borderRadius: 10 }} /> : null}
      </Modal>
    </div>
  );
}
