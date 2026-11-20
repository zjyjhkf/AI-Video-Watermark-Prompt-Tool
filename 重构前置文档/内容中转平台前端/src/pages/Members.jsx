import React, { useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Confirm, Field, Modal, Seg } from '../components/ui.jsx';
import { ROLES } from '../data/mock.js';

const ASSIGNABLE = ['admin', 'editor', 'viewer'];

const ROLE_DESC = {
  super: '唯一账号，可管理成员与系统设置、查看全部任务',
  admin: '可新增或移除成员、重置登录密码、管理全部素材',
  editor: '可创建、编辑与上传素材，不可管理成员',
  viewer: '仅可浏览与下载被授权的素材',
};

const randomPwd = () => {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 10; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
};

const PALETTE = [
  'linear-gradient(135deg,#1aae9a,#4db89a)',
  'linear-gradient(135deg,#479ec9,#73c2e6)',
  'linear-gradient(135deg,#e3b870,#f2d49e)',
  'linear-gradient(135deg,#5cc29e,#9ee0c7)',
  'linear-gradient(135deg,#7aa8c7,#b3cce0)',
  'linear-gradient(135deg,#9d8fc4,#c3b8e2)',
];

export default function Members({ members, setMembers, user, toast, intent }) {
  const [menuFor, setMenuFor] = useState(null);
  const [flash, setFlash] = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [pwdTarget, setPwdTarget] = useState(null);
  const [pwd, setPwd] = useState('');
  const [pwdShow, setPwdShow] = useState(false);
  const [form, setForm] = useState({
    name: '',
    username: '',
    password: '',
    role: 'editor',
    scopeAll: true,
  });
  const [showPwd, setShowPwd] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [errors, setErrors] = useState({});
  const nameRef = useRef(null);

  useEffect(() => {
    if (!menuFor) return;
    const close = () => setMenuFor(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menuFor]);

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(false), 1600);
    return () => clearTimeout(timer);
  }, [flash]);

  useEffect(() => {
    if (!intent) return;
    if (intent.action === 'create') {
      setFlash(true);
      nameRef.current?.focus();
    }
  }, [intent && intent.ts]);

  const canManage = user.role === 'super' || user.role === 'admin';
  const activeCount = members.filter((m) => m.active).length;

  const changeRole = (target, role) => {
    setMembers((list) => list.map((m) => (m.id === target.id ? { ...m, role } : m)));
    setMenuFor(null);
    toast(`已将「${target.name}」设为${ROLES[role].label}`);
  };

  const submit = (e) => {
    e.preventDefault();
    const next = {};
    const username = form.username.trim();
    if (!form.name.trim()) next.name = '请填写成员姓名';
    if (!username) next.username = '请填写登录用户名';
    else if (!/^[A-Za-z0-9_.-]{3,20}$/.test(username))
      next.username = '3–20 位，仅支持字母、数字、下划线与点';
    else if (members.some((m) => (m.username || '').toLowerCase() === username.toLowerCase()))
      next.username = '该用户名已被占用';
    if (!form.password) next.password = '请设置初始密码';
    else if (form.password.length < 8) next.password = '密码至少 8 位';
    setErrors(next);
    if (Object.keys(next).length) return;

    setMembers((list) => [
      ...list,
      {
        id: `u_${Date.now()}`,
        name: form.name.trim(),
        username,
        password: form.password,
        role: form.role,
        scopeAll: form.scopeAll,
        active: true,
        online: false,
        lastActive: '尚未登录',
        avatar: PALETTE[list.length % PALETTE.length],
      },
    ]);
    toast(`已创建成员「${form.name.trim()}」，可使用该用户名与密码登录`);
    setForm({ name: '', username: '', password: '', role: 'editor', scopeAll: true });
    setShowPwd(false);
  };

  const removeMember = () => {
    if (!removeTarget) return;
    if (removeTarget.id === user.id) {
      toast('不能移除当前登录的账号', 'warn');
      setRemoveTarget(null);
      return;
    }
    setMembers((list) =>
      list.map((m) =>
        m.id === removeTarget.id ? { ...m, active: false, online: false, lastActive: '已移除' } : m
      )
    );
    toast(`已移除成员「${removeTarget.name}」`);
    setRemoveTarget(null);
  };

  const reopenMember = (target) => {
    setMembers((list) => list.map((m) => (m.id === target.id ? { ...m, active: true } : m)));
    setMenuFor(null);
    toast(`已恢复「${target.name}」的登录权限`);
  };

  const resetPassword = () => {
    if (!pwdTarget) return;
    if (!pwd || pwd.length < 8) {
      toast('密码至少 8 位', 'warn');
      return;
    }
    setMembers((list) => list.map((m) => (m.id === pwdTarget.id ? { ...m, password: pwd } : m)));
    toast(`已重置「${pwdTarget.name}」的登录密码`);
    setPwdTarget(null);
    setPwd('');
    setPwdShow(false);
  };

  return (
    <div className="page page--fill">
      <header className="head">
        <div>
          <h1 className="head__title">成员与权限</h1>
          <div className="head__sub">
            账号由管理员统一创建，成员使用分配的用户名与密码登录
          </div>
        </div>
        <div className="head__actions">
          <button
            className="btn btn--primary"
            onClick={() => {
              setFlash(true);
              nameRef.current?.focus();
            }}
          >
            <Icon name="plus" size={16} stroke={2} />
            新增成员
          </button>
        </div>
      </header>

      <div className="members-layout">
        <div className="members-left">
          <section className="table-card">
            <div className="table-card__head">
              <div className="card__title">团队成员</div>
              <div className="table-card__count">
                共 {members.length} 人 · 启用 {activeCount} 人 · 4 个角色
              </div>
            </div>

            <div className="thead">
              <div className="thead__main">成员</div>
              <div className="thead__role">角色</div>
              <div className="thead__status">最近活跃</div>
              <div className="thead__op">操作</div>
            </div>

            <div className="tbody">
              {members.map((m, index) => {
                const role = ROLES[m.role] || ROLES.viewer;
                const open = menuFor === m.id;
                const up = index >= members.length - 2;
                const isSelf = m.id === user.id;
                return (
                  <div className={`mrow${m.active ? '' : ' is-disabled'}`} key={m.id}>
                    <div className="mrow__avatar" style={{ background: m.avatar }}>
                      {m.name.slice(0, 1)}
                    </div>
                    <div className="mrow__info">
                      <div className="mrow__name">
                        {m.name}
                        {isSelf ? <span className="self-tag">我</span> : null}
                        {m.online && m.active ? <span className="dot-online" title="在线" /> : null}
                      </div>
                      <div className="mrow__user">
                        <span className="num">@{m.username}</span>
                        <span className="mrow__scope">
                          {m.scopeAll ? '全部素材' : '仅本人内容'}
                        </span>
                      </div>
                    </div>
                    <div className="mrow__role">
                      <span className="role-pill" style={{ background: role.bg, color: role.color }}>
                        {role.label}
                      </span>
                    </div>
                    <div className={`mrow__status${m.lastActive === '在线' ? ' is-online' : ''}`}>
                      {m.lastActive}
                    </div>
                    <div className="mrow__op">
                      <button
                        className="more-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!canManage) {
                            toast('当前角色无权管理成员', 'warn');
                            return;
                          }
                          setMenuFor(open ? null : m.id);
                        }}
                        aria-label="更多操作"
                      >
                        <Icon name="more" size={14} />
                      </button>
                      {open ? (
                        <div
                          className={`menu${up ? ' menu--up' : ''}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {!m.active ? (
                            <button className="menu__item" onClick={() => reopenMember(m)}>
                              <Icon name="refresh" size={13} />
                              恢复登录权限
                            </button>
                          ) : null}
                          <div className="menu__label">设置角色</div>
                          {ASSIGNABLE.map((key) => (
                            <button
                              key={key}
                              className="menu__item"
                              disabled={m.role === 'super'}
                              onClick={() => changeRole(m, key)}
                            >
                              <Icon name="shield" size={13} style={{ color: ROLES[key].color }} />
                              {ROLES[key].label}
                              {m.role === key ? (
                                <Icon
                                  name="check"
                                  size={12}
                                  stroke={2.4}
                                  style={{ marginLeft: 'auto', color: '#14b8a4' }}
                                />
                              ) : null}
                            </button>
                          ))}
                          <div className="menu__sep" />
                          <button
                            className="menu__item"
                            onClick={() => {
                              setMenuFor(null);
                              setPwdTarget(m);
                              setPwd(randomPwd());
                              setPwdShow(false);
                            }}
                          >
                            <Icon name="key" size={13} />
                            重置密码
                          </button>
                          {m.active ? (
                            <button
                              className="menu__item is-danger"
                              onClick={() => {
                                setMenuFor(null);
                                setRemoveTarget(m);
                              }}
                            >
                              <Icon name="trash" size={13} />
                              移除成员
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="table-foot">
              <span>
                共 <span className="num">{members.length}</span> 位成员 · 账号由管理员统一维护
              </span>
              <span className="table-foot__note">
                <Icon name="lock" size={12} stroke={1.8} />
                密码仅管理员可见与重置
              </span>
            </div>
          </section>
        </div>

        <aside className="members-right">
          <form className={`form${flash ? ' is-flash' : ''}`} onSubmit={submit}>
            <div>
              <div className="card__title">新增成员</div>
              <div className="hint" style={{ marginTop: 3 }}>
                创建后请将用户名与初始密码告知成员本人
              </div>
            </div>

            <Field label="姓名" htmlFor="member-name" error={errors.name}>
              <div className="input">
                <input
                  id="member-name"
                  ref={nameRef}
                  value={form.name}
                  placeholder="请输入真实姓名"
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
            </Field>

            <Field label="用户名" htmlFor="member-username" error={errors.username}>
              <div className="input">
                <span className="input__prefix">@</span>
                <input
                  id="member-username"
                  value={form.username}
                  placeholder="用于登录，如 zhangjy"
                  autoComplete="off"
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                />
              </div>
            </Field>

            <Field
              label="初始密码"
              htmlFor="member-password"
              error={errors.password}
              hint={errors.password ? '' : '请将初始密码告知成员本人'}
              action={
                <button
                  type="button"
                  className="link"
                  onClick={() => {
                    setForm({ ...form, password: randomPwd() });
                    setShowPwd(true);
                    setErrors({ ...errors, password: undefined });
                  }}
                >
                  随机生成
                </button>
              }
            >
              <div className="input">
                <input
                  id="member-password"
                  type={showPwd ? 'text' : 'password'}
                  value={form.password}
                  placeholder="至少 8 位"
                  autoComplete="new-password"
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
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

            <Field label="角色权限">
              <Seg
                value={form.role}
                onChange={(v) => setForm({ ...form, role: v })}
                options={ASSIGNABLE.map((key) => ({ key, label: ROLES[key].label }))}
              />
            </Field>

            <Field label="数据范围">
              <Seg
                value={form.scopeAll ? 'all' : 'own'}
                onChange={(v) => setForm({ ...form, scopeAll: v === 'all' })}
                options={[
                  { key: 'all', label: '全部素材' },
                  { key: 'own', label: '仅本人内容' },
                ]}
              />
            </Field>

            <button className="btn btn--primary btn--block" type="submit">
              创建成员
            </button>
          </form>

          <section className="panel role-panel">
            <button
              type="button"
              className={`fold${legendOpen ? ' is-open' : ''}`}
              onClick={() => setLegendOpen((v) => !v)}
              aria-expanded={legendOpen}
            >
              <span className="panel__title">角色说明</span>
              <span className="fold__meta">4 个角色</span>
              <Icon name="chevronDown" size={14} className="fold__arrow" />
            </button>
            {legendOpen
              ? ['super', 'admin', 'editor', 'viewer'].map((key) => (
                  <div className="role-note" key={key}>
                    <div className="role-note__name" style={{ color: ROLES[key].color }}>
                      {ROLES[key].label}
                    </div>
                    <div className="role-note__desc">{ROLE_DESC[key]}</div>
                  </div>
                ))
              : null}
          </section>
        </aside>
      </div>

      <Confirm
        open={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        onConfirm={removeMember}
        title="移除成员"
        sub="移除后该成员立刻失去登录权限，其提交的任务与素材会保留"
        confirmText="确认移除"
        list={
          removeTarget
            ? [{ id: removeTarget.id, name: removeTarget.name, size: `@${removeTarget.username}` }]
            : []
        }
      />

      <Modal
        open={!!pwdTarget}
        onClose={() => {
          setPwdTarget(null);
          setPwd('');
          setPwdShow(false);
        }}
        title="重置登录密码"
        sub={pwdTarget ? `为「${pwdTarget.name}」设置新的登录密码` : ''}
        footer={
          <>
            <button
              className="btn btn--ghost"
              onClick={() => {
                setPwdTarget(null);
                setPwd('');
                setPwdShow(false);
              }}
            >
              取消
            </button>
            <button className="btn btn--primary" onClick={resetPassword}>
              保存新密码
            </button>
          </>
        }
      >
        <Field label="新密码" hint="至少 8 位，保存后旧密码立即失效">
          <div className="input">
            <input
              type={pwdShow ? 'text' : 'password'}
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              placeholder="至少 8 位"
              autoComplete="new-password"
            />
            <button
              type="button"
              className="input__eye"
              onClick={() => setPwdShow((v) => !v)}
              aria-label={pwdShow ? '隐藏密码' : '显示密码'}
            >
              <Icon name={pwdShow ? 'eyeOff' : 'eye'} size={15} stroke={1.8} />
            </button>
          </div>
        </Field>
        <button
          className="btn btn--soft btn--sm"
          type="button"
          onClick={() => {
            setPwd(randomPwd());
            setPwdShow(true);
          }}
        >
          <Icon name="refresh" size={14} stroke={1.9} />
          随机生成一个
        </button>
      </Modal>
    </div>
  );
}
