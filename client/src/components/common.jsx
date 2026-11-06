import { useEffect } from "react";
import { LoaderCircle, X } from "lucide-react";

export function PageHeading({ eyebrow, title, description, action }) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="section-eyebrow">{eyebrow}</div>}
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="page-heading-action">{action}</div>}
    </div>
  );
}

export function StatusBadge({ value = "unknown", children }) {
  const normalized = String(value).toLowerCase();
  const kind = ["healthy", "normal", "online", "active", "resolved"].includes(normalized) ? "good"
    : ["warning", "unstable", "review", "medium"].includes(normalized) ? "warning"
      : ["alert", "offline", "high", "error"].includes(normalized) ? "danger"
        : "neutral";
  return <span className={`status-badge status-${kind}`}><i />{children || normalized.replaceAll("_", " ")}</span>;
}

export function MetricCard({ label, value, subtext, icon: Icon, tone = "mint", trend }) {
  return (
    <div className="metric-card">
      <div className="metric-card-top"><span>{label}</span><span className={`metric-icon metric-${tone}`}><Icon size={17} /></span></div>
      <div className="metric-value">{value}</div>
      <div className="metric-foot"><span>{subtext}</span>{trend && <b>{trend}</b>}</div>
    </div>
  );
}

export function Panel({ title, subtitle, action, children, className = "" }) {
  return (
    <section className={`panel ${className}`}>
      {(title || action) && <div className="panel-heading"><div>{title && <h3>{title}</h3>}{subtitle && <p>{subtitle}</p>}</div>{action}</div>}
      {children}
    </section>
  );
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return <div className="empty-state">{Icon && <span className="empty-icon"><Icon size={22} /></span>}<h3>{title}</h3><p>{description}</p>{action}</div>;
}

export function LoadingBlock({ label = "Loading your workspace…" }) {
  return <div className="loading-block"><LoaderCircle className="spin" size={19} />{label}</div>;
}

export function Modal({ title, subtitle, onClose, children, wide = false }) {
  useEffect(() => {
    const onKeyDown = (event) => event.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
      <div className={`app-modal ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true">
        <div className="modal-header"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={18} /></button></div>
        <div className="modal-content">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, message, confirmLabel = "Delete", onCancel, onConfirm, busy = false }) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="confirm-message">{message}</p>
      <div className="form-actions"><button className="btn-secondary" onClick={onCancel} disabled={busy}>Cancel</button><button className="btn-danger" onClick={onConfirm} disabled={busy}>{busy ? "Working…" : confirmLabel}</button></div>
    </Modal>
  );
}

export function FormField({ label, children, help }) {
  return <label className="form-field"><span>{label}</span>{children}{help && <small>{help}</small>}</label>;
}