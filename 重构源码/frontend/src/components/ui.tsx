import { useEffect, type ReactNode } from 'react';
import Icon from './Icon';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  sub?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: number;
}

export function Modal({ open, onClose, title, sub, children, footer, width }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal"
        style={width ? { maxWidth: width } : undefined}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal__head">
          <div>
            <div className="modal__title">{title}</div>
            {sub ? <div className="modal__sub">{sub}</div> : null}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="关闭" style={{ background: '#f5fbfa' }}>
            <Icon name="close" size={14} stroke={1.9} />
          </button>
        </div>
        <div className="modal__body">{children}</div>
        {footer ? <div className="modal__foot">{footer}</div> : null}
      </div>
    </div>
  );
}

export interface ConfirmProps {
  open: boolean;
  title?: ReactNode;
  sub?: ReactNode;
  list?: { id: string; name: string; size?: string }[];
  confirmText?: string;
  onConfirm: () => void;
  onClose: () => void;
}

export function Confirm({
  open,
  title,
  sub,
  list,
  confirmText = '确认',
  onConfirm,
  onClose,
}: ConfirmProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      sub={sub}
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose}>
            取消
          </button>
          <button className="btn btn--danger" onClick={onConfirm}>
            {confirmText}
          </button>
        </>
      }
    >
      {list && list.length ? (
        <div className="pick-list">
          {list.map((item) => (
            <div className="pick" key={item.id}>
              <Icon name="trash" size={14} style={{ color: '#b85f49' }} />
              <span className="pick__name">{item.name}</span>
              <span className="pick__size">{item.size}</span>
            </div>
          ))}
        </div>
      ) : null}
    </Modal>
  );
}

export interface ToastItem {
  id: string;
  text: string;
  tone?: string;
}

export function Toasts({ toasts }: { toasts: ToastItem[] }) {
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div className={`toast${t.tone === 'warn' ? ' toast--warn' : ''}`} key={t.id}>
          <span className="toast__icon">
            <Icon name={t.tone === 'warn' ? 'alert' : 'check'} size={12} stroke={2.2} />
          </span>
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}

export interface FieldProps {
  label?: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  gap?: number;
}

export function Field({ label, htmlFor, hint, error, action, children, gap }: FieldProps) {
  return (
    <div className="field" style={gap ? { gap } : undefined}>
      {label ? (
        <label className="field__label" htmlFor={htmlFor}>
          {label}
          {action ? <span className="field__action">{action}</span> : null}
        </label>
      ) : null}
      {children}
      {error ? <span className="error">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export interface SwitchProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  desc?: ReactNode;
}

export function Switch({ checked, onChange, label, desc }: SwitchProps) {
  return (
    <label className="switch">
      <span className="switch__text">
        <span className="switch__label">{label}</span>
        {desc ? <span className="switch__desc">{desc}</span> : null}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch__track">
        <i />
      </span>
    </label>
  );
}

export interface Option {
  key: string;
  value?: string;
  label: string;
}

export interface SelectProps {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  id?: string;
  ariaLabel?: string;
}

export function Select({ value, onChange, options, id, ariaLabel }: SelectProps) {
  return (
    <span className="select">
      <select id={id} aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
      <Icon name="chevronDown" size={13} stroke={2} />
    </span>
  );
}

export interface SegProps {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  columns?: number;
}

export function Seg({ value, onChange, options, columns }: SegProps) {
  return (
    <div
      className={`seg${columns ? ' seg--grid' : ''}`}
      style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
      role="group"
    >
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          className={`seg__item${value === o.key ? ' is-active' : ''}`}
          onClick={() => onChange(o.key)}
          aria-pressed={value === o.key}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Pill({ tone = 'gray', children }: { tone?: string; children?: ReactNode }) {
  return <span className={`pill pill--${tone}`}>{children}</span>;
}

export interface EmptyProps {
  icon?: string;
  title?: ReactNode;
  sub?: ReactNode;
  children?: ReactNode;
}

export function Empty({ icon = 'folder', title, sub, children }: EmptyProps) {
  return (
    <div className="empty">
      <Icon name={icon} size={28} stroke={1.6} style={{ color: '#b6d6cf' }} />
      <div className="empty__title">{title}</div>
      {sub ? <div className="empty__sub">{sub}</div> : null}
      {children}
    </div>
  );
}
