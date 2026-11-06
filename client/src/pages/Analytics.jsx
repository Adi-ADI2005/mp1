import { useEffect, useState } from "react";
import { Activity, ArrowRight, BarChart3, ChartNoAxesCombined, Fish, Ruler, Scale, Waves } from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import api, { getErrorMessage } from "../services/api";
import { useToast } from "../context";
import { EmptyState, LoadingBlock, MetricCard, PageHeading, Panel } from "../components/common";

const colors = ["#6bd6b2", "#79b8ff", "#f3bd72", "#b89df2", "#f38d9a", "#61ced3"];
const format = (value) => new Intl.NumberFormat("en-US").format(value || 0);

export default function Analytics() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const refresh = () => api.get("/analytics/dashboard").then(({ data: result }) => setData(result)).catch((error) => toast.error(getErrorMessage(error))).finally(() => setLoading(false));
  useEffect(() => { refresh(); }, []);
  if (loading) return <LoadingBlock label="Preparing farm analytics…" />;
  if (!data) return <EmptyState icon={BarChart3} title="Analytics are unavailable" description="Connect to your farm workspace, then try again." action={<button className="btn-secondary" onClick={refresh}>Retry</button>} />;
  const summary = data.summary;
  return (
    <div>
      <PageHeading eyebrow="FARM DATA" title="Farm analytics" description="Review population baselines, species mix, and what the current data can support." action={<span className={`source-tag ${data.sample_data ? "source-demo" : ""}`}><span className="status-dot" />{data.sample_data ? "Illustrative data" : "Farm records"}</span>} />
      <div className="metric-grid analytics-metrics">
        <MetricCard label="Total population" value={format(summary.total_fish)} subtext="Baseline across all pools" icon={Fish} />
        <MetricCard label="Open health reviews" value={format(summary.health_alerts)} subtext="Requires review" icon={Activity} tone="amber" />
        <MetricCard label="Average length" value={summary.average_length_cm == null ? "—" : `${summary.average_length_cm} cm`} subtext="Requires measured fish records" icon={Ruler} tone="blue" />
        <MetricCard label="Average weight" value={summary.average_weight_g == null ? "—" : `${summary.average_weight_g} g`} subtext="Requires a validated estimator" icon={Scale} tone="violet" />
      </div>
      <div className="analytics-grid">
        <Panel title="Population by pool" subtitle="Current recorded pool estimates">
          {data.fish_by_pool.length ? <div className="chart-wrap analytics-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.fish_by_pool} margin={{ top: 8, right: 8, left: -17, bottom: 0 }}><CartesianGrid strokeDasharray="3 4" vertical={false} stroke="var(--stroke)" /><XAxis dataKey="pool" tick={{ fill: "var(--faint)", fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: "var(--faint)", fontSize: 9 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ borderRadius: 9, border: "1px solid var(--stroke-strong)", background: "var(--surface)", color: "var(--text)", fontSize: 11 }} /><Bar dataKey="count" name="Fish estimate" radius={[5, 5, 0, 0]}>{data.fish_by_pool.map((item, index) => <Cell fill={colors[index % colors.length]} key={item.pool} />)}</Bar></BarChart></ResponsiveContainer></div> : <EmptyState title="No population data" description="Add pool records to see a comparison." />}
        </Panel>
        <Panel title="Species allocation" subtitle="Reported pool baselines">
          {data.species_distribution.length ? <div className="chart-wrap analytics-chart"><ResponsiveContainer width="100%" height="100%"><BarChart layout="vertical" data={data.species_distribution} margin={{ top: 3, right: 10, left: 8, bottom: 0 }}><CartesianGrid strokeDasharray="3 4" horizontal={false} stroke="var(--stroke)" /><XAxis type="number" tick={{ fill: "var(--faint)", fontSize: 9 }} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="name" width={87} tick={{ fill: "var(--muted)", fontSize: 9 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ borderRadius: 9, border: "1px solid var(--stroke-strong)", background: "var(--surface)", color: "var(--text)", fontSize: 11 }} /><Bar dataKey="value" name="Fish estimate" radius={[0, 5, 5, 0]}>{data.species_distribution.map((item, index) => <Cell fill={colors[index % colors.length]} key={item.name} />)}</Bar></BarChart></ResponsiveContainer></div> : <EmptyState title="No species information" description="Add species to a pool or run a photo analysis." />}
        </Panel>
      </div>
      <div className="analytics-grid analytics-lower">
        <Panel title="Population history" subtitle="Recorded detection trend">
          {data.population_history?.length ? <div className="chart-wrap analytics-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data.population_history}><CartesianGrid strokeDasharray="3 4" vertical={false} stroke="var(--stroke)" /><XAxis dataKey="date" tick={{ fill: "var(--faint)", fontSize: 9 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: "var(--faint)", fontSize: 9 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ borderRadius: 9, border: "1px solid var(--stroke-strong)", background: "var(--surface)", color: "var(--text)", fontSize: 11 }} /><Area type="monotone" dataKey="count" stroke="#6bd6b2" fill="#6bd6b2" fillOpacity={.13} /></AreaChart></ResponsiveContainer></div> : <EmptyState icon={ChartNoAxesCombined} title="No historical observations yet" description="The trend will appear after saved analyses or monitoring sessions are available." />}
        </Panel>
        <Panel title="Measurement coverage" subtitle="Only validated measurements are shown">
          <div className="coverage-list">
            <div><span><Ruler size={15} /> Average length</span><b>{summary.average_length_cm == null ? "Not measured" : `${summary.average_length_cm} cm`}</b></div>
            <div><span><Scale size={15} /> Average weight</span><b>{summary.average_weight_g == null ? "Not measured" : `${summary.average_weight_g} g`}</b></div>
            <div><span><Waves size={15} /> Estimated biomass</span><b>{summary.estimated_biomass_kg == null ? "Not measured" : `${summary.estimated_biomass_kg} kg`}</b></div>
            <div className="coverage-note"><i className="bi bi-info-circle" /> Measurements require fish detection, a known scale reference, and a calibrated camera. No estimates are generated without them.</div>
          </div>
        </Panel>
      </div>
      <div className="data-footnote"><i className="bi bi-shield-check" /> Disease classification is preliminary. Consult a qualified aquaculture or marine expert before taking action.</div>
    </div>
  );
}