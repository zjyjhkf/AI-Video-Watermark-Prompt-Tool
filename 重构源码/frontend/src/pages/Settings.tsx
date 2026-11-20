/** 系统设置：AI 模型 / 生图模型 / 默认水印 / 词库 / 任务队列 / 存储；admin 与 super 等价可访问。 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../components/Icon';
import { Field, Select, Switch } from '../components/ui';
import { api, ApiError } from '../lib/api';
import {
  AI_PROVIDERS,
  DEFAULT_WATERMARK,
  ENCODE_PRESETS,
  POSITIONS,
  SWATCHES,
  fmtSize,
  positionLabel,
  type WatermarkConfig,
} from '../lib/constants';
import type { PageProps } from '../lib/props';
import type { ServiceStatus, SystemSettings, WatermarkPreset } from '../lib/types';

const SECTIONS = [
  { key: 'ai', label: 'AI 文案模型', icon: 'cpu' },
  { key: 'aiImage', label: 'AI 生图模型', icon: 'image' },
  { key: 'watermark', label: '默认水印', icon: 'logo' },
  { key: 'lexicon', label: '词库', icon: 'database' },
  { key: 'worker', label: '任务队列', icon: 'sliders' },
  { key: 'storage', label: '存储', icon: 'folder' },
];

const IMAGE_SIZES = [
  { key: '1024x1024', label: '1024 × 1024（方图）' },
  { key: '1024x1536', label: '1024 × 1536（竖图）' },
  { key: '1536x1024', label: '1536 × 1024（横图）' },
];

/** 九宫格锚点 → 预览用绝对定位 */
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

interface Draft {
  ai: SystemSettings['ai'];
  ai_image: SystemSettings['ai_image'];
  worker: SystemSettings['worker'];
  lexicon: SystemSettings['lexicon'];
  storage: SystemSettings['storage'];
}

const toDraft = (s: SystemSettings): Draft => ({
  ai: { ...s.ai },
  ai_image: { ...s.ai_image },
  worker: { ...s.worker },
  lexicon: { ...s.lexicon },
  storage: { ...s.storage },
});

