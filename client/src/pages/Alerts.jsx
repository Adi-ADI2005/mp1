import { useEffect, useState } from "react";
import { AlertTriangle, ArrowUpRight, Bell, Check, CheckCircle2, Clock3, Droplets, RefreshCcw } from "lucide-react";
import api, { getErrorMessage } from "../services/api";
import { useToast } from "../context";
import { EmptyState, LoadingBlock, PageHeading, StatusBadge } from "../components/common";

const iconFor = (severity) => severity === "high" ? AlertTriangle : severity === "medium" ? Droplets : Bell;

export default function Alerts() {
  const toast = useToast();
  const [alerts, setAlerts] = useState([]);
  const [filter, setFilter] = useState("open");
  const [loading, setLoading] = useState(true);
  const refresh = () => api.get("/alerts").then(({ data }) => setAlerts(data)).catch((error) => toast.error(getErrorMessage(error))).finally(() => setLoading(false));
  useEffect(() => { refresh(); }, []);
  const resolve = async (alert) => {
    try {
      await api.post(`/alerts/${alert.id}/resolve`);
      toast.success("Observation marked as reviewed.");
      refresh();
    } catch (error) { toast.error(getErrorMessage(error)); }
  };
  const visible = alerts.filter((alert) => filter === "all" || alert.status === filter);
  if (loading) return <LoadingBlock label="Loading alerts…" />;
  return (
    <div>
      <PageHeading eyebrow="FARM OBSERVATIONS" title="Alert centre" description="Review water, camera, and health observations across your pools." action={<button className="btn-secondary" onClick={refresh}><RefreshCcw size={14} /> Refresh</button>} />
      <div className="alert-summary-row"><div className="alert-summary"><span className="attention-icon attention-high"><AlertTriangle size={16} /></span><span><b>{alerts.filter((alert) => alert.status !== "resolved" && alert.severity === "high").length}</b><small>High priority</small></span></div><div className="alert-summary"><span className="attention-icon attention-medium"><Clock3 size={16} /></span><span><b>{alerts.filter((alert) => alert.status !== "resolved").length}</b><small>Open reviews</small></span></div><div className="alert-summary"><span className="attention-icon attention-good"><CheckCircle2 size={16} /></span><span><b>{alerts.filter((alert) => alert.status === "resolved").length}</b><small>Reviewed</small></span></div></div>
      <div className="alert-toolbar"><div className="filter-pills">{[["open", "Open"], ["resolved", "Reviewed"], ["all", "All alerts"]].map(([key, label]) => <button key={key} className={filter === key ? "selected" : ""} onClick={() => setFilter(key)}>{label}<span>{key === "all" ? alerts.length : alerts.filter((alert) => key === "open" ? alert.status !== "resolved" : alert.status === key).length}</span></button>)}</div><span className="data-caption"><i className="bi bi-info-circle" /> Example observations in demo mode</span></div>
      <div className="alert-list">
        {visible.map((alert) => {
          const Icon = iconFor(alert.severity);
          return <article className={`alert-card alert-card-${alert.severity}`} key={alert.id}><span className={`attention-icon attention-${alert.severity}`}><Icon size={17} /></span><div className="alert-content"><div className="alert-title-line"><h3>{alert.title}</h3><StatusBadge value={alert.status === "resolved" ? "resolved" : alert.severity}>{alert.status === "resolved" ? "Reviewed" : `${alert.severity} priority`}</StatusBadge></div><p>{alert.message}</p><div className="alert-meta"><span><Droplets size={13} /> Pool {alert.pool_id || "—"}</span><span><Clock3 size={13} /> {new Date(alert.created_at).toLocaleString()}</span></div></div><div className="alert-actions">{alert.status !== "resolved" ? <button className="btn-secondary compact" onClick={() => resolve(alert)}><Check size={14} /> Mark reviewed</button> : <span className="resolved-label"><CheckCircle2 size={14} /> Reviewed</span>}<ArrowUpRight size={15} className="muted-icon" /></div></article>;
        })}
      </div>
      {!visible.length && <EmptyState icon={CheckCircle2} title="Nothing to review" description={filter === "open" ? "There are no open observations right now." : "No observations match this filter."} />}
    </div>
  );
}