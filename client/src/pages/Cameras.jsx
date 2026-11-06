import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Expand, Fish, Grid2X2, LayoutGrid, Plus, ScanLine, Settings2, Video, VideoOff, X } from "lucide-react";
import api, { getErrorMessage } from "../services/api";
import { useAuth, useToast } from "../context";
import { EmptyState, FormField, LoadingBlock, Modal, PageHeading, StatusBadge } from "../components/common";

function CameraTile({ camera, onAnalyze, onEdit }) {
  const streamRef = useRef(null);
  const videoRef = useRef(null);
  const tileRef = useRef(null);
  const [streaming, setStreaming] = useState(false);
  const [streamError, setStreamError] = useState("");
  const [monitoringStatus, setMonitoringStatus] = useState(camera.status);
  const toast = useToast();

  useEffect(() => {
    const token = localStorage.getItem("fishcheck_token");
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws/camera/${encodeURIComponent(camera.id)}?token=${encodeURIComponent(token || "")}`);
    socket.onmessage = (event) => {
      try { setMonitoringStatus(JSON.parse(event.data).status || camera.status); } catch { /* Ignore malformed heartbeat. */ }
    };
    return () => socket.close();
  }, [camera.id, camera.status]);

  useEffect(() => {
    if (videoRef.current && streamRef.current) videoRef.current.srcObject = streamRef.current;
  }, [streaming]);

  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), []);

  const openBrowserCamera = async () => {
    setStreamError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser does not support camera access.");
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      setStreaming(true);
    } catch (error) {
      const message = error.name === "NotAllowedError" ? "Allow camera access in your browser to start the preview." : error.message;
      setStreamError(message);
      toast.error(message);
    }
  };

  const closeBrowserCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStreaming(false);
  };

  const captureFrame = async () => {
    if (!videoRef.current || !videoRef.current.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext("2d").drawImage(videoRef.current, 0, 0);
    canvas.toBlob((blob) => blob && onAnalyze(blob, camera), "image/jpeg", .92);
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else tileRef.current?.requestFullscreen?.();
  };
  const isOffline = monitoringStatus === "offline" && !streaming;

  return (
    <article className="camera-card" ref={tileRef}>
      <div className={`camera-view ${streaming ? "camera-view-stream" : ""}`}>
        {streaming ? <video ref={videoRef} autoPlay muted playsInline /> : (
          <div className={`camera-visual camera-visual-${Number(camera.id.slice(-1)) % 4} ${isOffline ? "camera-visual-offline" : ""}`}>
            <div className="camera-grid-overlay" />
            <div className="camera-waterline line-1" /><div className="camera-waterline line-2" /><div className="camera-waterline line-3" />
            {isOffline ? <div className="camera-placeholder"><CameraOff size={23} /><span>CAMERA OFFLINE</span><small>Reconnect the source to resume monitoring.</small></div> : <div className="camera-simulation-label"><span className="live-dot" /> SIMULATED VIEW <small>Stream not connected</small></div>}
          </div>
        )}
        <div className="camera-overlay-top"><span className="camera-id-label">{camera.id}</span><span className={`live-pill ${isOffline ? "offline-pill" : ""}`}><i />{streaming ? "LIVE · BROWSER" : isOffline ? "OFFLINE" : "SIMULATED"}</span></div>
        {!isOffline && !streaming && <button className="fullscreen-control" onClick={toggleFullscreen} title="Fullscreen"><Expand size={15} /></button>}
      </div>
      <div className="camera-card-info">
        <div className="camera-card-title"><div><h3>{camera.pool_name || camera.pool_id || "Unassigned pool"}</h3><span>{camera.name}</span></div><StatusBadge value={streaming ? "online" : monitoringStatus} /></div>
        <div className="camera-card-stats"><span><Fish size={14} /><b>{camera.pool_fish_count != null ? new Intl.NumberFormat("en-US").format(camera.pool_fish_count) : "—"}</b> fish estimate</span><span><Camera size={14} />{camera.type}</span></div>
        {streamError && <div className="stream-error">{streamError}</div>}
        <div className="camera-controls">
          {streaming ? <><button className="btn-secondary compact" onClick={closeBrowserCamera}><VideoOff size={14} /> Close</button><button className="btn-primary compact" onClick={captureFrame}><ScanLine size={14} /> Analyze frame</button></> : <><button className="btn-secondary compact" disabled={isOffline} onClick={openBrowserCamera}><Video size={14} /> Open camera</button><button className="btn-quiet compact-quiet" disabled={isOffline} onClick={toggleFullscreen}><Expand size={14} /> Fullscreen</button></>}
          {onEdit && <button className="icon-button camera-edit-control" onClick={() => onEdit(camera)} title="Edit camera"><Settings2 size={14} /></button>}
        </div>
      </div>
    </article>
  );
}

function CameraForm({ initial, pools, onClose, onSaved }) {
  const [form, setForm] = useState({
    camera_id: initial?.id || "", name: initial?.name || "", pool_id: initial?.pool_id || "",
    type: initial?.type || "simulated", url: initial?.url || "", location: initial?.location || "",
    resolution: initial?.resolution || "1920 × 1080", fps: initial?.fps || 30,
    status: initial?.status || "offline",
  });
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const payload = { ...form, fps: Number(form.fps), pool_id: form.pool_id || null };
      if (initial) await api.put(`/cameras/${initial.id}`, payload);
      else await api.post("/cameras", payload);
      toast.success(initial ? "Camera settings saved." : "Camera added to your workspace.");
      onSaved();
      onClose();
    } catch (error) { toast.error(getErrorMessage(error)); }
    finally { setBusy(false); }
  };
  return (
    <Modal title={initial ? "Camera settings" : "Add a camera"} subtitle="Connect a browser webcam or prepare an IP/RTSP source." onClose={onClose}>
      <form className="entity-form" onSubmit={submit}>
        <FormField label="Camera name"><input required minLength="2" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="North pool camera" /></FormField>
        <FormField label="Camera ID" help={initial ? "Camera ID cannot be changed." : "Leave blank to assign an ID."}><input disabled={!!initial} value={form.camera_id} onChange={(e) => set("camera_id", e.target.value.toUpperCase())} placeholder="CAM-007" /></FormField>
        <FormField label="Assign to pool"><select value={form.pool_id} onChange={(e) => set("pool_id", e.target.value)}><option value="">Unassigned</option>{pools.map((pool) => <option value={pool.id} key={pool.id}>{pool.id} · {pool.name}</option>)}</select></FormField>
        <FormField label="Camera type"><select value={form.type} onChange={(e) => set("type", e.target.value)}><option value="simulated">Simulated</option><option value="browser">Browser camera</option><option value="webcam">USB webcam</option><option value="ip">IP camera</option><option value="rtsp">RTSP stream</option></select></FormField>
        {(form.type === "ip" || form.type === "rtsp") && <FormField label="Stream URL" help="Saved for future stream integration. This app does not open RTSP streams yet."><input value={form.url} onChange={(e) => set("url", e.target.value)} placeholder="rtsp://camera-address/stream" /></FormField>}
        <FormField label="Location"><input value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="Pool north wall" /></FormField>
        <FormField label="Status"><select value={form.status} onChange={(e) => set("status", e.target.value)}><option value="offline">Offline</option><option value="online">Online</option><option value="unstable">Unstable</option></select></FormField>
        <div className="form-actions"><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy}>{busy ? "Saving…" : initial ? "Save camera" : "Add camera"}</button></div>
      </form>
    </Modal>
  );
}

export default function Cameras() {
  const { user } = useAuth();
  const toast = useToast();
  const [cameras, setCameras] = useState([]);
  const [pools, setPools] = useState([]);
  const [layout, setLayout] = useState(4);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);

  const refresh = async () => {
    try {
      const [cameraResponse, poolResponse] = await Promise.all([api.get("/cameras"), api.get("/pools")]);
      setCameras(cameraResponse.data.map((camera) => ({
        ...camera,
        pool_fish_count: poolResponse.data.find((pool) => pool.id === camera.pool_id)?.fish_count,
      })));
      setPools(poolResponse.data);
    } catch (error) { toast.error(getErrorMessage(error)); }
    finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);

  const analyzeFrame = async (blob, camera) => {
    const body = new FormData();
    body.append("image", blob, `${camera.id}-capture.jpg`);
    if (camera.pool_id) body.append("pool_id", camera.pool_id);
    try {
      const { data } = await api.post("/analysis/image", body);
      toast.success(data.species?.available ? `Frame analyzed · ${data.species.label}` : "Frame saved; classifiers are unavailable.");
    } catch (error) { toast.error(getErrorMessage(error)); }
  };

  if (loading) return <LoadingBlock label="Connecting to cameras…" />;
  return (
    <div>
      <PageHeading eyebrow="CENTRAL CAMERA GRID" title="Camera monitoring" description="Review connected sources and open a browser camera for a live preview." action={user?.role === "admin" && <button className="btn-primary" onClick={() => { setEditing(null); setShowForm(true); }}><Plus size={16} /> Add camera</button>} />
      <div className="camera-toolbar"><div className="camera-toolbar-summary"><span className="camera-summary-indicator"><i className="status-dot" /> {cameras.filter((item) => item.status === "online").length} connected</span><span>{cameras.filter((item) => item.status === "offline").length} offline</span><span className="soft-divider" /> <span>Browser preview requests camera access only after you choose Open camera.</span></div><div className="layout-switcher"><span>GRID</span>{[1, 2, 4, 6, 9].map((columns) => <button key={columns} title={`${columns} camera layout`} className={layout === columns ? "selected" : ""} onClick={() => setLayout(columns)}>{columns === 1 ? <Grid2X2 size={15} /> : columns === 2 ? <LayoutGrid size={15} /> : <b>{columns}</b>}</button>)}</div></div>
      {cameras.length ? <div className={`camera-grid camera-grid-${layout}`}>{cameras.slice(0, layout).map((camera) => <CameraTile key={camera.id} camera={camera} onAnalyze={analyzeFrame} onEdit={user?.role === "admin" ? (item) => { setEditing(item); setShowForm(true); } : null} />)}</div> : <EmptyState icon={CameraOff} title="No cameras in this workspace" description="Add a camera to a pool or start with a browser webcam." action={user?.role === "admin" && <button className="btn-primary" onClick={() => setShowForm(true)}><Plus size={15} /> Add camera</button>} />}
      {cameras.length > layout && <div className="camera-more-note"><span>Showing {layout} of {cameras.length} cameras in this grid.</span><button className="btn-quiet" onClick={() => setLayout(9)}>Show up to 9 <LayoutGrid size={13} /></button></div>}
      {showForm && <CameraForm initial={editing} pools={pools} onClose={() => setShowForm(false)} onSaved={refresh} />}
    </div>
  );
}