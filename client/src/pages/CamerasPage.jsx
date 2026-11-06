import { useEffect, useState } from 'react';
import { Camera, CirclePlay, CircleStop, Edit3, Plus, Radio, Trash2, Video } from 'lucide-react';
import { camerasApi, poolsApi } from '../services/api';
import { apiMessage, getRows, poolLabel, statusTone } from '../services/format';
import { Field, LoadingBlock, Modal, PageHeading, Panel, StateBox, StatusTag, SubmitButton } from '../components/UI';
import { useToast } from '../context/ToastContext';

const blankCamera = { name: '', pool_id: '', stream_url: '' };
function CameraForm({ initial, pools, onSave, onCancel, submitLabel }) {
  const [value, setValue] = useState(() => {
    const editable = { ...blankCamera, ...initial, pool_id: initial?.pool_id ?? initial?.pool?.id ?? '' };
    ['id', 'camera_id', 'created_at', 'updated_at', 'pool'].forEach((key) => delete editable[key]);
    return editable;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const change = (key, newValue) => setValue((current) => ({ ...current, [key]: newValue }));
  const submit = async (event) => {
    event.preventDefault(); setError(''); setBusy(true);
    const payload = { ...value };
    ['id', 'camera_id', 'created_at', 'updated_at', 'pool'].forEach((key) => delete payload[key]);
    try { await onSave(payload); } catch (requestError) { setError(apiMessage(requestError)); } finally { setBusy(false); }
  };
  return <form onSubmit={submit}>
    <Field id="camera-name" label="Camera name"><input required id="camera-name" value={value.name || ''} onChange={(event) => change('name', event.target.value)} placeholder="Raceway north · overhead" /></Field>
    <Field id="camera-pool" label="Assigned pool"><select required id="camera-pool" value={value.pool_id} onChange={(event) => change('pool_id', event.target.value)}><option value="">Choose a pool</option>{pools.map((pool) => <option key={pool.id ?? pool.pool_id} value={pool.id ?? pool.pool_id}>{poolLabel(pool)}</option>)}</select></Field>
    <Field id="camera-stream" label="Stream address"><input id="camera-stream" type="url" value={value.stream_url || value.url || ''} onChange={(event) => change('stream_url', event.target.value)} placeholder="rtsp:// or https:// stream URL" /></Field>
    {error && <div className="error-inline" style={{ marginBottom: 12 }}>{error}</div>}<div className="modal-actions"><button className="btn-quiet" type="button" onClick={onCancel}>Cancel</button><SubmitButton type="submit" busy={busy}>{submitLabel}</SubmitButton></div>
  </form>;
}
export function CamerasPage() {
  const [cameras, setCameras] = useState([]);
  const [pools, setPools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const notify = useToast();
  const load = async () => {
    setLoading(true);
    try {
      const [cameraResponse, poolResponse] = await Promise.all([camerasApi.list(), poolsApi.list()]);
      setCameras(getRows(cameraResponse)); setPools(getRows(poolResponse)); setError('');
    } catch (requestError) { setError(apiMessage(requestError)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const save = async (payload) => {
    if (modal?.camera) await camerasApi.update(modal.camera.id ?? modal.camera.camera_id, payload);
    else await camerasApi.create(payload);
    notify(modal?.camera ? 'Camera details updated.' : 'Camera registered.', 'success'); setModal(null); await load();
  };
  const toggle = async (camera) => {
    const id = camera.id ?? camera.camera_id;
    setBusyId(id);
    try {
      const nextIsOnline = !['online', 'active', 'running'].includes(String(camera.status || '').toLowerCase());
      if (nextIsOnline) await camerasApi.start(id); else await camerasApi.stop(id);
      notify(`Camera demo status set to ${nextIsOnline ? 'ONLINE' : 'OFFLINE'}; live video ingestion is not connected.`, 'success');
      await load();
    } catch (requestError) { notify(apiMessage(requestError), 'error'); }
    finally { setBusyId(null); }
  };
  const remove = async () => {
    try { await camerasApi.remove(deleting.id ?? deleting.camera_id); notify('Camera removed.', 'success'); setDeleting(null); await load(); }
    catch (requestError) { notify(apiMessage(requestError), 'error'); }
  };
  const openEditor = async (camera) => {
    const id = camera.id ?? camera.camera_id;
    setEditingId(id);
    try { setModal({ camera: await camerasApi.get(id) }); }
    catch (requestError) { notify(apiMessage(requestError), 'error'); }
    finally { setEditingId(null); }
  };
  return <>
     <PageHeading eyebrow="Equipment registry" title="Cameras" subtitle="Manage camera records and demo status. Live video ingestion is not connected in this build." action={<button aria-label="Register camera" className="btn-aqua" onClick={() => setModal({})}><Plus size={15} />Register camera</button>} />
    {loading ? <LoadingBlock count={3} /> : error ? <div className="surface"><StateBox type="error" title="Camera systems unavailable" message={error} action={<button className="btn-quiet" onClick={load}>Retry</button>} /></div> : cameras.length ? <div className="camera-grid">{cameras.map((camera) => {
      const id = camera.id ?? camera.camera_id;
      const isOnline = ['online', 'active', 'running'].includes(String(camera.status || '').toLowerCase());
      return <Panel key={id} title={camera.name || camera.label || `Camera ${id}`} meta={`CAMERA · ${id}`}>
        <div className="camera-preview"><Video size={29} strokeWidth={1.3} /><span style={{ position: 'absolute', top: 11, left: 12, font: '9px DM Mono,monospace', letterSpacing: '.12em' }}>{camera.camera_type === 'Simulation' || !camera.stream_url ? 'SIMULATED STATUS · NO VIDEO' : 'VIDEO INGESTION NOT CONNECTED'}</span><span className={`tag ${isOnline ? '' : 'tag-warn'}`} style={{ position: 'absolute', right: 10, top: 10 }}><Radio size={10} />{camera.status || 'Unknown'}</span></div>
        <div className="camera-card-body"><div className="camera-title-row"><span className="section-kicker">ASSIGNED POOL</span><StatusTag tone={statusTone(camera.status)}>{isOnline ? 'ONLINE' : 'OFFLINE'}</StatusTag></div><div style={{ marginTop: 5, marginBottom: 13, fontSize: 12 }}>{poolLabel(camera.pool || pools.find((pool) => String(pool.id ?? pool.pool_id) === String(camera.pool_id)) || { name: camera.pool_name || 'Unassigned' })}</div><div className="toolbar"><button className="btn-quiet" aria-label={`Set camera ${isOnline ? 'offline' : 'online'}`} disabled={busyId === id} onClick={() => toggle(camera)}>{isOnline ? <><CircleStop size={13} />Set offline</> : <><CirclePlay size={13} />Set online</>}</button><button className="icon-button" aria-label={`Edit ${camera.name || 'camera'}`} disabled={editingId === id} onClick={() => openEditor(camera)}><Edit3 size={14} /></button><button className="icon-button" aria-label={`Delete ${camera.name || 'camera'}`} onClick={() => setDeleting(camera)}><Trash2 size={14} /></button></div></div>
      </Panel>;
    })}</div> : <div className="surface"><StateBox title="No cameras connected" message="Register an imaging device to support remote checks and health screening." action={<button className="btn-aqua" onClick={() => setModal({})}><Plus size={14} />Register camera</button>} /></div>}
    {modal && <Modal title={modal.camera ? 'Edit camera' : 'Register camera'} onClose={() => setModal(null)}><CameraForm initial={modal.camera || blankCamera} pools={pools} onSave={save} onCancel={() => setModal(null)} submitLabel={modal.camera ? 'Save camera' : 'Register camera'} /></Modal>}
    {deleting && <Modal title="Remove camera?" onClose={() => setDeleting(null)}><p className="page-subtitle" style={{ marginTop: -8, marginBottom: 22 }}>Remove <strong>{deleting.name || `Camera ${deleting.id ?? deleting.camera_id}`}</strong> from this farm?</p><div className="modal-actions"><button className="btn-quiet" onClick={() => setDeleting(null)}>Cancel</button><button className="btn-aqua" style={{ background: 'var(--coral)' }} onClick={remove}>Remove camera</button></div></Modal>}
  </>;
}