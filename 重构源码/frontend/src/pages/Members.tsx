/** 成员与权限：账号统一由 admin / super 维护（路由、接口、数据三层拦截）。 */
import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon';
import { Confirm, Field, Modal, Seg } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { ROLES, fmtTime } from '../lib/constants';
import type { PageProps } from '../lib/props';
import type { User } from '../lib/types';

const ROLE_DESC: Record<string, string> = {
  super: '唯一最高权限，可管理全部账号（含管理员）与系统设置',
  admin: '可管理游客账号与系统设置，不能管理其他管理员',
  editor: '可创建、编辑与上传素材，不可管理成员',
  guest: '可浏览与下载被授权的素材',
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

export default function Members({ user, toast }: PageProps) {
  const [members, setMembers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<User | null>(null);
  const [pwdTarget, setPwdTarget] = useState<User | null>(null);
  const [pwd, setPwd] = useState('');
  const [pwdShow, setPwdShow] = useState(false);
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({ name: '', username: '', password: '' });
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [editShowPwd, setEditShowPwd] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [form, setForm] = useState({
    name: '',
    username: '',
    password: '',
    role: 'guest',
    scopeAll: true,
  });
  const [showPwd, setShowPwd] = useState(false);
  const [legendOpen, setLegendOpen] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const nameRef = useRef<HTMLInputElement | null>(null);

  const isSuper = user.role === 'super';
  const isAdmin = user.role === 'admin';
  /** 可分配角色：超级管理员可分配管理员/编辑者/游客；管理员只能建游客 */
  const assignable = isSuper ? ['admin', 'editor', 'guest'] : ['guest'];
  /** 能否管理某个成员：不能动自己（改自己走个人资料），管理员只能动游客 */
  const canManageTarget = (m: User) =>
    m.id !== user.id && (isSuper || (isAdmin && m.role === 'guest'));

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const page = await api.users({ page_size: 100 });
        setMembers(page.items);
      } catch (err) {
        if (!silent) toast(err instanceof ApiError ? err.message : '成员列表加载失败', 'warn');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    load();
  }, [load]);

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

  const activeCount = members.filter((m) => m.is_active !== false).length;

  const changeRole = async (target: User, role: string) => {
    setMenuFor(null);
    try {
      await api.updateUser(target.id, { role });
      toast(`已将「${target.name}」设为${ROLES[role as keyof typeof ROLES].label}`);
      load(true);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '角色修改失败', 'warn');
    }
  };

  const toggleActive = async (target: User) => {
    setMenuFor(null);
    try {
      await api.updateUser(target.id, { is_active: target.is_active === false });
      toast(target.is_active === false ? `已恢复「${target.name}」的登录权限` : `已停用「${target.name}」`);
      load(true);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '状态修改失败', 'warn');
    }
  };

  const toggleScope = async (target: User) => {
    setMenuFor(null);
    try {
      await api.updateUser(target.id, { scope_all: !target.scope_all });
      toast('数据范围已更新');
      load(true);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '数据范围修改失败', 'warn');
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
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

    setCreating(true);
    try {
      await api.createUser({
        name: form.name.trim(),
        username,
        password: form.password,
        role: form.role,
        scope_all: form.scopeAll,
      });
      toast(`已创建成员「${form.name.trim()}」，可使用该用户名与密码登录`);
      setForm({ name: '', username: '', password: '', role: 'guest', scopeAll: true });
      setShowPwd(false);
      load(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'DUPLICATE_USERNAME') {
        setErrors({ username: '该用户名已被占用' });
      }
      toast(err instanceof ApiError ? err.message : '创建失败', 'warn');
    } finally {
      setCreating(false);
    }
  };

  const removeMember = async () => {
    if (!removeTarget) return;
    if (removeTarget.id === user.id) {
      toast('不能移除当前登录的账号', 'warn');
      setRemoveTarget(null);
      return;
    }
    try {
      await api.deleteUser(removeTarget.id);
      toast(`已移除成员「${removeTarget.name}」`);
      load(true);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '移除失败', 'warn');
    } finally {
      setRemoveTarget(null);
    }
  };

  const openEdit = (target: User) => {
    setMenuFor(null);
    setEditTarget(target);
    setEditForm({ name: target.name, username: target.username, password: '' });
    setEditErrors({});
    setEditShowPwd(false);
  };

  const saveEdit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!editTarget) return;
    const next: Record<string, string> = {};
    const uname = editForm.username.trim().toLowerCase();
    if (!editForm.name.trim()) next.name = '请填写姓名';
    if (!uname) next.username = '请填写用户名';
    else if (!/^[A-Za-z0-9_.-]{3,20}$/.test(uname))
      next.username = '3–20 位，仅支持字母、数字、下划线与点';
    else if (
      members.some(
        (m) => m.id !== editTarget.id && (m.username || '').toLowerCase() === uname,
      )
    )
      next.username = '该用户名已被占用';
    if (editForm.password && editForm.password.length < 8) next.password = '密码至少 8 位';
    setEditErrors(next);
    if (Object.keys(next).length) return;

    const body: { name?: string; username?: string; password?: string } = {};
    if (editForm.name.trim() !== editTarget.name) body.name = editForm.name.trim();
    if (uname !== editTarget.username) body.username = uname;
    if (editForm.password) body.password = editForm.password;
    if (!Object.keys(body).length) {
      toast('没有需要保存的修改');
      return;
    }

    setSavingEdit(true);
    try {
      await api.updateUser(editTarget.id, body);
      toast(
        `已更新「${editForm.name.trim()}」的账号信息${
          editForm.password ? '，原密码已立即失效' : ''
        }`,
      );
      setEditTarget(null);
      load(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'DUPLICATE_USERNAME') {
        setEditErrors({ username: '该用户名已被占用' });
      }
      toast(err instanceof ApiError ? err.message : '保存失败', 'warn');
    } finally {
      setSavingEdit(false);
    }
  };

  const resetPassword = async () => {
    if (!pwdTarget) return;
    if (!pwd || pwd.length < 8) {
      toast('密码至少 8 位', 'warn');
      return;
    }
    try {
      await api.resetPassword(pwdTarget.id, pwd);
      toast(`已重置「${pwdTarget.name}」的登录密码`);
      setPwdTarget(null);
      setPwd('');
      setPwdShow(false);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '重置失败', 'warn');
    }
  };

  return (
    <div className="page page--fill">
      <header className="head">
        <div>
          <h1 className="head__title">成员与权限</h1>
          <div className="head__sub">
            {isSuper
              ? '超级管理员可管理全部账号（含管理员），并可修改姓名、用户名与密码'
              : '管理员只可管理游客账号，其他账号需由超级管理员处理'}
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
                共 {members.length} 人 · 启用 {activeCount} 人 ·{' '}
                {isSuper ? '全部角色' : '仅游客可见'}
              </div>
            </div>

            <div className="thead">
              <div className="thead__main">成员</div>
              <div className="thead__role">角色</div>
              <div className="thead__status">最近登录</div>
              <div className="thead__op">操作</div>
            </div>

            <div className="tbody">
              {loading && !members.length ? (
                <div className="mrow">
                  <span className="skeleton" style={{ height: 14, flex: 1 }} />
                </div>
              ) : !members.length ? (
                <div className="mrow" style={{ justifyContent: 'center', padding: '28px 0' }}>
                  <span className="hint">
                    {isSuper
                      ? '当前只有你一个账号，可在右侧新增管理员或游客'
                      : '暂无可管理的游客账号'}
                  </span>
                </div>
              ) : (
                members.map((m, index) => {
                  const role = ROLES[m.role] || ROLES.guest;
                  const open = menuFor === m.id;
                  const up = index >= members.length - 2;
                  const isSelf = m.id === user.id;
                  const active = m.is_active !== false;
                  return (
                    <div className={`mrow${active ? '' : ' is-disabled'}`} key={m.id}>
                      <div
                        className="mrow__avatar"
                        style={{ background: PALETTE[index % PALETTE.length] }}
                      >
                        {(m.name || m.username).slice(0, 1)}
                      </div>
                      <div className="mrow__info">
                        <div className="mrow__name">
                          {m.name}
                          {isSelf ? <span className="self-tag">我</span> : null}
                          {!active ? <span className="self-tag">已停用</span> : null}
                        </div>
                        <div className="mrow__user">
                          <span className="num">@{m.username}</span>
                          <span className="mrow__scope">
                            {m.scope_all ? '全部素材' : '仅本人内容'}
                          </span>
                        </div>
                      </div>
                      <div className="mrow__role">
                        <span className="role-pill" style={{ background: role.bg, color: role.color }}>
                          {role.label}
                        </span>
                      </div>
                      <div className="mrow__status">
                        {m.last_login_at ? fmtTime(m.last_login_at) : '尚未登录'}
                      </div>
                      <div className="mrow__op">
                        <button
                          className="more-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!canManageTarget(m)) {
                              toast(
                                isSelf
                                  ? '自己的信息请到「个人资料」修改'
                                  : '管理员只能管理游客账号',
                                'warn',
                              );
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
                            <button className="menu__item" onClick={() => openEdit(m)}>
                              <Icon name="edit" size={13} />
                              编辑账号资料
                            </button>
                            <div className="menu__sep" />
                            <button className="menu__item" onClick={() => toggleActive(m)}>
                              <Icon name="refresh" size={13} />
                              {active ? '停用登录权限' : '恢复登录权限'}
                            </button>
                            {isSuper ? (
                              <button className="menu__item" onClick={() => toggleScope(m)}>
                                <Icon name="folder" size={13} />
                                {m.scope_all ? '改为仅本人内容' : '改为全部素材'}
                              </button>
                            ) : null}
                            {isSuper ? (
                              <>
                                <div className="menu__label">设置角色</div>
                                {assignable.map((key) => (
                                  <button
                                    key={key}
                                    className="menu__item"
                                    disabled={m.role === 'super'}
                                    onClick={() => changeRole(m, key)}
                                  >
                                    <Icon
                                      name="shield"
                                      size={13}
                                      style={{ color: ROLES[key as keyof typeof ROLES].color }}
                                    />
                                    {ROLES[key as keyof typeof ROLES].label}
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
                              </>
                            ) : null}
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
                            {active && !isSelf ? (
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
                })
              )}
            </div>

            <div className="table-foot">
              <span>
                共 <span className="num">{members.length}</span> 位成员 ·{' '}
                {isSuper ? '超级管理员可管理全部账号' : '仅显示游客账号'}
              </span>
              <span className="table-foot__note">
                <Icon name="lock" size={12} stroke={1.8} />
                密码可由此处或被管理的本人修改
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
                    setErrors({ ...errors, password: '' });
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

            <Field
              label="角色权限"
              hint={isSuper ? '' : '管理员只能创建游客账号，如需其它角色请联系超级管理员'}
            >
              {isSuper ? (
                <Seg
                  value={form.role}
                  onChange={(v) => setForm({ ...form, role: v })}
                  options={assignable.map((key) => ({
                    key,
                    label: ROLES[key as keyof typeof ROLES].label,
                  }))}
                />
              ) : (
                <div className="input">
                  <input value="游客" readOnly />
                </div>
              )}
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

            <button className="btn btn--primary btn--block" type="submit" disabled={creating}>
              {creating ? '创建中…' : '创建成员'}
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
              ? (['super', 'admin', 'editor', 'guest'] as const).map((key) => (
                  <div className="role-note" key={key}>
                    <div
                      className="role-note__name"
                      style={{ color: ROLES[key as keyof typeof ROLES].color }}
                    >
                      {ROLES[key as keyof typeof ROLES].label}
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

      <Modal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title="编辑账号资料"
        sub={editTarget ? `修改「${editTarget.name}」的姓名、登录用户名与密码` : ''}
        footer={
          <>
            <button className="btn btn--ghost" onClick={() => setEditTarget(null)}>
              取消
            </button>
            <button className="btn btn--primary" onClick={() => saveEdit()} disabled={savingEdit}>
              {savingEdit ? '保存中…' : '保存'}
            </button>
          </>
        }
      >
        <form className="form" onSubmit={saveEdit}>
          <Field label="姓名" htmlFor="edit-name" error={editErrors.name}>
            <div className="input">
              <input
                id="edit-name"
                value={editForm.name}
                placeholder="请输入真实姓名"
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>
          </Field>

          <Field
            label="用户名"
            htmlFor="edit-username"
            error={editErrors.username}
            hint={editErrors.username ? '' : '修改后需使用新用户名登录'}
          >
            <div className="input">
              <span className="input__prefix">@</span>
              <input
                id="edit-username"
                value={editForm.username}
                autoComplete="off"
                onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
              />
            </div>
          </Field>

          <Field
            label="登录密码"
            htmlFor="edit-password"
            error={editErrors.password}
            hint={editErrors.password ? '' : '留空表示不修改；填写后该账号原密码立即失效'}
            action={
              <button
                type="button"
                className="link"
                onClick={() => {
                  setEditForm({ ...editForm, password: randomPwd() });
                  setEditShowPwd(true);
                }}
              >
                随机生成
              </button>
            }
          >
            <div className="input">
              <input
                id="edit-password"
                type={editShowPwd ? 'text' : 'password'}
                value={editForm.password}
                placeholder="留空则不修改"
                autoComplete="new-password"
                onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
              />
              <button
                type="button"
                className="input__eye"
                onClick={() => setEditShowPwd((v) => !v)}
                aria-label={editShowPwd ? '隐藏密码' : '显示密码'}
              >
                <Icon name={editShowPwd ? 'eyeOff' : 'eye'} size={15} stroke={1.8} />
              </button>
            </div>
          </Field>
        </form>
      </Modal>
    </div>
  );
}