export default function Settings({ user, toast }: PageProps) {
  const [section, setSection] = useState('ai');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [baseline, setBaseline] = useState<Draft | null>(null);
  const [wm, setWm] = useState<WatermarkConfig>(DEFAULT_WATERMARK);
  const [wmBaseline, setWmBaseline] = useState<WatermarkConfig>(DEFAULT_WATERMARK);
  const [presets, setPresets] = useState<WatermarkPreset[]>([]);
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [keys, setKeys] = useState({ ai: '', ai_image: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const wmDirtyRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, presetsList, st] = await Promise.all([
        api.settings(),
        api.presets().catch(() => [] as WatermarkPreset[]),
        api.status().catch(() => null),
      ]);
      const d = toDraft(s);
      setDraft(d);
      setBaseline(JSON.parse(JSON.stringify(d)) as Draft);
      setWm({ ...DEFAULT_WATERMARK, ...s.watermark_default });
      setWmBaseline({ ...DEFAULT_WATERMARK, ...s.watermark_default });
      setPresets(presetsList);
      setStatus(st);
      wmDirtyRef.current = false;
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '设置加载失败', 'warn');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const patch = <K extends keyof Draft>(group: K, next: Partial<Draft[K]>) => {
    setDraft((d) => (d ? { ...d, [group]: { ...d[group], ...next } } : d));
  };

  const patchWm = (next: Partial<WatermarkConfig>) => {
    setWm((cur) => ({ ...cur, ...next }));
    wmDirtyRef.current = true;
  };

  const dirty = useMemo(() => {
    if (!draft || !baseline) return false;
    return JSON.stringify(draft) !== JSON.stringify(baseline);
  }, [draft, baseline]);

  const wmDirty = JSON.stringify(wm) !== JSON.stringify(wmBaseline);

  const save = async () => {
    if (!draft) return;
    if (draft.ai.max_tokens && Number(draft.ai.max_tokens) < 1024) {
      toast('最大输出 tokens 建议不低于 1024', 'warn');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        ai: { ...draft.ai, ...(keys.ai ? { api_key: keys.ai } : {}) },
        ai_image: { ...draft.ai_image, ...(keys.ai_image ? { api_key: keys.ai_image } : {}) },
        worker: draft.worker,
        lexicon: draft.lexicon,
      };
      const s = await api.patchSettings(payload);
      const d = toDraft(s);
      setDraft(d);
      setBaseline(JSON.parse(JSON.stringify(d)) as Draft);
      setKeys({ ai: '', ai_image: '' });
      toast('设置已保存，热加载生效');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '保存失败', 'warn');
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    if (!baseline) return;
    setDraft(JSON.parse(JSON.stringify(baseline)) as Draft);
    setKeys({ ai: '', ai_image: '' });
    toast('已还原为上次保存的设置');
  };

  const resetWatermark = async () => {
    try {
      const w = await api.resetWatermarkDefault();
      setWm({ ...DEFAULT_WATERMARK, ...w });
      setWmBaseline({ ...DEFAULT_WATERMARK, ...w });
      await load();
      toast('已恢复出厂默认水印');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '恢复失败', 'warn');
    }
  };

  const saveDefaultWatermark = async () => {
    if (!wm.text_on && !wm.logo_on) {
      toast('文字与 Logo 至少启用一项', 'warn');
      return;
    }
    if (wm.text_on && !wm.text.trim()) {
      toast('请填写文字水印内容', 'warn');
      return;
    }
    if (wm.logo_on && !wm.logo_asset_id) {
      toast('请先在视频水印页上传 Logo 并选用', 'warn');
      return;
    }
    try {
      const w = await api.saveWatermarkDefault(wm);
      setWm({ ...DEFAULT_WATERMARK, ...w });
      setWmBaseline({ ...DEFAULT_WATERMARK, ...w });
      wmDirtyRef.current = false;
      toast('默认水印已更新，新打开的视频水印页生效');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '保存失败', 'warn');
    }
  };

  const saveAsPreset = async () => {
    const name = `自定义方案 · ${new Date().toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
    try {
      const created = await api.createPreset(name, wm, false);
      setPresets((list) => [created, ...list]);
      toast(`已另存为方案「${name}」，可在视频水印页选用`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '另存失败', 'warn');
    }
  };

  const applyPresetAsDefault = async (p: WatermarkPreset) => {
    try {
      await api.createPreset(p.name, p.config, true);
      setWm({ ...DEFAULT_WATERMARK, ...p.config });
      setWmBaseline({ ...DEFAULT_WATERMARK, ...p.config });
      const list = await api.presets();
      setPresets(list);
      toast(`已将「${p.name}」设为默认方案`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '操作失败', 'warn');
    }
  };

  const keyField = (group: 'ai' | 'ai_image', masked: string | null | undefined) => (
    <div className="input">
      <input
        type={reveal[group] ? 'text' : 'password'}
        value={keys[group]}
        placeholder={masked || 'sk-...（留空则不修改已存密钥）'}
        onChange={(e) => setKeys((k) => ({ ...k, [group]: e.target.value }))}
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

  if (loading || !draft) {
    return (
      <div className="page page--fill page--auto">
        <header className="head">
          <div>
            <h1 className="head__title">系统设置</h1>
            <div className="head__sub">正在读取全局配置…</div>
          </div>
        </header>
        <div className="settings-layout">
          <div className="panel" style={{ padding: 24 }}>
            <span className="skeleton" style={{ display: 'block', height: 14, width: '40%' }} />
            <span
              className="skeleton"
              style={{ display: 'block', height: 14, width: '70%', marginTop: 12 }}
            />
            <span
              className="skeleton"
              style={{ display: 'block', height: 14, width: '55%', marginTop: 12 }}
            />
          </div>
        </div>
      </div>
    );
  }

  const storage = draft.storage;

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
          <button className="btn btn--primary" onClick={save} disabled={saving || !dirty}>
            <Icon name="check" size={15} stroke={2.2} />
            {saving ? '保存中…' : '保存更改'}
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
            仅{user.role === 'super' ? '超级管理员' : '管理员'}及以上可访问
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
                <span className={`pill ${draft.ai.api_key_masked ? 'pill--mint' : 'pill--amber'}`}>
                  {draft.ai.api_key_masked ? '已配置' : '未配置 · 走本地模板'}
                </span>
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
                    value={draft.ai.base_url}
                    placeholder="https://api.deepseek.com/v1"
                    onChange={(e) => patch('ai', { base_url: e.target.value })}
                  />
                </div>
              </Field>

              <Field
                label="API Key"
                hint={
                  draft.ai.api_key_masked
                    ? `已存密钥 ${draft.ai.api_key_masked}，留空表示不修改`
                    : '未配置时使用本地模板生成，不会外发请求'
                }
              >
                {keyField('ai', draft.ai.api_key_masked)}
              </Field>

              <div className="settings-grid2">
                <Field label="最大输出 tokens">
                  <div className="input">
                    <input
                      type="number"
                      value={draft.ai.max_tokens}
                      min={512}
                      max={65536}
                      onChange={(e) => patch('ai', { max_tokens: Number(e.target.value) || 0 })}
                    />
                  </div>
                </Field>
                <Field label="系统提示词文件">
                  <div className="input">
                    <input
                      value={draft.ai.system_prompt_file || ''}
                      placeholder="prompts/article_system.md"
                      onChange={(e) => patch('ai', { system_prompt_file: e.target.value })}
                    />
                  </div>
                </Field>
              </div>

              <div className="settings-note">
                <Icon name="alert" size={14} stroke={1.9} />
                未配置 API Key 时，生成任务使用内置模板（result.engine = local-template），不影响流程完整性。
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
                  label={draft.ai_image.enabled ? '已启用' : '未启用'}
                  checked={draft.ai_image.enabled}
                  onChange={(v) => patch('ai_image', { enabled: v })}
                />
              </div>

              <div className="settings-grid2">
                <Field label="供应商">
                  <Select
                    ariaLabel="生图模型供应商"
                    value={draft.ai_image.provider}
                    onChange={(v) => patch('ai_image', { provider: v })}
                    options={AI_PROVIDERS}
                  />
                </Field>
                <Field label="模型名称">
                  <div className="input">
                    <input
                      value={draft.ai_image.model}
                      placeholder="如 wanx-v1"
                      onChange={(e) => patch('ai_image', { model: e.target.value })}
                    />
                  </div>
                </Field>
              </div>

              <Field label="API Key">{keyField('ai_image', draft.ai_image.api_key_masked)}</Field>

              <Field label="默认出图尺寸">
                <Select
                  ariaLabel="默认出图尺寸"
                  value={draft.ai_image.size}
                  onChange={(v) => patch('ai_image', { size: v })}
                  options={IMAGE_SIZES}
                />
              </Field>

              {!draft.ai_image.enabled ? (
                <div className="settings-note">
                  <Icon name="alert" size={14} stroke={1.9} />
                  未启用时，生图相关任务只输出提示词文本，不产生图片素材。
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
                  <button
                    className="btn btn--primary btn--sm"
                    onClick={saveDefaultWatermark}
                    disabled={!wmDirty}
                  >
                    保存默认
                  </button>
                </div>
              </div>

              <div className="wm-set">
                <div className="wm-set__form">
                  <Switch
                    label="文字水印"
                    desc="叠加在画面上的文字标识"
                    checked={wm.text_on}
                    onChange={(v) => patchWm({ text_on: v })}
                  />
                  {wm.text_on ? (
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
                                  className={`pospick__cell${wm.text_position === p.key ? ' is-active' : ''}`}
                                  onClick={() => patchWm({ text_position: p.key })}
                                  aria-label={p.label}
                                  aria-pressed={wm.text_position === p.key}
                                >
                                  <i />
                                </button>
                              ))}
                            </div>
                            <span className="wm-set__poslabel">{positionLabel(wm.text_position)}</span>
                          </div>
                        </Field>
                        <Field label="字号">
                          <div className="input input--sm">
                            <input
                              type="number"
                              value={wm.font_size}
                              min={8}
                              max={200}
                              onChange={(e) => patchWm({ font_size: Number(e.target.value) || 0 })}
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
                              value={wm.font_color}
                              onChange={(e) => patchWm({ font_color: e.target.value })}
                              aria-label="文字颜色"
                            />
                            {SWATCHES.map((c) => (
                              <button
                                key={c}
                                type="button"
                                className={`wm-swatch${
                                  wm.font_color.toUpperCase() === c ? ' is-active' : ''
                                }`}
                                style={{ background: c }}
                                onClick={() => patchWm({ font_color: c })}
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
                              value={wm.text_opacity}
                              onChange={(e) => patchWm({ text_opacity: Number(e.target.value) })}
                            />
                            <span className="num">{wm.text_opacity.toFixed(2)}</span>
                          </div>
                        </Field>
                      </div>
                    </div>
                  ) : null}

                  <Switch
                    label="Logo 水印"
                    desc="PNG 透明底效果最佳"
                    checked={wm.logo_on}
                    onChange={(v) => patchWm({ logo_on: v })}
                  />
                  {wm.logo_on ? (
                    <div className="wm-set__group">
                      <Field label="Logo 素材 ID" hint="在视频水印页上传后可复制素材 ID">
                        <div className="input input--sm">
                          <input
                            value={wm.logo_asset_id || ''}
                            placeholder="a_xxxxxxxx"
                            onChange={(e) => patchWm({ logo_asset_id: e.target.value || null })}
                          />
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
                                  className={`pospick__cell${wm.logo_position === p.key ? ' is-active' : ''}`}
                                  onClick={() => patchWm({ logo_position: p.key })}
                                  aria-label={p.label}
                                  aria-pressed={wm.logo_position === p.key}
                                >
                                  <i />
                                </button>
                              ))}
                            </div>
                            <span className="wm-set__poslabel">{positionLabel(wm.logo_position)}</span>
                          </div>
                        </Field>
                        <Field label="宽度">
                          <div className="input input--sm">
                            <input
                              type="number"
                              value={wm.logo_width}
                              min={32}
                              max={800}
                              onChange={(e) => patchWm({ logo_width: Number(e.target.value) || 0 })}
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
                            value={wm.logo_opacity}
                            onChange={(e) => patchWm({ logo_opacity: Number(e.target.value) })}
                          />
                          <span className="num">{wm.logo_opacity.toFixed(2)}</span>
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
                    {wm.text_on && wm.text ? (
                      <span
                        className="wm-set__text"
                        style={{
                          ...anchorStyle(wm.text_position, Math.max(8, wm.margin / 5)),
                          fontSize: Math.max(11, wm.font_size / 3.2),
                          color: wm.font_color,
                          opacity: wm.text_opacity,
                        }}
                      >
                        {wm.text}
                      </span>
                    ) : null}
                    {wm.logo_on && wm.logo_asset_id ? (
                      <span
                        className="wm-set__logo"
                        style={{
                          ...anchorStyle(wm.logo_position, Math.max(8, wm.margin / 5)),
                          width: Math.max(28, wm.logo_width / 5),
                          opacity: wm.logo_opacity,
                        }}
                      >
                        <Icon name="shield" size={12} stroke={2} />
                        Logo
                      </span>
                    ) : null}
                  </div>
                  <div className="hint">预览为效果示意，实际以 ffmpeg 渲染结果为准</div>
                </div>
              </div>

              <div className="preset-title">已保存的方案</div>
              <div className="preset-list">
                {presets.length ? (
                  presets.map((p) => (
                    <div className={`preset${p.is_default ? ' is-on' : ''}`} key={p.id}>
                      <span className="preset__mark">
                        <Icon name="logo" size={16} stroke={1.7} />
                      </span>
                      <div className="preset__main">
                        <div className="preset__name">
                          {p.name}
                          {p.is_default ? <span className="pill pill--mint">默认</span> : null}
                        </div>
                        <div className="preset__meta">
                          {p.config.text_on
                            ? `文字：${p.config.text} · ${positionLabel(p.config.text_position)}`
                            : '文字：未启用'}
                          <span className="preset__dot" />
                          {p.config.logo_on
                            ? `Logo：${positionLabel(p.config.logo_position)}`
                            : 'Logo：未启用'}
                          <span className="preset__dot" />
                          CRF {p.config.crf} · {p.config.preset}
                        </div>
                      </div>
                      <button
                        className="btn btn--ghost btn--sm"
                        disabled={p.is_default}
                        onClick={() => applyPresetAsDefault(p)}
                      >
                        {p.is_default ? '当前默认' : '设为默认'}
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="hint">还没有保存过方案，可在视频水印页点击「保存方案」创建。</div>
                )}
              </div>

              <div className="settings-note">
                <Icon name="alert" size={14} stroke={1.9} />
                默认方案随素材尺寸等比缩放，字号与边距按 1920 宽基准换算；修改后需点「保存默认」写库。
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
                      value={draft.lexicon.tag_max_len}
                      min={2}
                      max={32}
                      onChange={(e) => patch('lexicon', { tag_max_len: Number(e.target.value) || 0 })}
                    />
                    <span className="input__suffix">字</span>
                  </div>
                </Field>
                <Field label="补采超时">
                  <div className="input">
                    <input
                      type="number"
                      value={draft.lexicon.collect_timeout_seconds}
                      min={30}
                      max={3600}
                      onChange={(e) =>
                        patch('lexicon', { collect_timeout_seconds: Number(e.target.value) || 0 })
                      }
                    />
                    <span className="input__suffix">秒</span>
                  </div>
                </Field>
              </div>

              <div className="settings-note">
                <Icon name="checkCircle" size={14} stroke={1.9} />
                词库命中情况可在「文章编写」页输入关键词实时查看；未命中时会按策略决定是否补采。
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
                      value={draft.worker.video_workers}
                      min={1}
                      max={16}
                      onChange={(e) => patch('worker', { video_workers: Number(e.target.value) || 1 })}
                    />
                    <span className="input__suffix">个</span>
                  </div>
                </Field>
                <Field label="文本 worker 数">
                  <div className="input">
                    <input
                      type="number"
                      value={draft.worker.text_workers}
                      min={1}
                      max={32}
                      onChange={(e) => patch('worker', { text_workers: Number(e.target.value) || 1 })}
                    />
                    <span className="input__suffix">个</span>
                  </div>
                </Field>
                <Field label="认领超时" hint="超时未心跳的任务会被重新入队">
                  <div className="input">
                    <input
                      type="number"
                      value={draft.worker.claim_timeout_minutes}
                      min={1}
                      max={120}
                      onChange={(e) =>
                        patch('worker', { claim_timeout_minutes: Number(e.target.value) || 0 })
                      }
                    />
                    <span className="input__suffix">分钟</span>
                  </div>
                </Field>
              </div>

              <div className="settings-note">
                <Icon name="cpu" size={14} stroke={1.9} />
                {status
                  ? `服务 ${status.service_name} · ${status.state} · 运行中 ${status.running} 个 · 待处理 ${status.pending} 个 · 心跳 ${new Date(status.heartbeat_at).toLocaleTimeString('zh-CN')}`
                  : '服务状态读取中…'}
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

              <Field label="存储后端" hint="由服务端环境变量 STORAGE_BACKEND 决定">
                <div className="input">
                  <input value={storage.backend} readOnly />
                </div>
              </Field>

              <Field label="配额上限" hint="超出后拒绝新上传，任务结果仍可下载">
                <div className="input">
                  <input value={fmtSize(storage.quota_bytes)} readOnly />
                </div>
              </Field>

              <div className="storage settings-storage">
                <div>
                  <div className="storage__label">当前用量</div>
                  <div className="storage__value">
                    {fmtSize(storage.used_bytes || 0)} / {fmtSize(storage.quota_bytes)}
                  </div>
                </div>
                <div className="storage__right">
                  <div className="storage__track">
                    <div
                      className="storage__fill"
                      style={{ width: `${Math.min(100, storage.percent || 0)}%` }}
                    />
                  </div>
                  <span className="storage__pct">{Math.round(storage.percent || 0)}%</span>
                </div>
              </div>

              <div className="settings-note">
                <Icon name={storage.ffmpeg_available ? 'checkCircle' : 'alert'} size={14} stroke={1.9} />
                {storage.ffmpeg_available
                  ? '已检测到 ffmpeg，视频水印将真实渲染。'
                  : '未检测到 ffmpeg，视频任务会降级为复制源文件（engine=copy），需安装 ffmpeg 后重启服务。'}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
