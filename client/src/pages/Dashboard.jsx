import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Camera, Fish,
  ClipboardList, FlaskConical, Plus, Waves, Wind,
} from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip,
  XAxis, YAxis, Bar, BarChart,
} from "recharts";
import api, { getErrorMessage } from "../services/api";
import { useAuth, useToast } from "../context";
import { EmptyState, LoadingBlock, MetricCard, PageHeading, Panel, StatusBadge } from "../components/common";

const palette = ["#6bd6b2", "#79b8ff", "#f3bd72", "#b89df2", "#f38d9a", "#61ced3"];
const number = (value) => new Intl.NumberFormat("en-US").format(value || 0);

function PoolCard({ pool, index }) {
  return (
    <Link to={`/pools/${pool.id}`} className="pool-card">
      <div className={`pool-water pool-water-${index % 4}`}><span className="water-wave wave-a" /><span className="water-wave wave-b" /><span className="water-glow" /><span className="pool-card-id">{pool.id}</span><span className="pool-water-icon"><Waves size={25} /></span></div>
      <div className="pool-card-body">
        <div className="pool-card-title"><div><h3>{pool.name}</h3><span>{pool.location || "Farm location"}</span></div><StatusBadge value={pool.health}>{pool.health || "Unknown"}</StatusBadge></div>
        <div className="pool-card-metrics">
          <div><span>Population</span><strong>{number(pool.fish_count)}</strong></div>
          <div><span>Species</span><strong className="truncate">{pool.species || "Unspecified"}</strong></div>
          <div><span>Water</span><strong>{pool.temperature_c != null ? `${pool.temperature_c}°` : "—"}</strong></div>
        </div>
        <div className="pool-card-footer"><span className="camera-online"><i className={`status-dot ${pool.camera_status === "offline" ? "dot-offline" : ""}`} />{pool.camera_id || "No camera"}</span><span className="pool-open">View pool <ArrowRight size={13} /></span></div>
      </div>
    </Link>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [pools, setPools] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [error, setError] = useState("");
  const toast = useToast();

  const refresh = async () => {
    try {
      const [analytics, poolResponse, alertResponse] = await Promise.all([
        api.get("/analytics/dashboard"), api.get("/pools"), api.get("/alerts"),
      ]);
      setData(analytics.data);
      setPools(poolResponse.data);
      setAlerts(alertResponse.data.filter((alert) => alert.status !== "resolved"));
      setError("");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  };
  useEffect(() => { refresh(); }, []);

  const summary = data?.summary;
  const allPoolsValue = useMemo(() => data?.fish_by_pool || [], [data]);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  if (!data && error) return <EmptyState icon={Activity} title="Could not load the farm overview" description={error} action={<button className="btn-secondary" onClick={refresh}>Retry</button>} />;
  if (!data) return <LoadingBlock />;

  return (
    <div className="dashboard-page">
      <PageHeading
        eyebrow="FARM OPERATIONS"
        title={`${greeting}, ${user?.name?.split(" ")[0] || "there"}`}
        description="Here’s what’s happening across your farm today."
        action={<Link to="/analysis" className="btn-primary"><Plus size={16} /> New analysis</Link>}
      />
      {data.sample_data && <div className="sample-note"><i className="bi bi-info-circle" /><span>Sample telemetry for exploration. Pool counts and status below are illustrative, not live sensor readings.</span></div>}
      <div className="metric-grid">
        <MetricCard label="Total pools" value={number(summary.total_pools)} subtext="Across your farm" icon={Waves} />
        <MetricCard label="Cameras online" value={`${number(summary.online_cameras)} / ${number(summary.total_cameras)}`} subtext={`${number(summary.offline_cameras)} currently offline`} icon={Camera} tone="blue" />
        <MetricCard label="Estimated population" value={number(summary.total_fish)} subtext="Pool baseline estimates" icon={Fish} tone="violet" />
        <MetricCard label="Health reviews" value={number(summary.health_alerts)} subtext="Open farm observations" icon={Activity} tone={summary.health_alerts > 0 ? "amber" : "mint"} />
      </div>
      <div className="dashboard-chart-grid">
        <Panel title="Fish population by pool" subtitle="Current pool baseline" action={<Link to="/analytics" className="panel-link">View analytics <ArrowRight size={13} /></Link>}>
          {allPoolsValue.length ? (
            <div className="chart-wrap chart-tall">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={allPoolsValue} margin={{ top: 5, right: 8, bottom: 0, left: -18 }}>
                  <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="var(--stroke)" />
                  <XAxis dataKey="pool" tick={{ fill: "var(--faint)", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "var(--faint)", fontSize: 9 }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: "rgba(107,214,178,.05)" }} contentStyle={{ borderRadius: 9, border: "1px solid var(--stroke-strong)", background: "var(--surface)", color: "var(--text)", fontSize: 11 }} />
                  <Bar dataKey="count" radius={[5, 5, 0, 0]} maxBarSize={35}>{allPoolsValue.map((entry, index) => <Cell key={entry.pool} fill={palette[index % palette.length]} fillOpacity={.82} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState title="No pool data yet" description="Add a pool to start tracking farm activity." />}
          <div className="chart-caption"><span className="legend-dot" /> Fish estimate per pool <span className="chart-caption-note">Sample baseline</span></div>
        </Panel>
        <Panel title="Species mix" subtitle="Population allocation">
          {data.species_distribution.length ? (
            <div className="species-chart-area">
              <div className="chart-wrap species-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.species_distribution.slice(0, 6).map((entry) => ({ ...entry, short: entry.name.length > 12 ? `${entry.name.slice(0, 11)}…` : entry.name }))} margin={{ top: 7, right: 2, bottom: 0, left: -20 }}>
                    <defs><linearGradient id="speciesFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6bd6b2" stopOpacity={.25} /><stop offset="95%" stopColor="#6bd6b2" stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="var(--stroke)" />
                    <XAxis dataKey="short" tick={{ fill: "var(--faint)", fontSize: 8 }} axisLine={false} tickLine={false} />
                    <YAxis hide />
                    <Tooltip contentStyle={{ borderRadius: 9, border: "1px solid var(--stroke-strong)", background: "var(--surface)", color: "var(--text)", fontSize: 10 }} />
                    <Area type="monotone" dataKey="value" stroke="#6bd6b2" strokeWidth={2} fill="url(#speciesFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="species-legend">{data.species_distribution.slice(0, 4).map((species, index) => <div key={species.name}><i style={{ background: palette[index] }} /><span>{species.name}</span><b>{number(species.value)}</b></div>)}</div>
            </div>
          ) : <EmptyState title="Species data will appear here" description="Run a photo analysis to add species observations." />}
        </Panel>
      </div>
      <div className="section-row-title"><div><h2>Pool monitoring</h2><span>{pools.length} water bodies · {number(summary.online_cameras)} cameras online</span></div><Link to="/pools" className="panel-link">All pools <ArrowRight size={13} /></Link></div>
      <div className="pool-grid">{pools.slice(0, 6).map((pool, index) => <PoolCard key={pool.id} pool={pool} index={index} />)}</div>
      <div className="dashboard-lower-grid">
        <Panel title="Needs attention" subtitle="Open farm observations" action={<Link to="/alerts" className="panel-link">See all <ArrowRight size={13} /></Link>}>
          {alerts.length ? <div className="attention-list">{alerts.slice(0, 3).map((alert) => <Link to="/alerts" key={alert.id} className="attention-item"><span className={`attention-icon attention-${alert.severity}`}><Wind size={16} /></span><span className="attention-copy"><strong>{alert.title}</strong><small>{alert.pool_id} · {alert.message}</small></span><ArrowUpRight size={15} className="muted-icon" /></Link>)}</div> : <EmptyState title="All clear" description="There are no open observations." /> }
        </Panel>
        <Panel title="Model readiness" subtitle="AI services available in this workspace">
          <div className="readiness-list">
            <div><span className="readiness-icon"><Fish size={15} /></span><span><strong>Species classification</strong><small>EfficientNet model</small></span><StatusBadge value={data.ai?.species_classifier ? "online" : "offline"}>{data.ai?.species_classifier ? "Ready" : "Unavailable"}</StatusBadge></div>
            <div><span className="readiness-icon readiness-blue"><FlaskConical size={15} /></span><span><strong>Health classification</strong><small>Preliminary review only</small></span><StatusBadge value={data.ai?.disease_classifier ? "online" : "offline"}>{data.ai?.disease_classifier ? "Ready" : "Unavailable"}</StatusBadge></div>
            <div><span className="readiness-icon readiness-amber"><Activity size={15} /></span><span><strong>Fish detection & sizing</strong><small>Detector / calibration required</small></span><StatusBadge value="unknown">Not configured</StatusBadge></div>
          </div>
        </Panel>
      </div>
      <Panel title="Recent farm activity" subtitle="Changes and reviews in your workspace" action={<span className="data-caption"><ClipboardList size={12} /> Audit trail</span>}>
        {data.recent_activity?.length ? <div className="activity-list">{data.recent_activity.map((entry) => <div className="activity-row" key={entry.id}><span className="activity-mark"><Activity size={14} /></span><span className="activity-copy"><strong>{entry.action.replaceAll("_", " ").toLowerCase()}</strong><small>{entry.user_name || "Farm member"}{entry.pool_id ? ` · ${entry.pool_id}` : ""}</small></span><time>{new Date(entry.timestamp).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time></div>)}</div> : <EmptyState icon={ClipboardList} title="No activity recorded yet" description="Pool updates, analyses, and team changes will appear here." />}
      </Panel>
    </div>
  );
}