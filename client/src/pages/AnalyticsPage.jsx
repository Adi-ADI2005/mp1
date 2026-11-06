import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { analyticsApi } from '../services/api';
import { apiMessage, getRows } from '../services/format';
import { LoadingBlock, PageHeading, Panel, StateBox } from '../components/UI';
import { useToast } from '../context/ToastContext';

const COLORS = ['#217d73', '#e18a69', '#d2aa55', '#6eaaa1', '#8b9f78', '#d4b7a0'];
function ChartState({ data, children }) {
  return data?.length ? children : <StateBox title="Not enough data yet" message="This view will populate once farm readings and screening results are available." />;
}
export function AnalyticsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const notify = useToast();
  const load = async () => {
    setLoading(true);
    try { setData(await analyticsApi.dashboard()); setError(''); }
    catch (requestError) { setError(apiMessage(requestError)); notify(apiMessage(requestError), 'error'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const byPool = useMemo(() => getRows(data?.fish_count_by_pool), [data]);
  const species = useMemo(() => getRows(data?.species_distribution), [data]);
  const diseases = useMemo(() => getRows(data?.disease_distribution), [data]);
  const population = useMemo(() => getRows(data?.population_trend).map((point) => ({ ...point, label: point.date ? new Date(point.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '' })), [data]);
  const weight = useMemo(() => getRows(data?.weight_trend).map((point) => ({ ...point, label: point.date ? new Date(point.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '' })), [data]);
  const length = useMemo(() => getRows(data?.length_trend).map((point) => ({ ...point, label: point.date ? new Date(point.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '' })), [data]);
  const diseaseTrend = useMemo(() => getRows(data?.disease_trend).map((point) => ({ ...point, label: point.date ? new Date(point.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '' })), [data]);
  if (loading && !data) return <><PageHeading eyebrow="Farm intelligence" title="Analytics" subtitle="Performance trends from current production and screening data." /><LoadingBlock count={4} /></>;
  if (error && !data) return <div className="surface"><StateBox type="error" title="Analytics unavailable" message={error} action={<button className="btn-quiet" onClick={load}>Retry</button>} /></div>;
  return <>
    <PageHeading eyebrow="Farm intelligence" title="Analytics" subtitle="Read production, size and health trends across the operation." action={<button className="btn-quiet" onClick={load}>Refresh analytics</button>} />
    <div className="dashboard-grid">
      <Panel title="Stock population" meta="FISH COUNT BY OBSERVATION">
        <ChartState data={population}><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><LineChart data={population} margin={{ top: 5, right: 14, left: -15, bottom: 0 }}><CartesianGrid stroke="var(--line)" strokeDasharray="3 5" vertical={false} /><XAxis dataKey="label" tick={{ fill: '#829b96', fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: '#829b96', fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--ink)', fontSize: 11 }} /><Line dataKey="count" type="monotone" stroke="#217d73" strokeWidth={2} dot={false} activeDot={{ r: 4 }} /></LineChart></ResponsiveContainer></div></ChartState>
      </Panel>
      <Panel title="Stock by pool" meta="LATEST POOL COUNTS"><ChartState data={byPool}><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><BarChart data={byPool} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}><CartesianGrid stroke="var(--line)" strokeDasharray="3 5" vertical={false} /><XAxis dataKey="pool_name" tick={{ fill: '#829b96', fontSize: 9 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: '#829b96', fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--ink)', fontSize: 11 }} /><Bar dataKey="count" fill="#68b7a7" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></ChartState></Panel>
      <Panel title="Average weight" meta="GRAMS PER FISH"><ChartState data={weight}><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><LineChart data={weight} margin={{ top: 5, right: 14, left: -15, bottom: 0 }}><CartesianGrid stroke="var(--line)" strokeDasharray="3 5" vertical={false} /><XAxis dataKey="label" tick={{ fill: '#829b96', fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: '#829b96', fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--ink)', fontSize: 11 }} /><Line dataKey="weight_g" type="monotone" stroke="#d19453" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div></ChartState></Panel>
      <Panel title="Average length" meta="CENTIMETERS PER FISH"><ChartState data={length}><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><LineChart data={length} margin={{ top: 5, right: 14, left: -15, bottom: 0 }}><CartesianGrid stroke="var(--line)" strokeDasharray="3 5" vertical={false} /><XAxis dataKey="label" tick={{ fill: '#829b96', fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: '#829b96', fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--ink)', fontSize: 11 }} /><Line dataKey="length_cm" type="monotone" stroke="#ae7564" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div></ChartState></Panel>
      <Panel title="Species mix" meta="SCREENED POPULATION"><ChartState data={species}><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={species} dataKey="count" nameKey="name" innerRadius={54} outerRadius={86} paddingAngle={3} stroke="none">{species.map((item, index) => <Cell key={item.name} fill={COLORS[index % COLORS.length]} />)}</Pie><Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--ink)', fontSize: 11 }} /></PieChart></ResponsiveContainer></div><div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 12, padding: '0 12px 14px' }}>{species.map((item, index) => <span key={item.name} className="section-kicker"><i style={{ display: 'inline-block', width: 7, height: 7, marginRight: 5, borderRadius: '50%', background: COLORS[index % COLORS.length] }} />{item.name} · {item.count}</span>)}</div></ChartState></Panel>
      <Panel title="Disease observations" meta="SCREENING FINDINGS"><ChartState data={diseases}><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><BarChart data={diseases} layout="vertical" margin={{ top: 5, right: 16, left: 12, bottom: 0 }}><CartesianGrid stroke="var(--line)" strokeDasharray="3 5" horizontal={false} /><XAxis type="number" tick={{ fill: '#829b96', fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis dataKey="name" type="category" tick={{ fill: '#829b96', fontSize: 10 }} axisLine={false} tickLine={false} width={84} /><Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--ink)', fontSize: 11 }} /><Bar dataKey="count" fill="#d87c64" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer></div></ChartState></Panel>
      <Panel title="Disease trend" meta="FLAGGED DETECTIONS"><ChartState data={diseaseTrend}><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><LineChart data={diseaseTrend} margin={{ top: 5, right: 14, left: -15, bottom: 0 }}><CartesianGrid stroke="var(--line)" strokeDasharray="3 5" vertical={false} /><XAxis dataKey="label" tick={{ fill: '#829b96', fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: '#829b96', fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--ink)', fontSize: 11 }} /><Line dataKey="count" type="monotone" stroke="#d87c64" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div></ChartState></Panel>
    </div>
  </>;
}