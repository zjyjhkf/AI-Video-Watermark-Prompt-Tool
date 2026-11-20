import React, { useState } from 'react';
import Icon from '../components/Icon.jsx';
import { demoPassword } from '../data/mock.js';

const QUICK = [
  { username: 'linan', label: '林岸 · 超级管理员' },
  { username: 'zhangjy', label: '张嘉怡 · 管理员' },
  { username: 'chenmo', label: '陈默 · 编辑者' },
];

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('linan');
  const [password, setPassword] = useState(demoPassword);
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('请填写用户名');
      return;
    }
    if (!password) {
      setError('请填写密码');
      return;
    }
    setError('');
    setBusy(true);
    setTimeout(() => {
      const ok = onLogin(username.trim(), password);
      setBusy(false);
      if (!ok) setError('用户名或密码错误，请向管理员确认账号信息');
    }, 420);
  };

  return (
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
            视频水印：上传、配置、预览、提交，一条链路走完
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

        <div className="auth__foot">v1.0 Demo · 数据为演示用，不连接真实服务</div>
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
            <div className="auth__quick-label">演示账号（密码均为 {demoPassword}）</div>
            {QUICK.map((q) => (
              <button
                key={q.username}
                type="button"
                className="auth__quick-item"
                onClick={() => {
                  setUsername(q.username);
                  setPassword(demoPassword);
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
  );
}
