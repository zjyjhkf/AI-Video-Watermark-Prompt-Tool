import React, { useEffect, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Field, Select, Switch } from '../components/ui.jsx';
import {
  AI_PROVIDERS,
  POSITIONS,
  defaultWatermark,
  ENCODE_PRESETS,
  watermarkPresets,
  positionLabel,
} from '../data/mock.js';

const SWATCHES = ['#FFFFFF', '#111111', '#14B8A4', '#F2C879'];

const SECTIONS = [
  { key: 'ai', label: 'AI 文案模型', icon: 'cpu' },
  { key: 'aiImage', label: 'AI 生图模型', icon: 'image' },
  { key: 'watermark', label: '默认水印', icon: 'logo' },
  { key: 'lexicon', label: '词库', icon: 'database' },
  { key: 'worker', label: '任务队列', icon: 'sliders' },
  { key: 'storage', label: '存储', icon: 'folder' },
];

const STORAGE_BACKENDS = [
  { key: 'local', label: '本地磁盘' },
  { key: 'minio', label: 'MinIO' },
  { key: 's3', label: 'S3 兼容对象存储' },
];

const IMAGE_SIZES = [
  { key: '1024x1024', label: '1024 × 1024（方图）' },
  { key: '1024x1536', label: '1024 × 1536（竖图）' },
  { key: '1536x1024', label: '1536 × 1024（横图）' },
];

/* 九宫格锚点 → 预览用绝对定位 */
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

