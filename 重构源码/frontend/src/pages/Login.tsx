import { useState } from 'react';
import Icon from '../components/Icon';
import { ApiError } from '../lib/api';

const QUICK = [{ username: 'linan', label: '林岸 · 超级管理员' }];

const DEMO_PASSWORD = 'demo1234';

export default function Login({ onLogin }: { onLogin: (u: string, p: string) => Promise<boolean> }) {
  const [username, setUsername] = useState('linan');
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return setError('请填写用户名');
    if (!password) return setError('请填写密码');
    setError('');
    setBusy(true);
    try {
      await onLogin(username.trim(), password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '登录失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app app--auth">
      <div className="auth">
        <div className="auth__brand">
          <div className="auth__logo">
            <Icon name="film" size={22} stroke={1.8} />
          </div>
          <div className="auth__brand-name">内容中转平台</div>
          <div className="auth__brand-sub">Content Hub · 内部生产工具</div>

          <div className="auth__points">
            <div className="auth__point">
              <span className="auth__point-icon">
                <Icon name="video" size={15} />
              </span>
              视频水印：本地导入、配置预览、提交渲染、成品入库一条链路
            </div>
            <div className="auth__point">
              <span className="auth__point-icon">
                <Icon name="doc" size={15} />
              </span>
              文章编写：需求 + 关键词 → 分节成稿，合规自检随文输出
            </div>
            <div className="auth__point">
              <span className="auth__point-icon">
                <Icon name="wand" size={15} />
              </span>
              生图提示词：粗略需求扩写成可直接出图的英文提示词
            </div>
          </div>

          <div className="auth__foot">v1.1 · 全栈重构版 · FastAPI + React</div>
        </div>

        <div className="auth__panel">
          <form className="auth__card" onSubmit={submit}>
            <div className="auth__title">登录</div>
            <div className="auth__sub">使用管理员分配的用户名与密码登录</div>

            <div className="field">
              <label className="field__label" htmlFor="login-username">
                用户名
              </label>
              <div className="input">
                <Icon name="users" size={15} style={{ color: '#a6c0bb' }} />
                <input
                  id="login-username"
                  value={username}
                  autoComplete="username"
                  placeholder="请输入用户名"
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setError('');
                  }}
                />
              </div>
            </div>

            <div className="field">
              <label className="field__label" htmlFor="login-password">
                密码
              </label>
              <div className="input">
                <Icon name="lock" size={15} style={{ color: '#a6c0bb' }} />
                <input
                  id="login-password"
                  type={show ? 'text' : 'password'}
                  value={password}
                  autoComplete="current-password"
                  placeholder="请输入密码"
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError('');
                  }}
                />
                <button
                  type="button"
                  className="input__eye"
                  onClick={() => setShow((s) => !s)}
                  aria-label={show ? '隐藏密码' : '显示密码'}
                >
                  <Icon name={show ? 'eyeOff' : 'eye'} size={15} stroke={1.8} />
                </button>
              </div>
            </div>

            {error ? <div className="auth__error">{error}</div> : null}

            <button className="btn btn--primary btn--block" type="submit" disabled={busy}>
              {busy ? '正在登录…' : '登录'}
            </button>

            <div className="auth__divider" />

            <div className="auth__quick">
              <div className="auth__quick-label">初始账号（系统仅内置超级管理员）</div>
              {QUICK.map((q) => (
                <button
                  key={q.username}
                  type="button"
                  className="auth__quick-item"
                  onClick={() => {
                    setUsername(q.username);
                    setPassword(DEMO_PASSWORD);
                    setError('');
                  }}
                >
                  {q.label}
                  <span className="num">@{q.username}</span>
                </button>
              ))}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
