import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, ArrowUpRight, Camera, Fish, Radio, Waves } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Link } from 'react-router-dom';
import { analyticsApi } from '../services/api';
import { apiMessage, getRows, poolLabel, timeAgo } from '../services/format';
import { PageHeading, Panel, StateBox } from '../components/UI';
import { useToast } from '../context/ToastContext';

function Metric({ label, value, suffix, icon: Icon, foot }) {
  return <div className="stat-card"><div className="stat-label"><span>{label}</span><Icon size={16} className="stat-mark" /></div><div className="stat-value">{value ?? '—'}{suffix && <span style={{ marginLeft: 4, color: 'var(--muted)', fontSize: 13, fontWeight: 500 }}>{suffix}</span>}</div><div className="stat-foot">{foot}</div></div>;
}
export function DashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [live, setLive] = useState(false);
  const notify = useToast();
  const socketRef = useRef(null);
  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try { setData(await analyticsApi.dashboard()); setError(''); }
    catch (requestError) { setError(apiMessage(requestError)); if (!quiet) notify(apiMessage(requestError), 'error'); }
    finally { setLoading(false); }
  }, [notify]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    let active = true;
    let fallbackTimer;
    const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    try {
      const token = localStorage.getItem('pelagic_access_token');
      const socket = new WebSocket(`${scheme}//${window.location.host}/ws/monitoring/global`, token ? [`bearer.${token}`, 'pelagic.monitoring.v1'] : ['pelagic.monitoring.v1']);
      socketRef.current = socket;
      socket.onopen = () => { if (active) setLive(true); };
      socket.onmessage = (event) => {
        try { const snapshot = JSON.parse(event.data); if (active && snapshot) { setData((current) => ({ ...current, ...snapshot })); setError(''); } } catch { /* Ignore malformed monitoring frames. */ }
      };
      socket.onclose = () => { if (active) { setLive(false); fallbackTimer = window.setInterval(() => load(true), 60000); } };
      socket.onerror = () => { socket.close(); };
    } catch { fallbackTimer = window.setInterval(() => load(true), 60000); }
    return () => { active = false; socketRef.current?.close(); if (fallbackTimer) window.clearInterval(fallbackTimer); };
  }, [load]);
  const metrics = data?.metrics || {};
  const activity = getRows(data?.recent_activity);
  const pools = getRows(data?.pools);
  const population = getRows(data?.population_trend);
  const chartData = population.map((point) => ({ ...point, label: point.date ? new Date(point.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '' }));
  return <>
    <PageHeading eyebrow="Farm pulse · today" title="Operations overview" subtitle="A live read on stock, equipment and the work that needs attention." action={<div className="toolbar">{data?.data_mode === 'DEMO' && <span className="tag tag-warn">DEMO DATA</span>}<span className={`tag ${live ? '' : 'tag-warn'}`}><Radio size={11} />{live ? 'API CONNECTED' : 'SYNC FALLBACK'}</span><button className="btn-quiet" onClick={() => load()}>Refresh data</button></div>} />
    {loading && !data ? <div className="stat-grid">{Array.from({ length: 4 }, (_, index) => <div className="skeleton" key={index} />)}</div> : error && !data ? <div className="surface"><StateBox type="error" title="Operations data unavailable" message={error} action={<button className="btn-quiet" onClick={() => load()}>Retry connection</button>} /></div> : <>
      <div className="stat-grid">
        <Metric label="Active pools" value={metrics.total_pools} icon={Waves} foot="Registered production units" />
        <Metric label="Camera systems" value={metrics.total_cameras} icon={Camera} foot={`${metrics.online_cameras ?? '—'} online · ${metrics.offline_cameras ?? '—'} offline`} />
        <Metric label="Fish in system" value={metrics.total_fish?.toLocaleString?.() ?? metrics.total_fish} icon={Fish} foot={`${metrics.healthy_fish ?? '—'} screened as healthy`} />
        <Metric label="Estimated biomass" value={metrics.estimated_biomass_kg?.toLocaleString?.() ?? metrics.estimated_biomass_kg} suffix="kg" icon={Activity} foot={`${metrics.disease_alerts ?? '—'} disease alerts to review`} />
      </div>
      <div className="dashboard-grid">
        <Panel title="Population trend" meta="LATEST REPORTED FISH COUNT" action={<span className="tag"><Activity size={11} /> Stock</span>}>
          {chartData.length ? <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ top: 10, right: 12, left: -16, bottom: 0 }}><defs><linearGradient id="stockFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#64b9a7" stopOpacity={0.34} /><stop offset="95%" stopColor="#64b9a7" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="var(--line)" strokeDasharray="3 5" vertical={false} /><XAxis dataKey="label" tick={{ fill: '#829b96', fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: '#829b96', fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--ink)', fontSize: 11 }} /><Area type="monotone" dataKey="count" stroke="#2a877c" strokeWidth={2} fill="url(#stockFill)" activeDot={{ r: 4, fill: '#2a877c' }} /></AreaChart></ResponsiveContainer></div> : <StateBox title="No population trend yet" message="Screening records will build this view as data is collected." /> }
        </Panel>
        <Panel title="Recent activity" meta="LATEST FARM EVENTS" action={<Link to="/alerts" className="btn-quiet">View alerts <ArrowUpRight size={13} /></Link>}>
          {activity.length ? <div className="activity-list">{activity.slice(0, 5).map((item) => <div className="activity-item" key={item.id ?? `${item.message}-${item.created_at}`}><span className="activity-dot" /><div><div className="activity-message">{item.message || item.type || 'Farm activity recorded'}</div><div className="activity-time">{timeAgo(item.created_at)}</div></div></div>)}</div> : <StateBox title="All quiet on the farm" message="Updates from screening and equipment will appear here." />}
        </Panel>
      </div>
      <div style={{ marginTop: 16 }}>
        <Panel title="Production units" meta="POOL SNAPSHOT" action={<Link className="btn-quiet" to="/pools">All pools <ArrowUpRight size={13} /></Link>}>
          {pools.length ? <div className="pool-strip">{pools.slice(0, 3).map((pool) => <Link to={`/pools/${pool.id ?? pool.pool_id}`} className="pool-mini" key={pool.id ?? pool.pool_id}><div className="pool-mini-name">{poolLabel(pool)}</div><div className="pool-mini-meta">{pool.species || 'Species not set'} · {pool.status || 'Status not reported'}</div></Link>)}</div> : <StateBox title="No pool records" message="Create your first production unit to see farm status at a glance." action={<Link className="btn-aqua" to="/pools/new">Add a pool</Link>} />}
        </Panel>
      </div>
    </>}
  </>;
}