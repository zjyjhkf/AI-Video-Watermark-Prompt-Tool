/** 文章编写：结构化需求 → 任务中心生成 → 可编辑成稿 → 保存草稿落素材库。 */
import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../components/Icon';
import { Empty, Field, Seg, Select } from '../components/ui';
import { api, ApiError, saveBlob } from '../lib/api';
import {
  AUDIENCES,
  CONTENT_TYPES,
  KEYWORD_STRATEGIES,
  PLATFORMS,
  fmtTime,
  labelOf,
} from '../lib/constants';
import type { PageProps } from '../lib/props';
import type { ArticleResult, Draft, Task } from '../lib/types';

interface ArticleDoc {
  title: string;
  body: string;
  tags: string[];
  compliance_check: string;
  coverage_check: string;
  engine?: string;
  platform?: string;
}

/** 解析 coverage_check 的 markdown 表格 → 结构化行 */
function parseCoverage(md?: string | null): { word: string; len: string; where: string; ok: boolean }[] {
  if (!md) return [];
  return md
    .split('\n')
    .filter((l) => l.trim().startsWith('|'))
    .slice(2)
    .map((line) =>
      line
        .split('|')
        .map((c) => c.trim())
        .filter((c) => c.length > 0),
    )
    .filter((cols) => cols.length >= 4)
    .map((cols) => ({
      word: cols[0],
      len: cols[1],
      where: cols[2],
      ok: /✓|是|已覆盖|true|y/i.test(cols[3]),
    }));
}

const buildMarkdown = (doc: ArticleDoc): string =>
  [
    `# ${doc.title}`,
    '',
    doc.body,
    '',
    (doc.tags || []).join(' '),
    '',
    '## 合规自检',
    doc.compliance_check || '—',
    '',
    '## 搜索覆盖自检',
    doc.coverage_check || '—',
  ].join('\n');

