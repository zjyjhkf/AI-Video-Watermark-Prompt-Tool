import React, { useMemo, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Empty, Field, Seg, Select } from '../components/ui.jsx';
import {
  AUDIENCES,
  CONTENT_TYPES,
  KEYWORD_STRATEGIES,
  PLATFORMS,
  articleDefaults,
  labelOf,
  sampleArticle,
} from '../data/mock.js';

export default function ArticleEditor({ onCreateTask, onSaveDraft, onNavigate, toast }) {
  const [form, setForm] = useState({ ...articleDefaults });
  const [refImages, setRefImages] = useState([]);
  const [article, setArticle] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [errors, setErrors] = useState({});
  const [savedAt, setSavedAt] = useState('10 分钟前');
  const [draftAssetId, setDraftAssetId] = useState(null);
  const [savedToAssets, setSavedToAssets] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const imgRef = useRef(null);
  const exportRef = useRef(null);

  const patch = (next) => setForm((f) => ({ ...f, ...next }));

  const words = useMemo(() => {
    if (!article) return 0;
    return article.body.replace(/\s/g, '').length;
  }, [article]);

  const covered = article ? article.coverage.filter((c) => c.ok).length : 0;

  const addImages = (files) => {
    const list = Array.from(files).slice(0, 3 - refImages.length);
    const next = list.map((f) => ({
      id: `${f.name}-${Math.random().toString(36).slice(2, 6)}`,
      name: f.name,
      src: URL.createObjectURL(f),
    }));
    setRefImages((prev) => [...prev, ...next].slice(0, 3));
  };

  const generate = () => {
    if (!form.topic.trim()) {
      setErrors({ topic: '请填写主题 / 产品' });
      return;
    }
    setErrors({});
    setGenerating(true);
    const platformLabel = labelOf(PLATFORMS, form.platform);
    const draft = sampleArticle(form.topic.trim(), platformLabel);

    onCreateTask({
      name: `${form.topic.trim()} · ${platformLabel}文案`,
      type: 'article',
      detail: {
        platform: platformLabel,
        contentType: labelOf(CONTENT_TYPES, form.contentType),
        audience: labelOf(AUDIENCES, form.audience),
        keyword: form.keyword || '未填写',
        strategy: labelOf(KEYWORD_STRATEGIES, form.strategy),
      },
      result: { article: draft },
    });

    setTimeout(() => {
      setArticle(draft);
      setGenerating(false);
      toast('文章已生成，可直接编辑');
    }, 1600);
  };

  /* 保存草稿：把当前编辑器内容序列化为 Markdown，落到素材库 */
  const buildMarkdown = () => {
    const head = [
      '---',
      `platform: ${form.platform}`,
      `content_type: ${form.contentType}`,
      `audience: ${form.audience}`,
      `keyword: ${form.keyword || ''}`,
      '---',
      '',
    ];
    if (!article) {
      return [
        ...head,
        `# ${form.topic || '未命名需求'} · 需求草稿`,
        '',
        '## 需求',
        `- 平台：${labelOf(PLATFORMS, form.platform)}`,
        `- 内容类型：${labelOf(CONTENT_TYPES, form.contentType)}`,
        `- 受众档位：${labelOf(AUDIENCES, form.audience)}`,
        `- 核心卖点：${form.sellingPoint || '—'}`,
        `- 字数：${form.wordCount || '—'}`,
        `- 补充要求：${form.extra || '—'}`,
        `- 搜索关键词：${form.keyword || '—'}（${labelOf(KEYWORD_STRATEGIES, form.strategy)}）`,
      ].join('\n');
    }
    return [
      ...head,
      `# ${article.title}`,
      '',
      article.body,
      '',
      article.tags.join(' '),
      '',
      '## 合规自检',
      article.compliance,
      '',
      '## 搜索覆盖自检',
      ...article.coverage.map(
        (c) => `- ${c.word}｜${c.len} 字｜${c.where}｜${c.ok ? '已覆盖' : '未覆盖'}`
      ),
    ].join('\n');
  };

  const saveDraft = () => {
    if (!article && !form.topic.trim()) {
      toast('请先填写主题，或先生成文章', 'warn');
      return;
    }
    const base = article ? article.title : form.topic.trim();
    const id = onSaveDraft(
      {
        name: `${base.slice(0, 22)} · 草稿`,
        content: buildMarkdown(),
        folder: '草稿 / 文章',
      },
      draftAssetId
    );
    setDraftAssetId(id);
    setSavedAt('刚刚');
    setSavedToAssets(true);
    toast(draftAssetId ? '草稿已更新到素材库' : '草稿已保存到素材库');
  };

  const exportText = (format) => {
    setExportOpen(false);
    if (!article) {
      toast('请先生成文章', 'warn');
      return;
    }
    const md = [
      `# ${article.title}`,
      '',
      article.body,
      '',
      article.tags.join(' '),
      '',
      '## 合规自检',
      article.compliance,
      '',
      '## 搜索覆盖自检',
      ...article.coverage.map(
        (c) => `- ${c.word}｜${c.len} 字｜${c.where}｜${c.ok ? '已覆盖' : '未覆盖'}`
      ),
    ].join('\n');
    const content = format === 'md' ? md : md.replace(/[#*`]/g, '');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${article.title.slice(0, 20)}.${format === 'md' ? 'md' : 'txt'}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
    toast(`已导出 ${format === 'md' ? 'Markdown' : '纯文本'}`);
  };

  return (
    <div className="page page--fill">
      <header className="head">
        <div>
          <h1 className="head__title">文章编写</h1>
          <div className="head__sub">结构化需求 + 搜索关键词 → 分节成稿，带合规与覆盖自检</div>
        </div>
        <div className="head__actions">
          <button className="btn btn--ghost" onClick={saveDraft}>
            <Icon name="doc" size={15} stroke={1.9} />
            保存草稿
          </button>
          <div className="menu-wrap" ref={exportRef}>
            <button className="btn btn--ghost" onClick={() => setExportOpen((v) => !v)}>
              <Icon name="download" size={15} stroke={1.9} />
              导出
              <Icon name="chevronDown" size={13} stroke={2} />
            </button>
            {exportOpen ? (
              <div className="menu menu--static">
                <button className="menu__item" onClick={() => exportText('md')}>
                  Markdown（.md）
                </button>
                <button className="menu__item" onClick={() => exportText('txt')}>
                  纯文本（.txt）
                </button>
              </div>
            ) : null}
          </div>
          <button className="btn btn--primary" onClick={generate} disabled={generating}>
            <Icon name="wand" size={16} stroke={1.8} />
            {generating ? '生成中…' : article ? '重新生成' : '生成文章'}
          </button>
        </div>
      </header>

      <div className="editor">
        <aside className="article-form">
          <div className="panel article-form__inner">
            <div className="panel__title">需求输入</div>

            <Field label="平台">
              <Seg
                value={form.platform}
                onChange={(v) => patch({ platform: v })}
                options={PLATFORMS}
                columns={2}
              />
            </Field>

            <Field label="内容类型">
              <Select
                ariaLabel="内容类型"
                value={form.contentType}
                onChange={(v) => patch({ contentType: v })}
                options={CONTENT_TYPES}
              />
            </Field>

            <Field label="受众档位">
              <Seg
                value={form.audience}
                onChange={(v) => patch({ audience: v })}
                options={AUDIENCES}
              />
            </Field>

            <Field label="主题 / 产品" error={errors.topic}>
              <div className="input input--sm">
                <input
                  value={form.topic}
                  placeholder="如：气压靴"
                  onChange={(e) => {
                    patch({ topic: e.target.value });
                    setErrors({});
                  }}
                />
              </div>
            </Field>

            <Field label="核心卖点">
              <div className="input input--sm">
                <input
                  value={form.sellingPoint}
                  placeholder="一句话说清差异点"
                  onChange={(e) => patch({ sellingPoint: e.target.value })}
                />
              </div>
            </Field>

            <Field label="字数">
              <div className="input input--sm">
                <input
                  value={form.wordCount}
                  placeholder="如：400 字以内"
                  onChange={(e) => patch({ wordCount: e.target.value })}
                />
              </div>
            </Field>

            <Field label="补充要求">
              <textarea
                className="textarea"
                rows={3}
                value={form.extra}
                placeholder="也可直接粘一段自由文本需求"
                onChange={(e) => patch({ extra: e.target.value })}
              />
            </Field>

            <Field label="参考图" hint="可选，最多 3 张">
              <div className="refs">
                {refImages.map((img) => (
                  <div className="refs__item" key={img.id}>
                    <img src={img.src} alt={img.name} />
                    <button
                      type="button"
                      className="refs__x"
                      aria-label="移除参考图"
                      onClick={() => setRefImages((l) => l.filter((x) => x.id !== img.id))}
                    >
                      <Icon name="close" size={11} stroke={2.2} />
                    </button>
                  </div>
                ))}
                {refImages.length < 3 ? (
                  <button className="refs__add" onClick={() => imgRef.current?.click()}>
                    <Icon name="plus" size={16} stroke={2} />
                  </button>
                ) : null}
                <input
                  ref={imgRef}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(e) => {
                    addImages(e.target.files);
                    e.target.value = '';
                  }}
                />
              </div>
            </Field>

            <Field label="搜索关键词">
              <div className="input input--sm">
                <Icon name="search" size={14} style={{ color: '#a6c0bb' }} />
                <input
                  value={form.keyword}
                  placeholder="命中词库后自动组织写作任务包"
                  onChange={(e) => patch({ keyword: e.target.value })}
                />
              </div>
            </Field>

            <Field label="词库策略">
              <Select
                ariaLabel="词库策略"
                value={form.strategy}
                onChange={(v) => patch({ strategy: v })}
                options={KEYWORD_STRATEGIES}
              />
            </Field>

            {form.keyword ? (
              <div className="lexicon">
                <Icon name="checkCircle" size={13} stroke={1.8} />
                词库命中「{form.keyword}」· 5 个意图簇 · 更新于 10-20
              </div>
            ) : null}
          </div>
        </aside>

        <div className="article-out">
          {!article ? (
            <div className="article-out__empty">
              <Empty
                icon="doc"
                title={generating ? '正在生成…' : '还没有生成结果'}
                sub={
                  generating
                    ? '正在组装提示词、查询词库并调用模型'
                    : '填写左侧需求后，点击右上角「生成文章」'
                }
              >
                {generating ? (
                  <div className="skeleton">
                    <i />
                    <i />
                    <i />
                  </div>
                ) : null}
              </Empty>
            </div>
          ) : (
            <div className="article-out__scroll">
              <div className="article-head">
                <div>
                  <div className="article-head__label">生成结果</div>
                  <div className="article-head__meta">
                    {article.platform} · {labelOf(CONTENT_TYPES, form.contentType)} ·
                    <span className="num"> {words}</span> 字 · 保存于 {savedAt}
                    {savedToAssets ? (
                      <button
                        type="button"
                        className="meta-link"
                        onClick={() => onNavigate('assets', 'draft')}
                      >
                        已存入素材库
                        <Icon name="arrowUpRight" size={11} stroke={2} />
                      </button>
                    ) : null}
                  </div>
                </div>
                <span className="pill pill--mint">已生成</span>
              </div>

              <section className="art-sec">
                <div className="art-sec__label">【标题】</div>
                <input
                  className="art-title"
                  value={article.title}
                  onChange={(e) => setArticle({ ...article, title: e.target.value })}
                />
              </section>

              <section className="art-sec">
                <div className="art-sec__label">【正文】</div>
                <textarea
                  className="art-body"
                  value={article.body}
                  onChange={(e) => setArticle({ ...article, body: e.target.value })}
                />
              </section>

              <section className="art-sec">
                <div className="art-sec__label">【标签 / 话题】</div>
                <div className="tags">
                  {article.tags.map((t) => (
                    <span className="tag" key={t}>
                      {t}
                      <button
                        type="button"
                        aria-label={`移除 ${t}`}
                        onClick={() =>
                          setArticle({ ...article, tags: article.tags.filter((x) => x !== t) })
                        }
                      >
                        <Icon name="close" size={10} stroke={2.4} />
                      </button>
                    </span>
                  ))}
                  <input
                    className="tags__input"
                    value={tagInput}
                    placeholder="+ 添加标签"
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter' || !tagInput.trim()) return;
                      e.preventDefault();
                      const tag = tagInput.trim().startsWith('#') ? tagInput.trim() : `#${tagInput.trim()}`;
                      setArticle({ ...article, tags: [...article.tags, tag] });
                      setTagInput('');
                    }}
                  />
                </div>
              </section>

              <section className="art-sec">
                <div className="art-sec__label">【合规自检】</div>
                <div className="art-readonly">{article.compliance}</div>
              </section>

              <section className="art-sec">
                <div className="art-sec__label">【搜索覆盖自检】</div>
                <div className="coverage">
                  <div className="coverage__head">
                    <span>词条</span>
                    <span>字数</span>
                    <span>写入位置</span>
                    <span>覆盖</span>
                  </div>
                  {article.coverage.map((c) => (
                    <div className="coverage__row" key={c.word}>
                      <span className="coverage__word">{c.word}</span>
                      <span className="num">{c.len}</span>
                      <span className="coverage__where">{c.where}</span>
                      <span className={`coverage__ok${c.ok ? '' : ' is-miss'}`}>
                        {c.ok ? '已覆盖' : '未覆盖'}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              <div className="article-foot">
                <span>
                  覆盖 <span className="num">{covered}</span> / {article.coverage.length} 个词条
                </span>
                <span className="num">
                  {words} 字 · 预计阅读 {Math.max(1, Math.round(words / 300))} 分钟
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
