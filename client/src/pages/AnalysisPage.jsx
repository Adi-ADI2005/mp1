import { useEffect, useRef, useState } from 'react';
import { Activity, ArrowUpRight, Microscope, UploadCloud } from 'lucide-react';
import { analysisApi, camerasApi, poolsApi } from '../services/api';
import { apiMessage, formatDate, getRows, poolLabel, timeAgo } from '../services/format';
import { Field, LoadingBlock, PageHeading, Panel, StateBox, StatusTag } from '../components/UI';
import { useToast } from '../context/ToastContext';

const disclaimer = 'AI results are preliminary and should be reviewed by a qualified aquaculture or marine expert.';
function screeningRows(response) {
  return getRows(response?.results || response?.analyses || response);
}
export function AnalysisPage() {
  const [recent, setRecent] = useState([]);
  const [pools, setPools] = useState([]);
  const [cameras, setCameras] = useState([]);
  const [poolId, setPoolId] = useState('');
  const [cameraId, setCameraId] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const notify = useToast();
  const load = async () => {
    setLoading(true);
    const requests = await Promise.allSettled([analysisApi.recent(), poolsApi.list(), camerasApi.list()]);
    if (requests[0].status === 'fulfilled') setRecent(screeningRows(requests[0].value));
    else setError(apiMessage(requests[0].reason));
    if (requests[1].status === 'fulfilled') setPools(getRows(requests[1].value));
    if (requests[2].status === 'fulfilled') setCameras(getRows(requests[2].value));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!file) { setPreview(''); return undefined; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const submit = async (event) => {
    event.preventDefault();
    if (!file) { notify('Choose an image to begin screening.', 'warning'); return; }
    const body = new FormData();
    body.append('image', file);
    if (poolId) body.append('pool_id', poolId);
    if (cameraId) body.append('camera_id', cameraId);
    setBusy(true);
    try {
      const response = await analysisApi.upload(body);
      setResult(response);
      setRecent((current) => [response, ...current.filter((item) => item.id !== response.id)]);
      notify('Image screening complete. Review the findings with an expert.', 'success');
    } catch (requestError) { notify(apiMessage(requestError), 'error'); }
    finally { setBusy(false); }
  };
  const chooseRecent = (item) => setResult(item);
  const output = result?.summary;
  return <>
    <PageHeading eyebrow="Stock health" title="Health screening" subtitle="Submit an image for a preliminary count, size and disease assessment." action={<span className="tag"><Microscope size={12} /> REVIEW REQUIRED</span>} />
    <div className="analysis-layout">
      <Panel title="New screening" meta="IMAGE ANALYSIS">
        <form onSubmit={submit} style={{ padding: '0 17px 17px' }}>
          <label className="upload-zone" htmlFor="analysis-image">{preview ? <img className="preview-image" src={preview} alt="Selected screening image preview" /> : <div><UploadCloud size={25} style={{ color: 'var(--ocean)' }} /><div style={{ marginTop: 9, fontSize: 12, fontWeight: 600 }}>Choose an image to analyze</div><div className="section-kicker" style={{ marginTop: 5 }}>JPG, PNG or WEBP · Choose a file</div></div>}</label>
          <input ref={inputRef} id="analysis-image" type="file" accept="image/*" onChange={(event) => setFile(event.target.files?.[0] || null)} style={{ display: 'none' }} />
          {file && <div style={{ margin: '-7px 0 14px', color: 'var(--muted)', font: '10px DM Mono,monospace' }}>{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</div>}
          <Field id="analysis-pool" label="Pool context"><select required id="analysis-pool" value={poolId} onChange={(event) => { setPoolId(event.target.value); setCameraId(''); }}><option value="">Select a pool</option>{pools.map((pool) => <option key={pool.id ?? pool.pool_id} value={pool.id ?? pool.pool_id}>{poolLabel(pool)}</option>)}</select></Field>
           <Field id="analysis-camera" label="Camera source"><select required id="analysis-camera" value={cameraId} onChange={(event) => setCameraId(event.target.value)}><option value="">Select a camera</option>{cameras.filter((camera) => !poolId || camera.pool_id === poolId).map((camera) => <option key={camera.id ?? camera.camera_id} value={camera.id ?? camera.camera_id}>{camera.name || camera.label || `Camera ${camera.id ?? camera.camera_id}`}</option>)}</select></Field>
          <button className="btn-aqua" type="submit" disabled={busy} style={{ width: '100%', marginTop: 2 }}>{busy ? 'Analyzing image…' : <><Activity size={14} />Run screening</>}</button>
          <div className="notice" style={{ marginTop: 13 }}>{disclaimer}</div>
        </form>
      </Panel>
      <Panel title="Screening result" meta={result ? `ANALYSIS · ${result.id ?? 'LATEST'}` : 'AWAITING IMAGE'}>
        {result ? <div style={{ padding: '0 17px 18px' }}>
          <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))', marginBottom: 13 }}>
            <div className="detail-stat"><span>FISH DETECTED</span><strong>{result.fish_count ?? result.detections?.length ?? '—'}</strong></div>
            <div className="detail-stat"><span>EST. BIOMASS</span><strong>{output?.estimated_biomass_kg ?? '—'}<small style={{ fontSize: 10, marginLeft: 4 }}>kg</small></strong></div>
            <div className="detail-stat"><span>AVG. LENGTH</span><strong>{output?.average_length_cm ?? 'Not calibrated'}{output?.average_length_cm != null && <small style={{ fontSize: 10, marginLeft: 4 }}>cm</small>}</strong></div>
            <div className="detail-stat"><span>HEALTHY / DISEASE</span><strong>{output?.healthy_count ?? '—'} <small style={{ color: 'var(--muted)', fontSize: 12 }}>/ {output?.disease_count ?? '—'}</small></strong></div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 13 }}><StatusTag tone="good">Provider · {result.provider_mode || 'AI'}</StatusTag><StatusTag>{formatDate(result.created_at)}</StatusTag></div>
          {!!result.detections?.length && <div className="table-scroll"><table className="data-table"><thead><tr><th>Detection</th><th>Species</th><th>Condition</th><th>Length</th><th>Weight</th></tr></thead><tbody>{result.detections.map((detection, index) => <tr key={detection.fish_id ?? index}><td className="mono">{detection.fish_id || `#${index + 1}`}</td><td>{detection.species || '—'}</td><td><StatusTag tone={detection.disease && detection.disease !== 'healthy' ? 'warn' : 'good'}>{detection.disease || 'Unclassified'}</StatusTag></td><td>{detection.length_cm == null ? 'Uncalibrated' : `${detection.length_cm} cm`}</td><td>{detection.weight_g == null ? 'Uncalibrated' : `${detection.weight_g} g`}</td></tr>)}</tbody></table></div>}
          <div className="notice" style={{ marginTop: 14 }}>{disclaimer}</div>
        </div> : <StateBox title="Results will appear here" message="Choose a fish image, add pool context if useful, then run a screening." />}
      </Panel>
    </div>
    <div style={{ marginTop: 16 }}><Panel title="Recent screenings" meta={loading ? 'SYNCING HISTORY' : `${recent.length} RECORD${recent.length === 1 ? '' : 'S'}`} action={<button className="btn-quiet" onClick={load}><ArrowUpRight size={13} />Refresh history</button>}>
      {loading ? <LoadingBlock count={2} /> : error && !recent.length ? <StateBox type="error" title="Screening history unavailable" message={error} action={<button className="btn-quiet" onClick={load}>Retry</button>} /> : recent.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Screening</th><th>Pool</th><th>Fish count</th><th>Findings</th><th>Recorded</th><th /></tr></thead><tbody>{recent.map((item, index) => <tr key={item.id ?? index}><td className="mono">#{item.id ?? '—'}</td><td>{poolLabel(pools.find((pool) => String(pool.id ?? pool.pool_id) === String(item.pool_id)) || item.pool || { name: item.pool_name })}</td><td>{item.fish_count ?? item.detections?.length ?? '—'}</td><td><StatusTag tone={Number(item.summary?.disease_count || 0) ? 'warn' : 'good'}>{item.summary?.disease_count ?? 0} flagged</StatusTag></td><td>{timeAgo(item.created_at)}</td><td><button className="btn-quiet" onClick={() => chooseRecent(item)}>View result</button></td></tr>)}</tbody></table></div> : <StateBox title="No screenings recorded" message="Completed image analyses will be listed here for quick review." />}
    </Panel></div>
  </>;
}