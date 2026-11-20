/** 生图提示词：需求扩写为四节结构化提示词，可保存草稿（Markdown 落素材库）。 */
import { useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon';
import { Empty } from '../components/ui';
import { api, ApiError, saveBlob } from '../lib/api';
import { fmtTime } from '../lib/constants';
import type { PageProps } from '../lib/props';
import type { Draft, PromptResult, Task } from '../lib/types';

interface PromptDoc {
  prompt_text: string;
  prompt_cn: string;
  elements: string;
  params: string;
  engine?: string;
}

export default function PromptGenerator({ navigate, toast }: PageProps) {
  const [requirement, setRequirement] = useState('');
  const [refs, setRefs] = useState<{ id: string; name: string; assetId: string }[]>([]);
  const [result, setResult] = useState<PromptDoc | null>(null);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [taskId, setTaskId] = useState<string | null>(null);

  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const pollRef = useRef<number | null>(null);

  const loadDrafts = () =>
    api
      .promptDrafts()
      .then((p) => setDrafts(p.items))
      .catch(() => setDrafts([]));

  useEffect(() => {
    loadDrafts();
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  const addImages = async (files: FileList | null) => {
    if (!files || !files.length) return;
    try {
      const { items } = await api.upload(Array.from(files), 'reference');
      setRefs((prev) => [...prev, ...items.map((a) => ({ id: a.id, name: a.name, assetId: a.id }))]);
      toast(`已添加 ${items.length} 张参考图`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '参考图上传失败', 'warn');
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
          const res = t.result as PromptResult | null;
          const pj = res?.prompt_json || {};
          if (res?.prompt_text) {
            setResult({
              prompt_text: res.prompt_text,
              prompt_cn: pj.prompt_cn || '',
              elements: pj.elements || '',
              params: pj.params || '',
              engine: (pj as Record<string, string>).engine,
            });
            setDraftId(null);
            setSavedAt(null);
            toast('提示词已生成');
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

  const generate = async () => {
    if (!requirement.trim()) {
      setError('请先描述画面需求');
      return;
    }
    setError('');
    setGenerating(true);
    setProgress(0);
    try {
      const task = await api.createTask({
        name: `${requirement.trim().slice(0, 12)}… · 提示词`,
        task_type: 'prompt',
        requirement: requirement.trim(),
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

  const buildMarkdown = (): string => {
    const parts = ['---', 'kind: prompt', `updated_at: ${new Date().toISOString()}`, '---', ''];
    parts.push(`# ${requirement.trim().slice(0, 24) || '未命名'} · 提示词草稿`, '');
    parts.push('## 需求描述', requirement.trim() || '—', '');
    if (result) {
      parts.push('## English Prompt', result.prompt_text, '');
      parts.push('## 中文对照', result.prompt_cn || '—', '');
      parts.push('## 关键要素', result.elements || '—', '');
      parts.push('## 推荐参数', result.params || '—');
    }
    if (refs.length) parts.push('', `## 参考图`, ...refs.map((r) => `- ${r.name}（${r.assetId}）`));
    return parts.join('\n');
  };

  const saveDraft = async () => {
    if (saving) return;
    if (!requirement.trim() && !result) {
      toast('请先描述画面需求', 'warn');
      return;
    }
    setSaving(true);
    try {
      const saved = await api.savePromptDraft(
        {
          requirement: requirement.trim() || null,
          prompt_text: result ? result.prompt_text : null,
          prompt_cn: result ? result.prompt_cn : null,
          elements: result ? result.elements : null,
          params: result ? result.params : null,
          save_to_assets: true,
        },
        draftId || undefined,
      );
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
    setRequirement(d.requirement || d.title || '');
    const pj = d.prompt_json || {};
    if (pj.prompt_text) {
      setResult({
        prompt_text: pj.prompt_text,
        prompt_cn: pj.prompt_cn || '',
        elements: pj.elements || '',
        params: pj.params || '',
      });
    } else {
      setResult(null);
    }
    setSavedAt(d.updated_at);
    toast('草稿已载入');
  };

  const copyPrompt = () => {
    if (!result) {
      toast('请先生成提示词', 'warn');
      return;
    }
    const text = result.prompt_text;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => toast('英文提示词已复制'),
        () => toast('复制失败，请手动选择文本', 'warn'),
      );
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      toast('英文提示词已复制');
    }
  };

  const downloadTxt = () => {
    if (!result) {
      toast('请先生成提示词', 'warn');
      return;
    }
    const content = [
      '【English Prompt】',
      result.prompt_text,
      '',
      '【中文对照】',
      result.prompt_cn || '—',
      '',
      '【关键要素】',
      result.elements || '—',
      '',
      '【推荐参数】',
      result.params || '—',
    ].join('\n');
    saveBlob(new Blob([content], { type: 'text/plain;charset=utf-8' }), 'image-prompt.txt');
    toast('提示词已下载为 txt');
  };

  return (
    <div className="page prompt-page">
      <header className="head">
        <div>
          <h1 className="head__title">生图提示词</h1>
          <div className="head__sub">一段粗略需求，扩写成可直接喂给生图模型的高质量提示词</div>
        </div>
        <div className="head__actions">
          <button className="btn btn--ghost" onClick={saveDraft} disabled={saving}>
            <Icon name="doc" size={15} stroke={1.9} />
            {saving ? '保存中…' : '保存草稿'}
          </button>
          <button className="btn btn--ghost" onClick={copyPrompt}>
            <Icon name="copy" size={15} stroke={1.9} />
            复制英文提示词
          </button>
          <button className="btn btn--ghost" onClick={downloadTxt}>
            <Icon name="download" size={15} stroke={1.9} />
            下载 txt
          </button>
          <button className="btn btn--primary" onClick={generate} disabled={generating}>
            <Icon name="wand" size={16} stroke={1.8} />
            {generating ? `生成中 ${progress}%` : result ? '重新生成' : '生成提示词'}
          </button>
        </div>
      </header>

      <div className="prompt-wrap">
        <section className="panel">
          <div className="panel__head">
            <div className="panel__title">需求描述</div>
            {savedAt ? (
              <button type="button" className="meta-link" onClick={() => navigate('assets', 'draft')}>
                草稿已存入素材库 · {fmtTime(savedAt)}
                <Icon name="arrowUpRight" size={11} stroke={2} />
              </button>
            ) : drafts.length ? (
              <select
                className="select__native"
                aria-label="载入草稿"
                value={draftId || ''}
                onChange={(e) => e.target.value && loadDraft(e.target.value)}
                style={{
                  border: '1px solid #e3efec',
                  borderRadius: 8,
                  padding: '4px 8px',
                  fontSize: 12,
                  color: '#5c7a75',
                  background: '#fff',
                }}
              >
                <option value="">载入草稿（{drafts.length} 条）</option>
                {drafts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title || d.id} · {fmtTime(d.updated_at)}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
          <textarea
            className={`textarea textarea--lg${error ? ' is-error' : ''}`}
            rows={4}
            value={requirement}
            placeholder="描述你想生成的画面：主体、场景、风格、用途…"
            onChange={(e) => {
              setRequirement(e.target.value);
              setError('');
            }}
          />
          {error ? <span className="error">{error}</span> : null}

          <div className="prompt-refs">
            <div className="field__label">参考图（可选）</div>
            <div className="refs">
              {refs.map((img) => (
                <div className="refs__item" key={img.id} title={img.name}>
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
              <button className="refs__add" onClick={() => fileRef.current?.click()}>
                <Icon name="image" size={15} stroke={1.8} />
              </button>
              <input
                ref={fileRef}
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
          </div>
        </section>

        {!result ? (
          <div className="prompt-empty">
            <Empty
              icon="wand"
              title={generating ? `正在扩写需求… ${progress}%` : '还没有生成结果'}
              sub={
                generating
                  ? '任务已进入队列，正在补充构图、光线、风格与画质要素'
                  : '点击右上角「生成提示词」，输出四节结构化结果'
              }
            >
              {taskId ? (
                <button className="btn btn--ghost btn--sm" onClick={() => navigate('tasks', taskId)}>
                  在任务中心查看该任务
                </button>
              ) : null}
            </Empty>
          </div>
        ) : (
          <div className="prompt-result">
            <section className="prompt-sec prompt-sec--prompt">
              <div className="prompt-sec__head">
                <span className="prompt-sec__label">【English Prompt】</span>
                <button className="link" onClick={copyPrompt}>
                  复制全文
                </button>
              </div>
              <p className="prompt-en">{result.prompt_text}</p>
            </section>

            <section className="prompt-sec">
              <div className="prompt-sec__label">【中文对照】</div>
              <p className="prompt-cn">{result.prompt_cn || '—'}</p>
            </section>

            <div className="prompt-grid">
              <section className="prompt-sec">
                <div className="prompt-sec__label">【关键要素】</div>
                <ul className="prompt-list">
                  {(result.elements || '—').split('\n').filter(Boolean).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </section>
              <section className="prompt-sec">
                <div className="prompt-sec__label">【推荐参数】</div>
                <p className="prompt-cn">{result.params || '—'}</p>
              </section>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
