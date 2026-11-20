import React, { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Field, Seg, Select, Switch } from '../components/ui.jsx';
import {
  POSITIONS,
  defaultWatermark,
  ENCODE_PRESETS,
  positionLabel,
  watermarkPresets,
  VIDEO_ACCEPT,
  VIDEO_MAX_BYTES,
} from '../data/mock.js';

const SWATCHES = ['#FFFFFF', '#111111', '#14B8A4', '#F2C879'];

const fmt = (sec) => {
  const s = Math.max(0, Math.round(sec || 0));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

const toSeconds = (str) => {
  const [m, s] = String(str || '00:00').split(':').map(Number);
  return (m || 0) * 60 + (s || 0);
};

const sizeOf = (bytes) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/* 九宫格锚点 → 绝对定位样式 */
function anchorStyle(pos, margin) {
  const parts = String(pos).split('_');
  let h = 'center';
  let v = 'middle';
  if (pos !== 'center') {
    parts.forEach((p) => {
      if (p === 'left' || p === 'right') h = p;
      if (p === 'top' || p === 'bottom') v = p;
    });
  }
  const style = {};
  style.left = h === 'left' ? margin : h === 'right' ? 'auto' : '50%';
  if (h === 'right') style.right = margin;
  style.top = v === 'top' ? margin : v === 'bottom' ? 'auto' : '50%';
  if (v === 'bottom') style.bottom = margin;
  const tx = h === 'center' ? '-50%' : '0';
  const ty = v === 'middle' ? '-50%' : '0';
  if (tx !== '0' || ty !== '0') style.transform = `translate(${tx}, ${ty})`;
  return style;
}

function PositionPicker({ value, onChange }) {
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

export default function VideoWatermark({ assets, settings, onCreateTask, onNavigate, toast }) {
  const videos = useMemo(() => assets.filter((a) => a.type === 'video'), [assets]);
  const imageAssets = useMemo(() => assets.filter((a) => a.type === 'image'), [assets]);

  const [assetId, setAssetId] = useState('');
  const [local, setLocal] = useState(null); // { name, ext, size, resolution, duration, src, file }
  const [importing, setImporting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [presets, setPresets] = useState(watermarkPresets);
  const [presetId, setPresetId] = useState(watermarkPresets[0].id);
  const [wm, setWm] = useState(() => ({
    ...defaultWatermark,
    ...((settings && settings.watermark) || {}),
  }));
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [stageW, setStageW] = useState(760);
  const [flash, setFlash] = useState(false);
  const [advOpen, setAdvOpen] = useState(false);
  const [submittedId, setSubmittedId] = useState(null);

  const stageRef = useRef(null);
  const videoRef = useRef(null);
  const fileRef = useRef(null);
  const logoRef = useRef(null);

  const asset = videos.find((a) => a.id === assetId) || {};
  const hasSource = !!local || !!assetId;
  const total = local ? local.duration || 0 : toSeconds(asset.duration || '01:30');
  const safeTotal = total > 0 ? total : 30;

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

  /* 真实视频：交给 <video> 自己播放 */
  useEffect(() => {
    const v = videoRef.current;
    if (!local || !v) return;
    if (playing) {
      const p = v.play();
      if (p && p.catch) p.catch(() => setPlaying(false));
    } else {
      v.pause();
    }
  }, [playing, local]);

  /* 素材库示例视频没有真实文件：用定时器模拟播放进度 */
  useEffect(() => {
    if (local || !playing) return;
    const timer = setInterval(() => {
      setCurrent((v) => {
        if (v + 1 >= safeTotal) {
          setPlaying(false);
          return safeTotal;
        }
        return v + 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [local, playing, safeTotal]);

  const scale = stageW / 1920;
  const marginPx = Math.round(wm.margin * scale);
  const percent = Math.min(100, (current / Math.max(1, safeTotal)) * 100);

  const problems = [];
  if (!hasSource) problems.push('请先导入视频或从素材库选择');
  if (!wm.textOn && !wm.logoOn) problems.push('文字与 Logo 至少启用一项');
  if (wm.textOn && !wm.text.trim()) problems.push('请填写文字水印内容');
  if (wm.logoOn && !wm.logo) problems.push('请上传或选择 Logo 图片');
  const invalid = problems.length > 0;

  const patch = (next) => setWm((cur) => ({ ...cur, ...next }));

  const applyPreset = (id) => {
    const found = presets.find((p) => p.id === id);
    setPresetId(id);
    if (found) {
      setWm({ ...defaultWatermark, ...found.config });
      toast(`已应用方案「${found.name}」`);
    }
  };

  const savePreset = () => {
    const id = `wc_${Date.now().toString().slice(-4)}`;
    const name = `当前配置 · ${new Date().toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
    setPresets((list) => [{ id, name, config: { ...wm } }, ...list]);
    setPresetId(id);
    toast('水印方案已保存（参数模板，不占用素材库）');
  };

  /* ---------- 本地视频导入 ---------- */
  const importFile = (file) => {
    if (!file) return;
    const extRaw = (file.name.split('.').pop() || '').toLowerCase();
    const ext = `.${extRaw}`;
    if (!VIDEO_ACCEPT.includes(ext)) {
      toast(`不支持的格式 ${extRaw.toUpperCase()}，请使用 MP4 / MOV / MKV / WEBM`, 'warn');
      return;
    }
    if (file.size > VIDEO_MAX_BYTES) {
      toast('文件超过 2 GB，请先在素材库分块上传，再从素材库引用', 'warn');
      return;
    }

    setImporting(true);
    const url = URL.createObjectURL(file);
    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.muted = true;
    probe.src = url;

    let settled = false;
    const finish = (info, warn) => {
      if (settled) return;
      settled = true;
      const name = file.name.replace(/\.[^.]+$/, '');
      setLocal({
        name,
        ext: extRaw.toUpperCase(),
        size: sizeOf(file.size),
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
        '无法解析该文件画面信息，仍可保存，最终以服务端 ffprobe 结果为准'
      );
    };
  };

  const onPickFile = (e) => {
    const file = e.target.files && e.target.files[0];
    importFile(file);
    e.target.value = '';
  };

  const seekTo = (sec) => {
    setCurrent(sec);
    const v = videoRef.current;
    if (local && v) v.currentTime = sec;
  };

  const previewFrame = () => {
    setFlash(true);
    setTimeout(() => setFlash(false), 700);
    toast(`已生成第 ${fmt(current)} 帧的带水印预览图`);
  };

  /* ---------- 保存到素材库（走任务中心） ---------- */
  const saveToAssets = () => {
    if (invalid) {
      toast(problems[0], 'warn');
      return;
    }
    if (uploading) return;
    setUploading(true);
    const sourceName = local ? local.name : asset.name;
    const resolution = local ? local.resolution : asset.resolution || '1920 × 1080';
    const durationText = fmt(local ? local.duration : total);
    const sizeText = local ? local.size : asset.size || '—';

    setTimeout(() => {
      const id = onCreateTask({
        name: `${sourceName} · 水印版`,
        type: 'video',
        detail: {
          源视频: sourceName,
          视频来源: local ? '本地导入（已入库）' : '素材库',
          文字水印: wm.textOn ? `${wm.text} · ${positionLabel(wm.textPosition)}` : '未启用',
          Logo水印: wm.logoOn
            ? `${wm.logo ? wm.logo.name : 'Logo'} · ${positionLabel(wm.logoPosition)}`
            : '未启用',
          画质CRF: wm.crf,
          编码预设: wm.preset,
          保存到素材库: '是',
        },
        result: {
          outputName: `${sourceName}_水印版.mp4`,
          outputSize: sizeText,
          duration: durationText,
        },
        outputAsset: {
          name: `${sourceName}_水印版`,
          ext: 'MP4',
          size: sizeText,
          resolution,
          duration: durationText,
        },
      });
      setUploading(false);
      setSubmittedId(id);
      toast('已提交，正在渲染并写入素材库');
      onNavigate('tasks', id);
    }, 900);
  };

  const resolutionText = local ? local.resolution : asset.resolution || '1920 × 1080';
  const durationText = fmt(local ? local.duration : total);
  const sizeText = local ? local.size : asset.size || '—';

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
            <button className="btn btn--primary" onClick={() => onNavigate('tasks', submittedId)}>
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
            onChange={onPickFile}
          />
        </div>
      </header>

      {!hasSource ? (
        <div
          className={`wm-empty${importing ? ' is-busy' : ''}`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files && e.dataTransfer.files[0];
            importFile(file);
          }}
        >
          <div className="wm-empty__card" onClick={() => fileRef.current?.click()} role="button" tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileRef.current?.click();
              }
            }}>
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
                  const file = e.dataTransfer.files && e.dataTransfer.files[0];
                  importFile(file);
                }}
              >
                {local ? (
                  <video
                    ref={videoRef}
                    className="player__video"
                    src={local.src}
                    muted
                    playsInline
                    onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
                    onEnded={() => setPlaying(false)}
                  />
                ) : asset.img ? (
                  <img src={asset.img} alt={asset.name} />
                ) : (
                  <div className={`player__blank ${asset.tone || 'g3'}`}>
                    <Icon name="film" size={40} stroke={1.4} />
                  </div>
                )}
                <div className="preview__veil" />

                {/* 实时水印叠加层（按 1920 宽等比缩放） */}
                <div className="wm-layer">
                  {wm.textOn && wm.text ? (
                    <span
                      className="wm-text"
                      style={{
                        ...anchorStyle(wm.textPosition, marginPx),
                        fontSize: Math.max(9, wm.fontSize * scale),
                        color: wm.fontColor,
                        opacity: wm.textOpacity,
                      }}
                    >
                      {wm.text}
                    </span>
                  ) : null}
                  {wm.logoOn && wm.logo ? (
                    <span
                      className="wm-logo"
                      style={{
                        ...anchorStyle(wm.logoPosition, marginPx),
                        width: Math.max(36, wm.logoWidth * scale),
                        opacity: wm.logoOpacity,
                      }}
                    >
                      {wm.logo.src ? (
                        <img src={wm.logo.src} alt="logo" />
                      ) : (
                        <span className="wm-logo__mark">
                          <Icon name="shield" size={15} stroke={1.9} />
                          健衡学院
                        </span>
                      )}
                    </span>
                  ) : null}
                </div>

                <div className="preview__badge">
                  <Icon name="film" size={12} stroke={2} />
                  {resolutionText} · {local ? local.ext : asset.ext || 'MP4'}
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
                <span className="player__time num">{fmt(current)}</span>
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
                <span className="player__time num">{fmt(safeTotal)}</span>
                <button className="tool-btn tool-btn--sm" onClick={previewFrame}>
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
                    {local ? local.ext : `${asset.ext || 'MP4'} · H.264`}
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
                  <div className="info__value num">{local ? '待入库' : asset.id || '—'}</div>
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
                  options={presets.map((p) => ({
                    key: p.id,
                    value: p.id,
                    label: p.isDefault ? `${p.name}（默认）` : p.name,
                  }))}
                />
              </Field>
            </section>

            <section className="panel wm-panel">
              <Switch
                label="文字水印"
                desc="叠加在画面上的文字标识"
                checked={wm.textOn}
                onChange={(v) => patch({ textOn: v })}
              />
              {wm.textOn ? (
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
                        value={wm.textPosition}
                        onChange={(v) => patch({ textPosition: v })}
                      />
                      <div className="wm-pos-meta">
                        <div className="wm-pos-meta__value">{positionLabel(wm.textPosition)}</div>
                        <div className="wm-pos-meta__hint">九宫格对齐</div>
                      </div>
                    </div>
                  </Field>

                  <div className="wm-grid2">
                    <Field label="字号">
                      <div className="input input--sm">
                        <input
                          type="number"
                          value={wm.fontSize}
                          min={8}
                          max={200}
                          onChange={(e) => patch({ fontSize: Number(e.target.value) || 0 })}
                        />
                        <span className="input__suffix">px</span>
                      </div>
                    </Field>
                    <Field label="颜色">
                      <div className="wm-color">
                        <input
                          type="color"
                          value={wm.fontColor}
                          onChange={(e) => patch({ fontColor: e.target.value })}
                          aria-label="文字颜色"
                        />
                        {SWATCHES.map((c) => (
                          <button
                            key={c}
                            type="button"
                            className={`wm-swatch${wm.fontColor.toUpperCase() === c ? ' is-active' : ''}`}
                            style={{ background: c }}
                            onClick={() => patch({ fontColor: c })}
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
                        value={wm.textOpacity}
                        onChange={(e) => patch({ textOpacity: Number(e.target.value) })}
                      />
                      <span className="num">{wm.textOpacity.toFixed(2)}</span>
                    </div>
                  </Field>
                </div>
              ) : null}
            </section>

            <section className="panel wm-panel">
              <Switch
                label="Logo 水印"
                desc="PNG 透明底效果最佳"
                checked={wm.logoOn}
                onChange={(v) => patch({ logoOn: v })}
              />
              {wm.logoOn ? (
                <div className="wm-fields">
                  <Field label="Logo 图片">
                    <div className="wm-logo-row">
                      <button
                        className="btn btn--ghost btn--sm"
                        onClick={() => logoRef.current?.click()}
                      >
                        <Icon name="upload" size={14} stroke={1.9} />
                        上传 PNG
                      </button>
                      <Select
                        ariaLabel="从素材库选择 Logo"
                        value={wm.logo && wm.logo.assetId ? wm.logo.assetId : ''}
                        onChange={(v) => {
                          const img = imageAssets.find((i) => i.id === v);
                          if (img) patch({ logo: { name: img.name, src: img.img, assetId: img.id } });
                        }}
                        options={[
                          { key: '', value: '', label: '从素材库选择…' },
                          ...imageAssets.map((i) => ({ key: i.id, value: i.id, label: i.name })),
                        ]}
                      />
                    </div>
                    <input
                      ref={logoRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      hidden
                      onChange={(e) => {
                        const file = e.target.files && e.target.files[0];
                        if (!file) return;
                        patch({ logo: { name: file.name, src: URL.createObjectURL(file) } });
                        e.target.value = '';
                      }}
                    />
                    <div className={`wm-logo-pick${wm.logo ? ' is-on' : ''}`}>
                      <span className="wm-logo-pick__thumb">
                        {wm.logo && wm.logo.src ? (
                          <img src={wm.logo.src} alt="logo" />
                        ) : (
                          <Icon name="logo" size={18} stroke={1.7} />
                        )}
                      </span>
                      <span className="wm-logo-pick__name">
                        {wm.logo ? wm.logo.name : '尚未选择 Logo 图片'}
                      </span>
                      {wm.logo ? (
                        <button
                          type="button"
                          className="pick__x"
                          aria-label="移除 Logo"
                          onClick={() => patch({ logo: null })}
                        >
                          <Icon name="close" size={12} stroke={2} />
                        </button>
                      ) : null}
                    </div>
                  </Field>

                  <Field label="位置">
                    <div className="wm-pos-row">
                      <PositionPicker
                        value={wm.logoPosition}
                        onChange={(v) => patch({ logoPosition: v })}
                      />
                      <div className="wm-pos-meta">
                        <div className="wm-pos-meta__value">{positionLabel(wm.logoPosition)}</div>
                        <div className="wm-pos-meta__hint">九宫格对齐</div>
                      </div>
                    </div>
                  </Field>

                  <div className="wm-grid2">
                    <Field label="宽度">
                      <div className="input input--sm">
                        <input
                          type="number"
                          value={wm.logoWidth}
                          min={32}
                          max={800}
                          onChange={(e) => patch({ logoWidth: Number(e.target.value) || 0 })}
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
                          value={wm.logoOpacity}
                          onChange={(e) => patch({ logoOpacity: Number(e.target.value) })}
                        />
                        <span className="num">{wm.logoOpacity.toFixed(2)}</span>
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
          </aside>
        </div>
      )}
    </div>
  );
}
