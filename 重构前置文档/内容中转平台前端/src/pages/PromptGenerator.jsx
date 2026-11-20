import React, { useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Empty } from '../components/ui.jsx';
import { promptSample } from '../data/mock.js';

export default function PromptGenerator({ onCreateTask, onSaveDraft, onNavigate, toast }) {
  const [requirement, setRequirement] = useState(promptSample.requirement);
  const [refs, setRefs] = useState([]);
  const [result, setResult] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [draftAssetId, setDraftAssetId] = useState(null);
  const [savedAt, setSavedAt] = useState('');
  const fileRef = useRef(null);

  const buildMarkdown = () => {
    const parts = ['---', 'kind: prompt', `updated_at: ${new Date().toISOString()}`, '---', ''];
    parts.push(`# ${requirement.trim().slice(0, 24) || '未命名'} · 提示词草稿`, '');
    parts.push('## 需求描述', requirement.trim() || '—', '');
    if (result) {
      parts.push('## English Prompt', result.promptText, '');
      parts.push('## 中文对照', result.promptCn, '');
      parts.push('## 关键要素', result.elements, '');
      parts.push('## 推荐参数', result.params);
    }
    return parts.join('\n');
  };

  const saveDraft = () => {
    if (!requirement.trim() && !result) {
      toast('请先描述画面需求', 'warn');
      return;
    }
    const base = (result ? result.promptCn : requirement).trim();
    const id = onSaveDraft(
      {
        name: `${base.slice(0, 18)} · 提示词草稿`,
        content: buildMarkdown(),
        folder: '草稿 / 提示词',
      },
      draftAssetId
    );
    setDraftAssetId(id);
    setSavedAt('刚刚');
    toast(draftAssetId ? '草稿已更新到素材库' : '草稿已保存到素材库');
  };

  const copyPrompt = () => {
    if (!result) {
      toast('请先生成提示词', 'warn');
      return;
    }
    const text = result.promptText;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => toast('英文提示词已复制'),
        () => toast('复制失败，请手动选择文本', 'warn')
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
      result.promptText,
      '',
      '【中文对照】',
      result.promptCn,
      '',
      '【关键要素】',
      result.elements,
      '',
      '【推荐参数】',
      result.params,
    ].join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'image-prompt.txt';
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
    toast('提示词已下载为 txt');
  };

  const generate = () => {
    if (!requirement.trim()) {
      setError('请先描述画面需求');
      return;
    }
    setError('');
    setGenerating(true);
    onCreateTask({
      name: `${requirement.trim().slice(0, 12)}… · 提示词`,
      type: 'prompt',
      detail: { requirement: requirement.trim(), refs: refs.length },
      result: {
        promptText: promptSample.result.promptText,
        promptCn: promptSample.result.promptCn,
        elements: promptSample.result.elements,
        params: promptSample.result.params,
      },
    });
    setTimeout(() => {
      setResult({ ...promptSample.result });
      setGenerating(false);
      toast('提示词已生成');
    }, 1500);
  };

  return (
    <div className="page prompt-page">
      <header className="head">
        <div>
          <h1 className="head__title">生图提示词</h1>
          <div className="head__sub">一段粗略需求，扩写成可直接喂给生图模型的高质量提示词</div>
        </div>
        <div className="head__actions">
          <button className="btn btn--ghost" onClick={saveDraft}>
            <Icon name="doc" size={15} stroke={1.9} />
            保存草稿
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
            {generating ? '生成中…' : result ? '重新生成' : '生成提示词'}
          </button>
        </div>
      </header>

      <div className="prompt-wrap">
        <section className="panel">
          <div className="panel__head">
            <div className="panel__title">需求描述</div>
            {savedAt ? (
              <button type="button" className="meta-link" onClick={() => onNavigate('assets', 'draft')}>
                草稿已存入素材库 · {savedAt}
                <Icon name="arrowUpRight" size={11} stroke={2} />
              </button>
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
                <div className="refs__item" key={img.id}>
                  <img src={img.src} alt={img.name} />
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
                  const list = Array.from(e.target.files).map((f) => ({
                    id: `${f.name}-${Math.random().toString(36).slice(2, 6)}`,
                    name: f.name,
                    src: URL.createObjectURL(f),
                  }));
                  setRefs((prev) => [...prev, ...list]);
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
              title={generating ? '正在扩写需求…' : '还没有生成结果'}
              sub={
                generating
                  ? '正在补充构图、光线、风格与画质要素'
                  : '点击右上角「生成提示词」，输出四节结构化结果'
              }
            />
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
              <p className="prompt-en">{result.promptText}</p>
            </section>

            <section className="prompt-sec">
              <div className="prompt-sec__label">【中文对照】</div>
              <p className="prompt-cn">{result.promptCn}</p>
            </section>

            <div className="prompt-grid">
              <section className="prompt-sec">
                <div className="prompt-sec__label">【关键要素】</div>
                <ul className="prompt-list">
                  {result.elements.split('\n').map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </section>
              <section className="prompt-sec">
                <div className="prompt-sec__label">【推荐参数】</div>
                <p className="prompt-cn">{result.params}</p>
              </section>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