export default function ArticleEditor({ navigate, toast }: PageProps) {
  const [form, setForm] = useState({
    platform: 'xhs',
    contentType: 'science',
    audience: 'general',
    topic: '',
    sellingPoint: '',
    wordCount: '',
    extra: '',
    keyword: '',
    strategy: 'auto',
  });
  const [refs, setRefs] = useState<{ id: string; name: string; assetId: string }[]>([]);
  const [article, setArticle] = useState<ArticleDoc | null>(null);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [tagInput, setTagInput] = useState('');
  const [exportOpen, setExportOpen] = useState(false);

  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lexicon, setLexicon] = useState<{ hit: boolean; summary?: string } | null>(null);

  const imgRef = useRef<HTMLInputElement | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const pollRef = useRef<number | null>(null);

  const patch = (next: Partial<typeof form>) => setForm((f) => ({ ...f, ...next }));

  const loadDrafts = () =>
    api
      .articleDrafts()
      .then((p) => setDrafts(p.items))
      .catch(() => setDrafts([]));

  useEffect(() => {
    loadDrafts();
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  /* 词库命中提示 */
  useEffect(() => {
    const kw = form.keyword.trim();
    if (!kw || form.strategy === 'off') {
      setLexicon(null);
      return;
    }
    const t = window.setTimeout(() => {
      api
        .lexicon(kw)
        .then((r) => setLexicon({ hit: !!r.hit, summary: String(r.summary || '') }))
        .catch(() => setLexicon(null));
    }, 500);
    return () => window.clearTimeout(t);
  }, [form.keyword, form.strategy]);

  const words = useMemo(() => (article ? article.body.replace(/\s/g, '').length : 0), [article]);
  const coverageRows = useMemo(() => parseCoverage(article?.coverage_check), [article]);
  const covered = coverageRows.filter((c) => c.ok).length;

  /* 正文字数不定：让 textarea 随内容自适应高度，避免成稿被裁切 */
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(240, el.scrollHeight + 2)}px`;
  }, [article?.body]);

  const addImages = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const room = 3 - refs.length;
    if (room <= 0) {
      toast('参考图最多 3 张', 'warn');
      return;
    }
    const picked = Array.from(files).slice(0, room);
    try {
      const { items } = await api.upload(picked, 'reference');
      setRefs((prev) => [
        ...prev,
        ...items.map((a) => ({ id: a.id, name: a.name, assetId: a.id })),
      ]);
      toast(`已添加 ${items.length} 张参考图`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '参考图上传失败', 'warn');
    }
  };

  const composeRequirement = () => {
    const parts = [
      form.topic.trim() ? `主题/产品：${form.topic.trim()}` : '',
      form.sellingPoint.trim() ? `核心卖点：${form.sellingPoint.trim()}` : '',
      form.wordCount.trim() ? `字数要求：${form.wordCount.trim()}` : '',
      form.extra.trim() ? `补充要求：${form.extra.trim()}` : '',
    ].filter(Boolean);
    return parts.join('\n');
  };

  const generate = async () => {
    const requirement = composeRequirement();
    if (!requirement) {
      setErrors({ topic: '请填写主题 / 产品，或补充需求描述' });
      return;
    }
    setErrors({});
    setGenerating(true);
    setProgress(0);
    try {
      const task = await api.createTask({
        name: `${form.topic.trim() || '未命名需求'} · ${labelOf(PLATFORMS, form.platform)}文案`,
        task_type: 'article',
        platform: form.platform,
        content_type: form.contentType,
        audience: form.audience,
        keyword: form.keyword.trim() || undefined,
        keyword_strategy: form.strategy,
        requirement,
        ref_image_asset_ids: refs.map((r) => r.assetId),
        save_to_assets: false,
      });
      setTaskId(task.id);
      pollTask(task.id);
    } catch (err) {
      setGenerating(false);
      toast(err instanceof ApiError ? err.message : '任务提交失败', 'warn');
    }
  };

  const pollTask = (id: string) => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    let ticks = 0;
    pollRef.current = window.setInterval(async () => {
      ticks += 1;
      try {
        const t: Task = await api.task(id);
        setProgress(t.progress || 0);
        if (t.status === 'done') {
          window.clearInterval(pollRef.current!);
          pollRef.current = null;
          const res = t.result as ArticleResult | null;
          const doc = res?.article;
          if (doc) {
            setArticle({ ...doc, platform: form.platform });
            setDraftId(null);
            setSavedAt(null);
            toast('文章已生成，可直接编辑');
          } else {
            toast('任务已完成但没有返回内容', 'warn');
          }
          setGenerating(false);
          loadDrafts();
        } else if (t.status === 'failed' || t.status === 'canceled') {
          window.clearInterval(pollRef.current!);
          pollRef.current = null;
          setGenerating(false);
          toast(t.error || (t.status === 'failed' ? '生成失败' : '任务已取消'), 'warn');
        } else if (ticks > 200) {
          window.clearInterval(pollRef.current!);
          pollRef.current = null;
          setGenerating(false);
          toast('生成超时，请到任务中心查看', 'warn');
        }
      } catch {
        /* 网络抖动：继续轮询 */
      }
    }, 800);
  };

  /* 保存草稿：序列化落素材库；同一草稿重复保存只覆盖不新增 */
  const saveDraft = async () => {
    if (saving) return;
    const title = article ? article.title : form.topic.trim();
    if (!title && !form.extra.trim()) {
      toast('请先填写主题，或先生成文章', 'warn');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: title || '未命名需求',
        platform: form.platform,
        content_type: form.contentType,
        audience: form.audience,
        requirement: composeRequirement() || null,
        body: article ? article.body : null,
        tags: article ? article.tags : [],
        compliance_check: article ? article.compliance_check : null,
        coverage_check: article ? article.coverage_check : null,
        save_to_assets: true,
      };
      const saved = await api.saveArticleDraft(payload, draftId || undefined);
      setDraftId(saved.draft.id);
      setSavedAt(saved.draft.updated_at);
      await loadDrafts();
      toast(draftId ? '草稿已更新到素材库' : '草稿已保存到素材库');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '草稿保存失败', 'warn');
    } finally {
      setSaving(false);
    }
  };

  const loadDraft = (id: string) => {
    const d = drafts.find((x) => x.id === id);
    if (!d) return;
    setDraftId(d.id);
    setForm((f) => ({
      ...f,
      platform: d.platform || f.platform,
      contentType: d.content_type || f.contentType,
      audience: d.audience || f.audience,
      topic: d.title || f.topic,
    }));
    if (d.body) {
      setArticle({
        title: d.title || '未命名',
        body: d.body,
        tags: d.tags || [],
        compliance_check: d.compliance_check || '',
        coverage_check: d.coverage_check || '',
        platform: d.platform || undefined,
      });
    } else {
      setArticle(null);
    }
    setSavedAt(d.updated_at);
    toast(`已载入草稿「${d.title || d.id}」`);
  };

  const exportText = (format: 'md' | 'txt') => {
    setExportOpen(false);
    if (!article) {
      toast('请先生成文章', 'warn');
      return;
    }
    const md = buildMarkdown(article);
    const content = format === 'md' ? md : md.replace(/[#*`|]/g, '');
    saveBlob(
      new Blob([content], { type: 'text/plain;charset=utf-8' }),
      `${(article.title || 'article').slice(0, 20)}.${format}`,
    );
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
          <button className="btn btn--ghost" onClick={saveDraft} disabled={saving}>
            <Icon name="doc" size={15} stroke={1.9} />
            {saving ? '保存中…' : '保存草稿'}
          </button>
          <div className="menu-wrap">
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
            {generating ? `生成中 ${progress}%` : article ? '重新生成' : '生成文章'}
          </button>
        </div>
      </header>

      <div className="editor">
        <aside className="article-form">
          <div className="panel article-form__inner">
            <div className="panel__title">需求输入</div>

            {drafts.length ? (
              <Field label="已有草稿" hint="载入后再次保存会覆盖同一条草稿">
                <Select
                  ariaLabel="载入草稿"
                  value={draftId || ''}
                  onChange={(v) => v && loadDraft(v)}
                  options={[
                    { key: '', value: '', label: `选择草稿（${drafts.length} 条）` },
                    ...drafts.map((d) => ({
                      key: d.id,
                      value: d.id,
                      label: `${d.title || d.id} · ${fmtTime(d.updated_at)}`,
                    })),
                  ]}
                />
              </Field>
            ) : null}

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

            <Field label="参考图" hint="可选，最多 3 张（上传后入库，供生成任务引用）">
              <div className="refs">
                {refs.map((img) => (
                  <div className="refs__item" key={img.id}>
                    <Icon name="image" size={18} stroke={1.7} />
                    <button
                      type="button"
                      className="refs__x"
                      aria-label="移除参考图"
                      onClick={() => setRefs((l) => l.filter((x) => x.id !== img.id))}
                    >
                      <Icon name="close" size={11} stroke={2.2} />
                    </button>
                  </div>
                ))}
                {refs.length < 3 ? (
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

            {lexicon ? (
              <div className="lexicon">
                <Icon name={lexicon.hit ? 'checkCircle' : 'alert'} size={13} stroke={1.8} />
                {lexicon.hit
                  ? `词库命中「${form.keyword}」${lexicon.summary ? ` · ${lexicon.summary}` : ''}`
                  : `词库暂无「${form.keyword}」，按${form.strategy === 'auto' ? '自动补采' : '不使用词库'}处理`}
              </div>
            ) : null}
          </div>
        </aside>

        <div className="article-out">
          {!article ? (
            <div className="article-out__empty">
              <Empty
                icon="doc"
                title={generating ? `正在生成… ${progress}%` : '还没有生成结果'}
                sub={
                  generating
                    ? '任务已进入队列，正在组装提示词、查询词库并调用模型'
                    : '填写左侧需求后，点击右上角「生成文章」'
                }
              >
                {generating ? (
                  <div className="skeleton">
                    <i />
                    <i />
                    <i />
                  </div>
                ) : taskId ? (
                  <button className="btn btn--ghost btn--sm" onClick={() => navigate('tasks', taskId)}>
                    在任务中心查看该任务
                  </button>
                ) : null}
              </Empty>
            </div>
          ) : (
            <div className="article-out__scroll">
              <div className="article-head">
                <div>
                  <div className="article-head__label">生成结果</div>
                  <div className="article-head__meta">
                    {labelOf(PLATFORMS, form.platform)} · {labelOf(CONTENT_TYPES, form.contentType)} ·
                    <span className="num"> {words}</span> 字
                    {savedAt ? ` · 保存于 ${fmtTime(savedAt)}` : ''}
                    {draftId ? (
                      <button
                        type="button"
                        className="meta-link"
                        onClick={() => navigate('assets', 'draft')}
                      >
                        已存入素材库
                        <Icon name="arrowUpRight" size={11} stroke={2} />
                      </button>
                    ) : null}
                  </div>
                </div>
                <span className="pill pill--mint">
                  {article.engine === 'local-template' ? '本地模板' : '已生成'}
                </span>
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
                  ref={bodyRef}
                  className="art-body"
                  value={article.body}
                  style={{ overflow: 'hidden', resize: 'none' }}
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
                      const tag = tagInput.trim().startsWith('#')
                        ? tagInput.trim()
                        : `#${tagInput.trim()}`;
                      setArticle({ ...article, tags: [...article.tags, tag] });
                      setTagInput('');
                    }}
                  />
                </div>
              </section>

              <section className="art-sec">
                <div className="art-sec__label">【合规自检】</div>
                <div className="art-readonly">{article.compliance_check || '—'}</div>
              </section>

              <section className="art-sec">
                <div className="art-sec__label">【搜索覆盖自检】</div>
                {coverageRows.length ? (
                  <div className="coverage">
                    <div className="coverage__head">
                      <span>词条</span>
                      <span>字数</span>
                      <span>写入位置</span>
                      <span>覆盖</span>
                    </div>
                    {coverageRows.map((c) => (
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
                ) : (
                  <div className="art-readonly">{article.coverage_check || '—'}</div>
                )}
              </section>

              <div className="article-foot">
                <span>
                  覆盖 <span className="num">{covered}</span> / {coverageRows.length} 个词条
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
