import Icon from './Icon';
import { ROLES } from '../lib/constants';
import type { User } from '../lib/types';

interface NavItem {
  key: string;
  label: string;
  icon: string;
  badgeKey?: string;
  roles?: string[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

/** 内容生产入口：游客（只读）不显示 */
const PRODUCER_ROLES = ['super', 'admin', 'editor'];

const GROUPS: NavGroup[] = [  {
    label: '总览',
    items: [{ key: 'workbench', label: '工作台', icon: 'grid' }],
  },
  {
    label: '内容生产',
    items: [
      { key: 'video', label: '视频水印', icon: 'video', roles: PRODUCER_ROLES },
      { key: 'article', label: '文章编写', icon: 'doc', roles: PRODUCER_ROLES },
      { key: 'prompt', label: '生图提示词', icon: 'wand', roles: PRODUCER_ROLES },
    ],
  },
  {
    label: '任务与素材',
    items: [
      { key: 'tasks', label: '任务中心', icon: 'list', badgeKey: 'tasks' },
      { key: 'assets', label: '素材库', icon: 'folder' },
    ],
  },
  {
    label: '管理',
    items: [
      { key: 'members', label: '成员与权限', icon: 'users', roles: ['super', 'admin'] },
      { key: 'settings', label: '系统设置', icon: 'gear', roles: ['super', 'admin'] },
    ],
  },
  {
    label: '账号',
    items: [{ key: 'profile', label: '个人资料', icon: 'shield' }],
  },
];

interface SidebarProps {
  current: string;
  onNavigate: (key: string) => void;
  user: User;
  pendingCount?: number;
  onLogout: () => void;
}

export default function Sidebar({ current, onNavigate, user, pendingCount = 0, onLogout }: SidebarProps) {
  const role = ROLES[user.role] || ROLES.guest;
  let hidden = 0;

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand__logo">
          <Icon name="film" size={20} stroke={1.8} />
        </div>
        <div className="brand__text">
          <div className="brand__name">内容中转平台</div>
          <div className="brand__sub">Content Hub</div>
        </div>
      </div>

      <nav className="nav">
        {GROUPS.map((group) => {
          const items = group.items.filter((item) => {
            const allowed = !item.roles || item.roles.includes(user.role);
            if (!allowed) hidden += 1;
            return allowed;
          });
          if (!items.length) return null;
          return (
            <div className="nav__group" key={group.label}>
              <div className="nav__label">{group.label}</div>
              {items.map((item) => (
                <button
                  key={item.key}
                  className={`nav__item${current === item.key ? ' is-active' : ''}`}
                  onClick={() => onNavigate(item.key)}
                >
                  <Icon name={item.icon} size={18} />
                  <span className="nav__text">{item.label}</span>
                  {item.badgeKey === 'tasks' && pendingCount ? (
                    <span className="nav__badge num">{pendingCount}</span>
                  ) : null}
                </button>
              ))}
            </div>
          );
        })}
        {hidden ? (
          <div className="nav__note">
            当前为「{role.label}」，{hidden} 个管理入口已隐藏
          </div>
        ) : null}
      </nav>

      <div className="user-card">
        <div className="avatar" style={{ background: user.avatar }}>
          {user.name.slice(0, 1)}
        </div>
        <div className="user-card__text">
          <div className="user-card__name">{user.name}</div>
          <div className="user-card__role">{role.label}</div>
        </div>
        <button className="user-card__exit" onClick={onLogout} aria-label="退出登录" title="退出登录">
          <Icon name="logout" size={15} stroke={1.8} />
        </button>
      </div>
    </aside>
  );
}
