import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Activity, ArrowLeft, ArrowUpRight, Camera, Droplets, Fish, FlaskConical, Gauge, Waves } from "lucide-react";
import api, { getErrorMessage } from "../services/api";
import { useToast } from "../context";
import { EmptyState, LoadingBlock, PageHeading, Panel, StatusBadge } from "../components/common";

export default function PoolDetails() {
  const { poolId } = useParams();
  const toast = useToast();
  const [pool, setPool] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refresh = () => api.get(`/pools/${poolId}`).then(({ data }) => { setPool(data); setError(""); }).catch((err) => setError(getErrorMessage(err))).finally(() => setLoading(false));
  useEffect(() => { refresh(); }, [poolId]);
  if (loading) return <LoadingBlock label="Loading pool details…" />;
  if (error) return <EmptyState icon={Waves} title="Pool unavailable" description={error} action={<Link to="/pools" className="btn-secondary">Back to pools</Link>} />;

  const camera = pool.camera;
  return (
    <div>
      <Link to="/pools" className="back-link"><ArrowLeft size={15} /> All pools</Link>
      <PageHeading eyebrow={`${pool.id} · ${pool.pool_type || "POOL"}`} title={pool.name} description={`${pool.location || "Location not set"} · Created ${pool.created_at ? new Date(pool.created_at).toLocaleDateString() : "—"}`} action={<Link to="/analysis" className="btn-primary"><FlaskConical size={15} /> Analyze photo</Link>} />
      <div className="pool-detail-hero">
        <div className="pool-detail-cover"><div className="pool-detail-water"><span className="water-wave wave-a" /><span className="water-wave wave-b" /><span className="water-glow" /><span className="pool-detail-mark"><Waves size={36} /></span></div><div className="pool-detail-overlay"><div><span className="detail-kicker">POOL STATUS</span><StatusBadge value={pool.status}>{pool.status}</StatusBadge></div><div><span className="detail-kicker">HEALTH REVIEW</span><StatusBadge value={pool.health}>{pool.health || "Unknown"}</StatusBadge></div></div></div>
        <div className="pool-detail-stats">
          <div><span><Fish size={15} /> Fish estimate</span><strong>{new Intl.NumberFormat("en-US").format(pool.fish_count || 0)}</strong><small>Pool baseline · not an AI count</small></div>
          <div><span><Droplets size={15} /> Water temperature</span><strong>{pool.temperature_c != null ? `${pool.temperature_c}°C` : "—"}</strong><small>Sensor reading</small></div>
          <div><span><Gauge size={15} /> Dissolved oxygen</span><strong>{pool.oxygen_mg_l != null ? `${pool.oxygen_mg_l} mg/L` : "—"}</strong><small>{pool.ph != null ? `pH ${pool.ph}` : "No sensor data"}</small></div>
        </div>
      </div>
      <div className="pool-detail-grid">
        <Panel title="Camera connection" subtitle={camera ? `${camera.id} · ${camera.name}` : "No camera has been assigned."} action={<Link to="/cameras" className="panel-link">Manage cameras <ArrowRight size={13} /></Link>}>
          {camera ? <div className="camera-detail-panel"><div className={`camera-scene ${camera.status === "offline" ? "scene-offline" : ""}`}><div className="scene-grid" /><div className="scene-center"><Camera size={26} /><span>{camera.status === "offline" ? "CAMERA OFFLINE" : "STREAM NOT CONFIGURED"}</span><small>Connect a browser camera or configure an IP/RTSP source.</small></div><span className="scene-corner">{camera.id}</span></div><div className="camera-detail-meta"><span><StatusBadge value={camera.status} /></span><span>{camera.type} · {camera.resolution || "Resolution unknown"}</span><Link to="/cameras">Open camera grid <ArrowUpRight size={13} /></Link></div></div> : <EmptyState icon={Camera} title="No camera assigned" description="Add a camera and assign it to this pool." action={<Link to="/cameras" className="btn-secondary">Manage cameras</Link>} />}
        </Panel>
        <Panel title="Pool specifications" subtitle="Latest recorded water and stock details">
          <div className="spec-list">
            <div><span>Species</span><b>{pool.species || "Unspecified"}</b></div>
            <div><span>Water capacity</span><b>{pool.capacity_l ? `${new Intl.NumberFormat("en-US").format(pool.capacity_l)} L` : "Not provided"}</b></div>
            <div><span>pH</span><b>{pool.ph ?? "Not measured"}</b></div>
            <div><span>Last monitoring</span><b>{pool.last_monitoring ? new Date(pool.last_monitoring).toLocaleString() : "No session recorded"}</b></div>
            <div><span>Average fish length</span><b className="not-measured">Not measured</b></div>
            <div><span>Average fish weight</span><b className="not-measured">Not measured</b></div>
          </div>
        </Panel>
        <Panel title="Recent analysis" subtitle="Image and video results saved for this pool" action={<Link to="/analysis" className="panel-link">New analysis <ArrowUpRight size={13} /></Link>} className="span-two">
          {pool.recent_analyses?.length ? <div className="analysis-history">{pool.recent_analyses.map((item) => <div className="history-row" key={item.id}><span className="history-icon"><FlaskConical size={16} /></span><span><strong>{item.source === "video" ? "Video analysis" : "Image analysis"}</strong><small>{new Date(item.created_at).toLocaleString()}</small></span><span className="history-prediction">{item.result?.species?.label || "Species unavailable"}</span><span className="history-confidence">{item.result?.species?.confidence != null ? `${Math.round(item.result.species.confidence * 100)}%` : "—"}</span></div>)}</div> : <EmptyState icon={Activity} title="No analysis saved yet" description="Upload a clear fish photo to begin species and health classification."> </EmptyState>}
        </Panel>
      </div>
      <div className="preliminary-note"><i className="bi bi-shield-exclamation" /><span>AI health results are preliminary, not a veterinary or clinical diagnosis. Ask a qualified aquaculture or marine expert to review any concern.</span></div>
    </div>
  );
}