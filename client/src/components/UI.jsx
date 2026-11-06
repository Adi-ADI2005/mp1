import { useState } from 'react';
import { AlertCircle, Check, CircleHelp, LoaderCircle, Search, X } from 'lucide-react';

export function PageHeading({ eyebrow, title, subtitle, action }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1 className="page-title">{title}</h1>{subtitle && <p className="page-subtitle">{subtitle}</p>}</div>{action}</div>;
}
export function Panel({ title, meta, action, children, className = '' }) {
  return <section className={`surface ${className}`}><div className="section-head"><div><h2 className="section-title">{title}</h2>{meta && <div className="section-kicker">{meta}</div>}</div>{action}</div>{children}</section>;
}
export function StateBox({ type = 'empty', title, message, action }) {
  const Icon = type === 'error' ? AlertCircle : type === 'success' ? Check : CircleHelp;
  return <div className="state-box"><Icon size={24} strokeWidth={1.5} /><h3>{title}</h3><p>{message}</p>{action && <div style={{ marginTop: 15 }}>{action}</div>}</div>;
}
export function LoadingBlock({ count = 2 }) {
  return <div style={{ display: 'grid', gap: 12, padding: 16 }} aria-label="Loading">{Array.from({ length: count }, (_, i) => <div className="skeleton" key={i} />)}</div>;
}
export function SearchField({ value, onChange, placeholder = 'Search records' }) {
  return <div className="search-wrap"><Search size={14} /><input className="search-input" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></div>;
}
export function Modal({ title, onClose, children, width }) {
  const [busy, setBusy] = useState(false);
  return <div className="modal-backdrop-custom" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="modal-card" style={width ? { width: `min(${width}px, 100%)` } : undefined}><div className="modal-heading"><h2 className="modal-title">{title}</h2><button className="icon-button" type="button" aria-label="Close dialog" onClick={onClose}><X size={16} /></button></div>{typeof children === 'function' ? children({ setBusy, busy }) : children}</div></div>;
}
export function Field({ label, children, ...props }) {
  return <div className="field"><label htmlFor={props.id}>{label}</label>{children || <input {...props} />}</div>;
}
export function SubmitButton({ children, busy, ...props }) {
  return <button className="btn-aqua" disabled={busy || props.disabled} {...props}>{busy ? <><LoaderCircle size={14} className="spin" /> Saving</> : children}</button>;
}
export function StatusTag({ children, tone = 'neutral' }) {
  return <span className={`tag ${tone === 'good' ? '' : tone === 'warn' ? 'tag-warn' : tone === 'danger' ? 'tag-danger' : 'tag-neutral'}`}>{children}</span>;
}