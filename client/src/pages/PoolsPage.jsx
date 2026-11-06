import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Edit3, Plus, Trash2, Waves } from 'lucide-react';
import { poolsApi } from '../services/api';
import { apiMessage, getRows, poolLabel, statusTone } from '../services/format';
import { Field, LoadingBlock, Modal, PageHeading, Panel, StateBox, StatusTag, SubmitButton } from '../components/UI';
import { useToast } from '../context/ToastContext';
import { useSession } from '../context/SessionContext';

const emptyPool = { name: '', location: '', species: '', capacity: '', volume_m3: '', description: '', status: 'active' };
function PoolFields({ value, onChange }) {
  const update = (key, fieldValue) => onChange((current) => ({ ...current, [key]: fieldValue }));
  return <><Field id="pool-name" label="Pool name"><input id="pool-name" required value={value.name || ''} onChange={(event) => update('name', event.target.value)} placeholder="North raceway 01" /></Field>
    <Field id="pool-location" label="Farm location"><input id="pool-location" required value={value.location || ''} onChange={(event) => update('location', event.target.value)} placeholder="Farm area A" /></Field>
    <div className="row g-3"><div className="col-6"><Field id="pool-species" label="Species"><input id="pool-species" value={value.species || ''} onChange={(event) => update('species', event.target.value)} placeholder="Rohu" /></Field></div><div className="col-6"><Field id="pool-capacity" label="Stock capacity"><input id="pool-capacity" type="number" min="1" required value={value.capacity ?? ''} onChange={(event) => update('capacity', event.target.value)} placeholder="2000" /></Field></div></div>
    <div className="row g-3"><div className="col-6"><Field id="pool-volume" label="Water volume (m³)"><input id="pool-volume" type="number" min="0" step="any" value={value.volume_m3 ?? ''} onChange={(event) => update('volume_m3', event.target.value)} placeholder="0" /></Field></div><div className="col-6"><Field id="pool-status" label="Status"><select id="pool-status" value={value.status || 'active'} onChange={(event) => update('status', event.target.value)}><option value="active">Active</option><option value="maintenance">Maintenance</option><option value="inactive">Inactive</option></select></Field></div></div>
    <Field id="pool-description" label="Operational notes"><textarea id="pool-description" value={value.description || ''} onChange={(event) => update('description', event.target.value)} placeholder="Water source, operating notes, or other context" /></Field>
  </>;
}
function PoolEditor({ initial = emptyPool, onSave, onCancel, title = 'Add pool' }) {
  const [value, setValue] = useState(() => {
    const editable = { ...emptyPool, ...initial };
    ['id', 'pool_id', 'created_at', 'updated_at'].forEach((key) => delete editable[key]);
    return editable;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const payload = { ...value };
      ['id', 'pool_id', 'created_at', 'updated_at'].forEach((key) => delete payload[key]);
      ['capacity', 'volume_m3'].forEach((key) => { if (payload[key] !== '' && payload[key] != null) payload[key] = Number(payload[key]); else delete payload[key]; });
      await onSave(payload);
    } catch (requestError) { setError(apiMessage(requestError)); }
    finally { setBusy(false); }
  };
  return <form onSubmit={submit}><PoolFields value={value} onChange={setValue} />{error && <div className="error-inline" style={{ marginBottom: 12 }}>{error}</div>}<div className="modal-actions"><button type="button" className="btn-quiet" onClick={onCancel}>Cancel</button><SubmitButton type="submit" busy={busy}>{title}</SubmitButton></div></form>;
}
export function PoolsPage() {
  const { user } = useSession();
  const canManage = user?.role === 'ADMIN';
  const [pools, setPools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const notify = useToast();
  const load = async () => {
    setLoading(true);
    try { setPools(getRows(await poolsApi.list())); setError(''); }
    catch (requestError) { setError(apiMessage(requestError)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const saveEdit = async (payload) => {
    await poolsApi.update(editing.id ?? editing.pool_id, payload);
    setEditing(null); notify('Pool details updated.', 'success'); load();
  };
  const removePool = async () => {
    setBusy(true);
    try { await poolsApi.remove(deleting.id ?? deleting.pool_id); setDeleting(null); notify('Pool removed from operations.', 'success'); await load(); }
    catch (requestError) { notify(apiMessage(requestError), 'error'); }
    finally { setBusy(false); }
  };
  return <>
    <PageHeading eyebrow="Production assets" title="Pools" subtitle="Keep stock, capacity and water systems organized by unit." action={canManage && <Link to="/pools/new" className="btn-aqua"><Plus size={15} />Add pool</Link>} />
    {loading ? <LoadingBlock count={3} /> : error ? <div className="surface"><StateBox type="error" title="Pool records unavailable" message={error} action={<button className="btn-quiet" onClick={load}>Retry</button>} /></div> : pools.length ? <Panel title="Production pools" meta={`${pools.length} RECORD${pools.length === 1 ? '' : 'S'}`}><div className="table-scroll"><table className="data-table"><thead><tr><th>Pool</th><th>Species</th><th>Capacity</th><th>Volume</th><th>Status</th><th aria-label="Actions" /></tr></thead><tbody>{pools.map((pool) => <tr key={pool.id ?? pool.pool_id}><td><Link to={`/pools/${pool.id ?? pool.pool_id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontWeight: 600 }}><span className="report-icon"><Waves size={15} /></span>{poolLabel(pool)}</Link></td><td>{pool.species || '—'}</td><td className="mono">{pool.capacity ?? '—'}</td><td className="mono">{pool.volume_m3 ? `${pool.volume_m3} m³` : '—'}</td><td><StatusTag tone={statusTone(pool.status)}>{pool.status || 'Unspecified'}</StatusTag></td><td><div className="toolbar" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}><button className="icon-button" aria-label={`Edit ${poolLabel(pool)}`} onClick={() => setEditing(pool)}><Edit3 size={14} /></button><button className="icon-button" aria-label={`Delete ${poolLabel(pool)}`} onClick={() => setDeleting(pool)}><Trash2 size={14} /></button></div></td></tr>)}</tbody></table></div></Panel> : <div className="surface"><StateBox title="No production pools yet" message="Add your first pool to start keeping stock and capacity in one place." action={<Link to="/pools/new" className="btn-aqua"><Plus size={14} />Create a pool</Link>} /></div>}
    {editing && <Modal title={`Edit ${poolLabel(editing)}`} onClose={() => setEditing(null)}><PoolEditor initial={editing} onSave={saveEdit} onCancel={() => setEditing(null)} title="Save changes" /></Modal>}
    {deleting && <Modal title="Remove pool?" onClose={() => setDeleting(null)}><p className="page-subtitle" style={{ marginTop: -8, marginBottom: 22 }}>This will remove <strong>{poolLabel(deleting)}</strong> from your farm records. This action cannot be undone.</p><div className="modal-actions"><button className="btn-quiet" onClick={() => setDeleting(null)}>Keep pool</button><button className="btn-aqua" disabled={busy} style={{ background: 'var(--coral)' }} onClick={removePool}>{busy ? 'Removing…' : 'Remove pool'}</button></div></Modal>}
  </>;
}
export function PoolFormPage() {
  const navigate = useNavigate();
  const notify = useToast();
  const [value, setValue] = useState(emptyPool);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    const payload = { ...value };
    ['id', 'pool_id', 'created_at', 'updated_at'].forEach((key) => delete payload[key]);
    ['capacity', 'volume_m3'].forEach((key) => { if (payload[key] !== '' && payload[key] != null) payload[key] = Number(payload[key]); else delete payload[key]; });
    try { const pool = await poolsApi.create(payload); notify('Pool created and ready to configure.', 'success'); navigate(pool?.id || pool?.pool_id ? `/pools/${pool.id ?? pool.pool_id}` : '/pools'); }
    catch (requestError) { const message = apiMessage(requestError); setError(message); notify(message, 'error'); }
    finally { setBusy(false); }
  };
  return <><PageHeading eyebrow="Production assets" title="Create a pool" subtitle="Start with the unit identity and current operating capacity." action={<button className="btn-quiet" onClick={() => navigate('/pools')}><ArrowLeft size={14} />Back to pools</button>} />
    <div className="surface" style={{ maxWidth: 720, padding: 22 }}><form onSubmit={submit}><PoolFields value={value} onChange={setValue} />{error && <div className="error-inline" style={{ marginBottom: 15 }}>{error}</div>}<div className="modal-actions"><button type="button" className="btn-quiet" onClick={() => navigate('/pools')}>Cancel</button><SubmitButton type="submit" busy={busy}><Plus size={14} />Create pool</SubmitButton></div></form></div>
  </>;
}
export function PoolDetailPage() {
  const { poolId } = useParams();
  const navigate = useNavigate();
  const [pool, setPool] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const notify = useToast();
  const load = async () => {
    setLoading(true);
    try { setPool(await poolsApi.get(poolId)); setError(''); }
    catch (requestError) { setError(apiMessage(requestError)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [poolId]);
  const save = async (payload) => {
    await poolsApi.update(poolId, payload); setEditing(false); notify('Pool details updated.', 'success'); load();
  };
  const remove = async () => {
    try { await poolsApi.remove(poolId); notify('Pool removed from operations.', 'success'); navigate('/pools'); }
    catch (requestError) { notify(apiMessage(requestError), 'error'); }
  };
  if (loading) return <LoadingBlock count={2} />;
  if (error || !pool) return <div className="surface"><StateBox type="error" title="Pool details unavailable" message={error || 'This pool may have been removed.'} action={<button className="btn-quiet" onClick={load}>Retry</button>} /></div>;
  const fishCount = pool.current_fish_count ?? pool.fish_count ?? pool.total_fish ?? pool.count;
  return <>
    <div className="surface pool-hero"><div><div className="eyebrow">Pool record · {pool.id ?? pool.pool_id ?? poolId}</div><h1 className="page-title">{poolLabel(pool)}</h1><p className="page-subtitle">{pool.description || 'Production unit details and operating status.'}</p></div><div className="toolbar"><button className="btn-quiet" onClick={() => setEditing(true)}><Edit3 size={14} />Edit pool</button><button className="btn-quiet btn-danger-soft" onClick={() => setDeleting(true)}><Trash2 size={14} />Remove</button></div></div>
    <div className="pool-stats"><div className="detail-stat"><span>SPECIES</span><strong>{pool.species || 'Not specified'}</strong></div><div className="detail-stat"><span>STOCK CAPACITY</span><strong>{pool.capacity ?? '—'}</strong></div><div className="detail-stat"><span>STOCK COUNT</span><strong>{fishCount ?? '—'}</strong></div></div>
    <div className="dashboard-grid"><Panel title="Unit details" meta="POOL PROFILE"><div style={{ padding: '0 19px 18px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15 }}><div><div className="section-kicker">Water volume</div><div style={{ marginTop: 6, fontSize: 13, fontWeight: 600 }}>{pool.volume_m3 ? `${pool.volume_m3} m³` : 'Not recorded'}</div></div><div><div className="section-kicker">Current status</div><div style={{ marginTop: 6 }}><StatusTag tone={statusTone(pool.status)}>{pool.status || 'Unspecified'}</StatusTag></div></div><div><div className="section-kicker">Species</div><div style={{ marginTop: 6, fontSize: 13, fontWeight: 600 }}>{pool.species || 'Not specified'}</div></div><div><div className="section-kicker">Last updated</div><div style={{ marginTop: 6, fontSize: 12 }}>{pool.updated_at ? new Date(pool.updated_at).toLocaleString() : 'Not available'}</div></div></div></Panel><Panel title="Operations shortcuts" meta="CONNECTED WORKFLOWS"><div className="activity-list"><Link to="/analysis" className="activity-item"><span className="activity-dot" /><div className="activity-message">Run a health screening<ArrowUpRight size={12} style={{ marginLeft: 7 }} /></div></Link><Link to="/analytics" className="activity-item"><span className="activity-dot" /><div className="activity-message">Review farm analytics<ArrowUpRight size={12} style={{ marginLeft: 7 }} /></div></Link></div></Panel></div>
    {editing && <Modal title={`Edit ${poolLabel(pool)}`} onClose={() => setEditing(false)}><PoolEditor initial={pool} onSave={save} onCancel={() => setEditing(false)} title="Save changes" /></Modal>}
    {deleting && <Modal title="Remove this pool?" onClose={() => setDeleting(false)}><p className="page-subtitle" style={{ marginTop: -8, marginBottom: 22 }}>This will permanently remove <strong>{poolLabel(pool)}</strong>.</p><div className="modal-actions"><button className="btn-quiet" onClick={() => setDeleting(false)}>Cancel</button><button className="btn-aqua" style={{ background: 'var(--coral)' }} onClick={remove}>Remove pool</button></div></Modal>}
  </>;
}