export default function Settings({ settings, setSettings, toast, user }) {
  const [section, setSection] = useState('ai');
  const [draft, setDraft] = useState(settings);
  const [reveal, setReveal] = useState({});
  const [dirty, setDirty] = useState(false);
  const [presets, setPresets] = useState(watermarkPresets);

  useEffect(() => {
    setDraft(settings);
    setDirty(false);
  }, [settings]);

  const patch = (group, next) => {
    setDraft((d) => ({ ...d, [group]: { ...d[group], ...next } }));
    setDirty(true);
  };

  const save = () => {
    if (draft.ai.maxTokens && Number(draft.ai.maxTokens) < 1024) {
      toast('最大输出 tokens 建议不低于 1024', 'warn');
      return;
    }
    setSettings(draft);
    setDirty(false);
    toast('设置已保存，热加载生效');
  };

  const reset = () => {
    setDraft(settings);
    setDirty(false);
    toast('已还原为上次保存的设置');
  };

  /* ---------- 默认水印 ---------- */
  const wm = draft.watermark || defaultWatermark;
  const patchWm = (next) => patch('watermark', next);

  const resetWatermark = () => {
    patch('watermark', { ...defaultWatermark });
    toast('已恢复出厂默认水印，保存后生效');
  };

  const saveDefaultWatermark = () => {
    if (!wm.textOn && !wm.logoOn) {
      toast('文字与 Logo 至少启用一项', 'warn');
      return;
    }
    if (wm.textOn && !wm.text.trim()) {
      toast('请填写文字水印内容', 'warn');
      return;
    }
    if (wm.logoOn && !wm.logo) {
      toast('请先选择 Logo 图片', 'warn');
      return;
    }
    setSettings(draft);
    setDirty(false);
    toast('默认水印已更新，新打开的视频水印页生效');
  };

  const saveAsPreset = () => {
    const name = `自定义方案 · ${new Date().toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
    setPresets((list) => [
      { id: `wc_${Date.now().toString().slice(-4)}`, name, config: { ...wm } },
      ...list,
    ]);
    toast(`已另存为方案「${name}」，可在视频水印页选用`);
  };

  const applyPresetAsDefault = (id) => {
    const found = presets.find((p) => p.id === id);
    if (!found) return;
    setPresets((list) => list.map((p) => ({ ...p, isDefault: p.id === id })));
    patch('watermark', { ...defaultWatermark, ...found.config });
    toast(`已将「${found.name}」设为默认，保存后生效`);
  };

  const keyField = (group, value) => (
    <div className="input">
      <input
        type={reveal[group] ? 'text' : 'password'}
        value={value}
        placeholder="sk-..."
        onChange={(e) => patch(group, { apiKeyMasked: e.target.value })}
        autoComplete="off"
      />
      <button
        type="button"
        className="input__eye"
        onClick={() => setReveal((r) => ({ ...r, [group]: !r[group] }))}
        aria-label={reveal[group] ? '隐藏密钥' : '显示密钥'}
      >
        <Icon name={reveal[group] ? 'eyeOff' : 'eye'} size={15} stroke={1.8} />
      </button>
    </div>
  );

  return (
    <div className="page page--fill page--auto">
      <header className="head">
        <div>
          <h1 className="head__title">系统设置</h1>
          <div className="head__sub">全局配置项集中在此维护，保存后无需重启即可生效</div>
        </div>
        <div className="head__actions">
          <button className="btn btn--ghost" onClick={reset} disabled={!dirty}>
            还原
          </button>
          <button className="btn btn--primary" onClick={save}>
            <Icon name="check" size={15} stroke={2.2} />
            保存更改
          </button>
        </div>
      </header>

      <div className="settings-layout">
        <nav className="settings-nav">
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              className={`settings-nav__item${section === s.key ? ' is-active' : ''}`}
              onClick={() => setSection(s.key)}
            >
              <Icon name={s.icon} size={16} />
              {s.label}
            </button>
          ))}
          <div className="settings-nav__note">
            <Icon name="lock" size={12} stroke={1.8} />
            仅{user && user.role === 'admin' ? '管理员' : '管理员及以上'}可访问
          </div>
        </nav>

        <div className="settings-body">
          {section === 'ai' ? (
            <section className="panel settings-panel">
              <div className="settings-panel__head">
                <div>
                  <div className="panel__title">AI 文案模型</div>
                  <div className="hint">用于文章编写与生图提示词扩写，OpenAI 兼容协议接入</div>
                </div>
                <span className="pill pill--mint">已连接</span>
              </div>

              <div className="settings-grid2">
                <Field label="供应商">
                  <Select
                    ariaLabel="文案模型供应商"
                    value={draft.ai.provider}
                    onChange={(v) => patch('ai', { provider: v })}
                    options={AI_PROVIDERS}
                  />
                </Field>
                <Field label="模型名称">
                  <div className="input">
                    <input
                      value={draft.ai.model}
                      placeholder="如 deepseek-chat"
                      onChange={(e) => patch('ai', { model: e.target.value })}
                    />
                  </div>
                </Field>
              </div>

              <Field label="API Base URL">
                <div className="input">
                  <input
                    value={draft.ai.baseUrl}
                    placeholder="https://api.deepseek.com/v1"
                    onChange={(e) => patch('ai', { baseUrl: e.target.value })}
                  />
                </div>
              </Field>

              <Field label="API Key" hint="脱敏存储，页面仅显示首尾各 4 位">
                {keyField('ai', draft.ai.apiKeyMasked)}
              </Field>

              <div className="settings-grid2">
                <Field label="最大输出 tokens">
                  <div className="input">
                    <input
                      type="number"
                      value={draft.ai.maxTokens}
                      min={512}
                      max={65536}
                      onChange={(e) => patch('ai', { maxTokens: Number(e.target.value) || 0 })}
                    />
                  </div>
                </Field>
                <Field label="系统提示词文件">
                  <div className="input">
                    <input
                      value={draft.ai.promptFile}
                      onChange={(e) => patch('ai', { promptFile: e.target.value })}
                    />
                  </div>
                </Field>
              </div>
            </section>
          ) : null}

          {section === 'aiImage' ? (
            <section className="panel settings-panel">
              <div className="settings-panel__head">
                <div>
                  <div className="panel__title">AI 生图模型</div>
                  <div className="hint">供生图提示词生成配图使用，未启用时仅输出提示词文本</div>
                </div>
                <Switch
                  label={draft.aiImage.enabled ? '已启用' : '未启用'}
                  checked={draft.aiImage.enabled}
                  onChange={(v) => patch('aiImage', { enabled: v })}
                />
              </div>

              <div className="settings-grid2">
                <Field label="供应商">
                  <Select
                    ariaLabel="生图模型供应商"
                    value={draft.aiImage.provider}
                    onChange={(v) => patch('aiImage', { provider: v })}
                    options={AI_PROVIDERS}
                  />
                </Field>
                <Field label="模型名称">
                  <div className="input">
                    <input
                      value={draft.aiImage.model}
                      placeholder="如 wanx-v1"
                      onChange={(e) => patch('aiImage', { model: e.target.value })}
                    />
                  </div>
                </Field>
              </div>

              <Field label="API Key">{keyField('aiImage', draft.aiImage.apiKeyMasked)}</Field>

              <Field label="默认出图尺寸">
                <Select
                  ariaLabel="默认出图尺寸"
                  value={draft.aiImage.size}
                  onChange={(v) => patch('aiImage', { size: v })}
                  options={IMAGE_SIZES}
                />
              </Field>

              {!draft.aiImage.enabled ? (
                <div className="settings-note">
                  <Icon name="alert" size={14} stroke={1.9} />
                  未启用时，任务中心里「生图」相关任务会以「仅输出提示词」方式完成。
                </div>
              ) : null}
            </section>
          ) : null}

          {section === 'watermark' ? (
            <section className="panel settings-panel">
              <div className="settings-panel__head">
                <div>
                  <div className="panel__title">默认水印</div>
                  <div className="hint">
                    打开「视频水印」时自动带出，保存后对所有人生效，不追溯已提交任务
                  </div>
                </div>
                <div className="wm-set__actions">
                  <button className="btn btn--ghost btn--sm" onClick={resetWatermark}>
                    恢复出厂
                  </button>
                  <button className="btn btn--ghost btn--sm" onClick={saveAsPreset}>
                    另存为方案
                  </button>
                  <button className="btn btn--primary btn--sm" onClick={saveDefaultWatermark}>
                    保存默认
                  </button>
                </div>
              </div>

              <div className="wm-set">
                <div className="wm-set__form">
                  <Switch
                    label="文字水印"
                    desc="叠加在画面上的文字标识"
                    checked={wm.textOn}
                    onChange={(v) => patchWm({ textOn: v })}
                  />
                  {wm.textOn ? (
                    <div className="wm-set__group">
                      <Field label="文字内容">
                        <div className="input input--sm">
                          <input
                            value={wm.text}
                            placeholder="如：健衡学院"
                            onChange={(e) => patchWm({ text: e.target.value })}
                          />
                        </div>
                      </Field>
                      <div className="settings-grid2">
                        <Field label="位置">
                          <div className="wm-set__pos">
                            <div className="pospick pospick--sm" role="group" aria-label="文字水印位置">
                              {POSITIONS.map((p) => (
                                <button
                                  key={p.key}
                                  type="button"
                                  className={`pospick__cell${wm.textPosition === p.key ? ' is-active' : ''}`}
                                  onClick={() => patchWm({ textPosition: p.key })}
                                  aria-label={p.label}
                                  aria-pressed={wm.textPosition === p.key}
                                >
                                  <i />
                                </button>
                              ))}
                            </div>
                            <span className="wm-set__poslabel">{positionLabel(wm.textPosition)}</span>
                          </div>
                        </Field>
                        <Field label="字号">
                          <div className="input input--sm">
                            <input
                              type="number"
                              value={wm.fontSize}
                              min={8}
                              max={200}
                              onChange={(e) =>
                                patchWm({ fontSize: Number(e.target.value) || 0 })
                              }
                            />
                            <span className="input__suffix">px</span>
                          </div>
                        </Field>
                      </div>
                      <div className="settings-grid2">
                        <Field label="颜色">
                          <div className="wm-color">
                            <input
                              type="color"
                              value={wm.fontColor}
                              onChange={(e) => patchWm({ fontColor: e.target.value })}
                              aria-label="文字颜色"
                            />
                            {SWATCHES.map((c) => (
                              <button
                                key={c}
                                type="button"
                                className={`wm-swatch${
                                  wm.fontColor.toUpperCase() === c ? ' is-active' : ''
                                }`}
                                style={{ background: c }}
                                onClick={() => patchWm({ fontColor: c })}
                                aria-label={`使用颜色 ${c}`}
                              />
                            ))}
                          </div>
                        </Field>
                        <Field label="透明度">
                          <div className="wm-range">
                            <input
                              type="range"
                              min={0.1}
                              max={1}
                              step={0.05}
                              value={wm.textOpacity}
                              onChange={(e) => patchWm({ textOpacity: Number(e.target.value) })}
                            />
                            <span className="num">{wm.textOpacity.toFixed(2)}</span>
                          </div>
                        </Field>
                      </div>
                    </div>
                  ) : null}

                  <Switch
                    label="Logo 水印"
                    desc="PNG 透明底效果最佳"
                    checked={wm.logoOn}
                    onChange={(v) => patchWm({ logoOn: v })}
                  />
                  {wm.logoOn ? (
                    <div className="wm-set__group">
                      <Field label="Logo 图片">
                        <div className="wm-logo-pick is-on">
                          <span className="wm-logo-pick__thumb">
                            <Icon name="logo" size={18} stroke={1.7} />
                          </span>
                          <span className="wm-logo-pick__name">
                            {wm.logo ? wm.logo.name : '从素材库选择 Logo（演示占位）'}
                          </span>
                          <button
                            type="button"
                            className="link"
                            onClick={() =>
                              patchWm({
                                logo: wm.logo
                                  ? null
                                  : { name: '健衡学院-logo.png', src: null },
                              })
                            }
                          >
                            {wm.logo ? '清除' : '选择'}
                          </button>
                        </div>
                      </Field>
                      <div className="settings-grid2">
                        <Field label="位置">
                          <div className="wm-set__pos">
                            <div className="pospick pospick--sm" role="group" aria-label="Logo 水印位置">
                              {POSITIONS.map((p) => (
                                <button
                                  key={p.key}
                                  type="button"
                                  className={`pospick__cell${wm.logoPosition === p.key ? ' is-active' : ''}`}
                                  onClick={() => patchWm({ logoPosition: p.key })}
                                  aria-label={p.label}
                                  aria-pressed={wm.logoPosition === p.key}
                                >
                                  <i />
                                </button>
                              ))}
                            </div>
                            <span className="wm-set__poslabel">{positionLabel(wm.logoPosition)}</span>
                          </div>
                        </Field>
                        <Field label="宽度">
                          <div className="input input--sm">
                            <input
                              type="number"
                              value={wm.logoWidth}
                              min={32}
                              max={800}
                              onChange={(e) =>
                                patchWm({ logoWidth: Number(e.target.value) || 0 })
                              }
                            />
                            <span className="input__suffix">px</span>
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
                            value={wm.logoOpacity}
                            onChange={(e) => patchWm({ logoOpacity: Number(e.target.value) })}
                          />
                          <span className="num">{wm.logoOpacity.toFixed(2)}</span>
                        </div>
                      </Field>
                    </div>
                  ) : null}

                  <div className="settings-grid2">
                    <Field label="边距">
                      <div className="input input--sm">
                        <input
                          type="number"
                          value={wm.margin}
                          min={0}
                          max={400}
                          onChange={(e) => patchWm({ margin: Number(e.target.value) || 0 })}
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
                          onChange={(e) => patchWm({ crf: Number(e.target.value) || 20 })}
                        />
                      </div>
                    </Field>
                    <Field label="编码预设">
                      <Select
                        ariaLabel="编码预设"
                        value={wm.preset}
                        onChange={(v) => patchWm({ preset: v })}
                        options={ENCODE_PRESETS.map((p) => ({ key: p, label: p }))}
                      />
                    </Field>
                    <Field label="编码线程" hint="0 表示自动">
                      <div className="input input--sm">
                        <input
                          type="number"
                          value={wm.threads}
                          min={0}
                          max={64}
                          onChange={(e) => patchWm({ threads: Number(e.target.value) || 0 })}
                        />
                      </div>
                    </Field>
                  </div>
                </div>

                <div className="wm-set__preview">
                  <div className="wm-set__canvas">
                    <span className="wm-set__frame-tag">1920 × 1080 · 16:9</span>
                    {wm.textOn && wm.text ? (
                      <span
                        className="wm-set__text"
                        style={{
                          ...anchorStyle(wm.textPosition, Math.max(8, wm.margin / 5)),
                          fontSize: Math.max(11, wm.fontSize / 3.2),
                          color: wm.fontColor,
                          opacity: wm.textOpacity,
                        }}
                      >
                        {wm.text}
                      </span>
                    ) : null}
                    {wm.logoOn && wm.logo ? (
                      <span
                        className="wm-set__logo"
                        style={{
                          ...anchorStyle(wm.logoPosition, Math.max(8, wm.margin / 5)),
                          width: Math.max(28, wm.logoWidth / 5),
                          opacity: wm.logoOpacity,
                        }}
                      >
                        <Icon name="shield" size={12} stroke={2} />
                        健衡
                      </span>
                    ) : null}
                  </div>
                  <div className="hint">预览为效果示意，实际以 ffmpeg 渲染结果为准</div>
                </div>
              </div>

              <div className="preset-title">已保存的方案</div>
              <div className="preset-list">
                {presets.map((p) => (
                  <div className={`preset${p.isDefault ? ' is-on' : ''}`} key={p.id}>
                    <span className="preset__mark">
                      <Icon name="logo" size={16} stroke={1.7} />
                    </span>
                    <div className="preset__main">
                      <div className="preset__name">
                        {p.name}
                        {p.isDefault ? <span className="pill pill--mint">默认</span> : null}
                      </div>
                      <div className="preset__meta">
                        {p.config.textOn
                          ? `文字：${p.config.text} · ${positionLabel(p.config.textPosition)}`
                          : '文字：未启用'}
                        <span className="preset__dot" />
                        {p.config.logoOn
                          ? `Logo：${positionLabel(p.config.logoPosition)}`
                          : 'Logo：未启用'}
                        <span className="preset__dot" />
                        CRF {p.config.crf} · {p.config.preset}
                      </div>
                    </div>
                    <button
                      className="btn btn--ghost btn--sm"
                      disabled={p.isDefault}
                      onClick={() => applyPresetAsDefault(p.id)}
                    >
                      {p.isDefault ? '当前默认' : '设为默认'}
                    </button>
                  </div>
                ))}
              </div>

              <div className="settings-note">
                <Icon name="alert" size={14} stroke={1.9} />
                默认方案随素材尺寸等比缩放，字号与边距按 1920 宽基准换算；修改后需点「保存默认」或右上「保存更改」写库。
              </div>
            </section>
          ) : null}

          {section === 'lexicon' ? (
            <section className="panel settings-panel">
              <div className="settings-panel__head">
                <div>
                  <div className="panel__title">词库</div>
                  <div className="hint">文章编写时用来命中搜索意图簇，决定关键词的写入位置</div>
                </div>
              </div>

              <div className="settings-grid2">
                <Field label="标签最大长度" hint="超出长度的词条会被截断">
                  <div className="input">
                    <input
                      type="number"
                      value={draft.lexicon.tagMaxLen}
                      min={2}
                      max={32}
                      onChange={(e) => patch('lexicon', { tagMaxLen: Number(e.target.value) || 0 })}
                    />
                    <span className="input__suffix">字</span>
                  </div>
                </Field>
                <Field label="补采超时">
                  <div className="input">
                    <input
                      type="number"
                      value={draft.lexicon.collectTimeout}
                      min={30}
                      max={3600}
                      onChange={(e) =>
                        patch('lexicon', { collectTimeout: Number(e.target.value) || 0 })
                      }
                    />
                    <span className="input__suffix">秒</span>
                  </div>
                </Field>
              </div>

              <Field label="词库数据目录">
                <div className="input">
                  <input
                    value={draft.lexicon.dataDir}
                    onChange={(e) => patch('lexicon', { dataDir: e.target.value })}
                  />
                </div>
              </Field>

              <div className="settings-note">
                <Icon name="checkCircle" size={14} stroke={1.9} />
                当前词库 5 个意图簇 · 最近更新 10-20 · 上次补采 found=12 ok=8 fail=1 skipped=3
              </div>
            </section>
          ) : null}

          {section === 'worker' ? (
            <section className="panel settings-panel">
              <div className="settings-panel__head">
                <div>
                  <div className="panel__title">任务队列</div>
                  <div className="hint">视频与文本分别独立消费，避免长任务阻塞文案生成</div>
                </div>
              </div>

              <div className="settings-grid2">
                <Field label="视频 worker 数">
                  <div className="input">
                    <input
                      type="number"
                      value={draft.worker.videoWorkers}
                      min={1}
                      max={16}
                      onChange={(e) => patch('worker', { videoWorkers: Number(e.target.value) || 1 })}
                    />
                    <span className="input__suffix">个</span>
                  </div>
                </Field>
                <Field label="文本 worker 数">
                  <div className="input">
                    <input
                      type="number"
                      value={draft.worker.textWorkers}
                      min={1}
                      max={32}
                      onChange={(e) => patch('worker', { textWorkers: Number(e.target.value) || 1 })}
                    />
                    <span className="input__suffix">个</span>
                  </div>
                </Field>
                <Field label="认领超时" hint="超时未心跳的任务会被重新入队">
                  <div className="input">
                    <input
                      type="number"
                      value={draft.worker.claimTimeout}
                      min={10}
                      max={600}
                      onChange={(e) => patch('worker', { claimTimeout: Number(e.target.value) || 0 })}
                    />
                    <span className="input__suffix">秒</span>
                  </div>
                </Field>
                <Field label="最大重试次数">
                  <div className="input">
                    <input
                      type="number"
                      value={draft.worker.maxRetry}
                      min={0}
                      max={10}
                      onChange={(e) => patch('worker', { maxRetry: Number(e.target.value) || 0 })}
                    />
                    <span className="input__suffix">次</span>
                  </div>
                </Field>
              </div>

              <div className="settings-note">
                <Icon name="cpu" size={14} stroke={1.9} />
                运行中 1 个 · 待处理 2 个 · 节点 worker-1 于 13:41:20 心跳
              </div>
            </section>
          ) : null}

          {section === 'storage' ? (
            <section className="panel settings-panel">
              <div className="settings-panel__head">
                <div>
                  <div className="panel__title">存储</div>
                  <div className="hint">素材原件与处理结果统一存放，路径按年/月分目录</div>
                </div>
              </div>

              <Field label="存储后端">
                <Select
                  ariaLabel="存储后端"
                  value={draft.storage.backend}
                  onChange={(v) => patch('storage', { backend: v })}
                  options={STORAGE_BACKENDS}
                />
              </Field>

              <Field label="根目录">
                <div className="input">
                  <input
                    value={draft.storage.root}
                    onChange={(e) => patch('storage', { root: e.target.value })}
                  />
                </div>
              </Field>

              <Field label="配额上限" hint="超出后拒绝新上传，任务结果仍可下载">
                <div className="input">
                  <input
                    type="number"
                    value={draft.storage.quota}
                    min={10}
                    max={4096}
                    onChange={(e) => patch('storage', { quota: Number(e.target.value) || 0 })}
                  />
                  <span className="input__suffix">GB</span>
                </div>
              </Field>

              <div className="storage settings-storage">
                <div>
                  <div className="storage__label">当前用量</div>
                  <div className="storage__value">136 GB / {draft.storage.quota} GB</div>
                </div>
                <div className="storage__right">
                  <div className="storage__track">
                    <div className="storage__fill" style={{ width: '68%' }} />
                  </div>
                  <span className="storage__pct">68%</span>
                </div>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
