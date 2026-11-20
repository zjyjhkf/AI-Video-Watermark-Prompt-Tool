/** 个人资料：任何角色都可修改自己的姓名 / 用户名 / 密码。
 *
 * 权限边界：
 * - 姓名、用户名：改完立即生效，当前登录态不变
 * - 密码：需校验原密码；改成功后旧凭证立即失效，强制重新登录
 */
import { useState } from 'react';
import Icon from '../components/Icon';
import { Field } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { ROLES, fmtTime } from '../lib/constants';
import type { PageProps } from '../lib/props';

const USERNAME_RE = /^[A-Za-z0-9_.-]{3,20}$/;

export default function Profile({ user, toast, refreshUser, logout }: PageProps) {
  const [name, setName] = useState(user.name);
  const [username, setUsername] = useState(user.username);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [savingInfo, setSavingInfo] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);

  const role = ROLES[user.role] || ROLES.guest;
  const dirty = name.trim() !== user.name || username.trim().toLowerCase() !== user.username;

  const saveInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = '请填写姓名';
    const uname = username.trim().toLowerCase();
    if (!uname) next.username = '请填写用户名';
    else if (!USERNAME_RE.test(uname)) next.username = '3–20 位，仅支持字母、数字、下划线与点';
    setErrors(next);
    if (Object.keys(next).length) return;

    const body: { name?: string; username?: string } = {};
    if (name.trim() !== user.name) body.name = name.trim();
    if (uname !== user.username) body.username = uname;
    if (!Object.keys(body).length) {
      toast('没有需要保存的修改');
      return;
    }

    setSavingInfo(true);
    try {
      await api.updateMe(body);
      await refreshUser?.();
      toast('个人资料已更新');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'DUPLICATE_USERNAME') {
        setErrors({ username: '该用户名已被占用' });
      }
      toast(err instanceof ApiError ? err.message : '保存失败', 'warn');
    } finally {
      setSavingInfo(false);
    }
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!oldPwd) next.old_password = '请填写当前密码';
    if (!newPwd) next.new_password = '请设置新密码';
    else if (newPwd.length < 8) next.new_password = '密码至少 8 位';
    else if (newPwd === oldPwd) next.new_password = '新密码不能与当前密码相同';
    if (newPwd && confirmPwd !== newPwd) next.confirm_password = '两次输入不一致';
    setErrors(next);
    if (Object.keys(next).length) return;

    setSavingPwd(true);
    try {
      await api.updateMe({ old_password: oldPwd, new_password: newPwd });
      setOldPwd('');
      setNewPwd('');
      setConfirmPwd('');
      toast('密码已更新，请使用新密码重新登录');
      await logout?.();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'VALIDATION_ERROR') {
        setErrors({ old_password: err.message });
      }
      toast(err instanceof ApiError ? err.message : '密码修改失败', 'warn');
    } finally {
      setSavingPwd(false);
    }
  };

  return (
    <div className="page">
      <header className="head">
        <div>
          <h1 className="head__title">个人资料</h1>
          <div className="head__sub">维护自己的姓名、登录用户名与密码；账号角色由超级管理员分配</div>
        </div>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 340px',
          gap: 20,
          alignItems: 'start',
        }}
      >
        <div style={{ display: 'grid', gap: 16 }}>
          <form className="form" onSubmit={saveInfo}>
            <div>
              <div className="card__title">基本信息</div>
              <div className="hint" style={{ marginTop: 3 }}>
                姓名用于站内展示，用户名用于登录，修改后立即生效
              </div>
            </div>

            <Field label="姓名" htmlFor="profile-name" error={errors.name}>
              <div className="input">
                <input
                  id="profile-name"
                  value={name}
                  placeholder="请输入真实姓名"
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            </Field>

            <Field
              label="用户名"
              htmlFor="profile-username"
              error={errors.username}
              hint={errors.username ? '' : '3–20 位，支持字母、数字、下划线、点与短横线'}
            >
              <div className="input">
                <span className="input__prefix">@</span>
                <input
                  id="profile-username"
                  value={username}
                  autoComplete="username"
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
            </Field>

            <button
              className="btn btn--primary btn--block"
              type="submit"
              disabled={savingInfo || !dirty}
            >
              {savingInfo ? '保存中…' : '保存资料'}
            </button>
          </form>

          <form className="form" onSubmit={savePassword}>
            <div>
              <div className="card__title">修改密码</div>
              <div className="hint" style={{ marginTop: 3 }}>
                修改成功后当前登录会立即失效，需要用新密码重新登录
              </div>
            </div>

            <Field label="当前密码" htmlFor="profile-old" error={errors.old_password}>
              <div className="input">
                <input
                  id="profile-old"
                  type={showPwd ? 'text' : 'password'}
                  value={oldPwd}
                  placeholder="请输入当前登录密码"
                  autoComplete="current-password"
                  onChange={(e) => setOldPwd(e.target.value)}
                />
                <button
                  type="button"
                  className="input__eye"
                  onClick={() => setShowPwd((v) => !v)}
                  aria-label={showPwd ? '隐藏密码' : '显示密码'}
                >
                  <Icon name={showPwd ? 'eyeOff' : 'eye'} size={15} stroke={1.8} />
                </button>
              </div>
            </Field>

            <Field
              label="新密码"
              htmlFor="profile-new"
              error={errors.new_password}
              hint={errors.new_password ? '' : '至少 8 位'}
            >
              <div className="input">
                <input
                  id="profile-new"
                  type={showPwd ? 'text' : 'password'}
                  value={newPwd}
                  placeholder="至少 8 位"
                  autoComplete="new-password"
                  onChange={(e) => setNewPwd(e.target.value)}
                />
              </div>
            </Field>

            <Field label="确认新密码" htmlFor="profile-confirm" error={errors.confirm_password}>
              <div className="input">
                <input
                  id="profile-confirm"
                  type={showPwd ? 'text' : 'password'}
                  value={confirmPwd}
                  placeholder="再输入一次新密码"
                  autoComplete="new-password"
                  onChange={(e) => setConfirmPwd(e.target.value)}
                />
              </div>
            </Field>

            <button className="btn btn--primary btn--block" type="submit" disabled={savingPwd}>
              {savingPwd ? '提交中…' : '更新密码'}
            </button>
          </form>
        </div>

        <aside style={{ display: 'grid', gap: 16 }}>
          <section className="panel">
            <div className="panel__title">账号信息</div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                margin: '4px 0 14px',
              }}
            >
              <div
                className="avatar"
                style={{ background: user.avatar || undefined, width: 44, height: 44, fontSize: 18 }}
              >
                {(user.name || user.username).slice(0, 1)}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{user.name}</div>
                <div className="hint" style={{ marginTop: 2 }}>
                  @{user.username}
                </div>
              </div>
            </div>

            <div className="kv">
              <div className="kv__row">
                <span className="kv__k">角色</span>
                <span className="kv__v">
                  <span className="role-pill" style={{ background: role.bg, color: role.color }}>
                    {role.label}
                  </span>
                </span>
              </div>
              <div className="kv__row">
                <span className="kv__k">数据范围</span>
                <span className="kv__v">{user.scope_all ? '全部素材' : '仅本人内容'}</span>
              </div>
              <div className="kv__row">
                <span className="kv__k">最近登录</span>
                <span className="kv__v">
                  {user.last_login_at ? fmtTime(user.last_login_at) : '本次为首次登录'}
                </span>
              </div>
              <div className="kv__row">
                <span className="kv__k">账号创建</span>
                <span className="kv__v">{user.created_at ? fmtTime(user.created_at) : '—'}</span>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel__title">角色权限说明</div>
            <div className="hint" style={{ lineHeight: 1.9 }}>
              超级管理员可管理全部账号与系统设置；管理员可管理游客账号；编辑者可生产内容；游客可浏览与下载被授权的素材。
              需要调整角色或数据范围时，请联系超级管理员。
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
