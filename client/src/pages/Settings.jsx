import { useEffect, useState } from "react";
import { CheckCircle2, Database, Moon, Shield, Sun, Waves, Workflow } from "lucide-react";
import api, { getErrorMessage } from "../services/api";
import { useAuth, useToast } from "../context";
import { EmptyState, LoadingBlock, PageHeading, Panel, StatusBadge } from "../components/common";

export default function Settings() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const [health, setHealth] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem("fishcheck_theme") || "dark");
  const [loading, setLoading] = useState(true);
  const refresh = () => api.get("/health").then(({ data }) => setHealth(data)).catch((error) => toast.error(getErrorMessage(error))).finally(() => setLoading(false));
  useEffect(() => { refresh(); }, []);
  const setColorTheme = (value) => {
    setTheme(value);
    localStorage.setItem("fishcheck_theme", value);
    document.documentElement.dataset.theme = value;
    toast.success(`${value === "dark" ? "Dark" : "Light"} mode enabled.`);
  };
  if (loading) return <LoadingBlock label="Loading workspace settings…" />;
  return (
    <div>
      <PageHeading eyebrow="WORKSPACE PREFERENCES" title="Settings" description="Review your account, storage connection, model readiness, and display preferences." />
      <div className="settings-grid">
        <Panel title="Farm workspace" subtitle="Workspace connection and persistence">
          <div className="settings-detail"><span className="settings-icon"><Waves size={17} /></span><span><strong>Bluewater Farms</strong><small>Primary workspace · {health?.storage === "mongodb" ? "Connected database" : "Demo memory store"}</small></span><StatusBadge value={health?.storage === "mongodb" ? "online" : "warning"}>{health?.storage === "mongodb" ? "Connected" : "Demo mode"}</StatusBadge></div>
          {health?.storage === "demo" && <div className="settings-note"><Database size={15} /><p>No MongoDB connection is configured. Changes currently live in server memory and are cleared on restart. Add <code>MONGODB_URL</code> and <code>DATABASE_NAME</code> in workspace secrets/environment settings to persist farm data.</p></div>}
          <div className="settings-row"><span>API status</span><span className="settings-value"><i className="status-dot" /> Operational</span></div>
          <div className="settings-row"><span>Data mode</span><span className="settings-value">{health?.storage === "mongodb" ? "MongoDB persistence" : "Temporary demo data"}</span></div>
        </Panel>
        <Panel title="AI model services" subtitle="Checkpoints and capabilities currently available">
          <div className="model-service-list">{[
            ["Species classification", health?.ai?.species_classifier, "Bundled EfficientNet checkpoint"],
            ["Health classification", health?.ai?.disease_classifier, "Preliminary screening only"],
            ["Fish detector", health?.ai?.fish_detector, "No trained detection weights configured"],
            ["Length / weight", health?.ai?.length_calibration && health?.ai?.weight_estimator, "Requires scale reference and calibration"],
          ].map(([name, ready, note]) => <div className="model-service" key={name}><span className={`model-indicator ${ready ? "model-ready" : ""}`}>{ready ? <CheckCircle2 size={16} /> : <Workflow size={16} />}</span><span><strong>{name}</strong><small>{note}</small></span><StatusBadge value={ready ? "online" : "unknown"}>{ready ? "Ready" : "Not configured"}</StatusBadge></div>)}</div>
        </Panel>
        <Panel title="Appearance" subtitle="Choose a comfortable display theme">
          <div className="theme-choice-row">{[["dark", Moon, "Dark", "Low-glare monitoring"], ["light", Sun, "Light", "Bright workspace"]].map(([value, Icon, label, note]) => <button key={value} className={`theme-choice ${theme === value ? "selected" : ""}`} onClick={() => setColorTheme(value)}><span className="theme-choice-icon"><Icon size={17} /></span><span><b>{label}</b><small>{note}</small></span>{theme === value && <CheckCircle2 size={15} className="theme-check" />}</button>)}</div>
        </Panel>
        <Panel title="Your account" subtitle="Signed in profile and access">
          <div className="account-card"><span className="avatar">{(user?.name || "F").split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><span><strong>{user?.name}</strong><small>{user?.email}</small></span><span className={`role-label role-${user?.role}`}>{user?.role}</span></div>
          <div className="settings-row"><span>Access role</span><span className="settings-value">{user?.role}</span></div>
          <button className="btn-secondary settings-signout" onClick={logout}><Shield size={14} /> Sign out</button>
        </Panel>
      </div>
      {health?.ai?.errors && Object.keys(health.ai.errors).length > 0 && <div className="settings-warning"><i className="bi bi-exclamation-circle" /><span>One or more classifier checkpoints could not be loaded. Confirm the runtime dependencies and checkpoint compatibility before relying on AI results.</span></div>}
    </div>
  );
}