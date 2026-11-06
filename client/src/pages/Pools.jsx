import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, ArrowRight, Camera, Droplets, Fish, Filter, Plus, Search, Waves } from "lucide-react";
import api, { getErrorMessage } from "../services/api";
import { useAuth, useToast } from "../context";
import { ConfirmDialog, EmptyState, FormField, LoadingBlock, Modal, PageHeading, StatusBadge } from "../components/common";

const emptyForm = {
  pool_id: "", name: "", location: "", pool_type: "Grow-out", capacity_l: 0,
  species: "Unspecified", fish_count: 0, camera_id: "", status: "active",
  temperature_c: "", ph: "", oxygen_mg_l: "",
};

function PoolForm({ initial, cameras, onClose, onSaved }) {
  const [form, setForm] = useState({ ...emptyForm, ...initial, camera_id: initial?.camera_id || "" });
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    const body = {
      ...form,
      capacity_l: Number(form.capacity_l) || 0,
      fish_count: Number(form.fish_count) || 0,
      temperature_c: form.temperature_c === "" ? null : Number(form.temperature_c),
      ph: form.ph === "" ? null : Number(form.ph),
      oxygen_mg_l: form.oxygen_mg_l === "" ? null : Number(form.oxygen_mg_l),
      camera_id: form.camera_id || null,
    };
    try {
      if (initial?.id) await api.put(`/pools/${initial.id}`, body);
      else await api.post("/pools", body);
      toast.success(initial?.id ? "Pool details updated." : "Pool created.");
      onSaved();
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={initial?.id ? "Edit pool" : "Add a pool"} subtitle="Set up the water body and its monitoring details." onClose={onClose} wide>
      <form className="entity-form" onSubmit={submit}>
        <div className="form-grid">
          <FormField label="Pool name"><input required minLength="2" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. East grow-out" /></FormField>
          <FormField label="Pool ID" help={initial?.id ? "Pool ID cannot be changed." : "Leave blank to assign the next available ID."}><input disabled={!!initial?.id} value={form.pool_id} onChange={(e) => set("pool_id", e.target.value.toUpperCase())} placeholder="P7" /></FormField>
          <FormField label="Location"><input value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="Farm Area B" /></FormField>
          <FormField label="Pool type"><select value={form.pool_type} onChange={(e) => set("pool_type", e.target.value)}>{["Nursery", "Grow-out", "Production", "Hatchery", "Quarantine", "Pond"].map((type) => <option key={type}>{type}</option>)}</select></FormField>
          <FormField label="Capacity (litres)"><input type="number" min="0" value={form.capacity_l} onChange={(e) => set("capacity_l", e.target.value)} /></FormField>
          <FormField label="Species"><input value={form.species} onChange={(e) => set("species", e.target.value)} placeholder="Rohu" /></FormField>
          <FormField label="Current population estimate"><input type="number" min="0" value={form.fish_count} onChange={(e) => set("fish_count", e.target.value)} /></FormField>
          <FormField label="Assigned camera"><select value={form.camera_id} onChange={(e) => set("camera_id", e.target.value)}><option value="">No camera assigned</option>{cameras.map((camera) => <option value={camera.id} key={camera.id}>{camera.id} · {camera.name}</option>)}</select></FormField>
          <FormField label="Temperature (°C)"><input type="number" step="0.1" value={form.temperature_c} onChange={(e) => set("temperature_c", e.target.value)} placeholder="Not measured" /></FormField>
          <FormField label="Water pH"><input type="number" min="0" max="14" step="0.1" value={form.ph} onChange={(e) => set("ph", e.target.value)} placeholder="Not measured" /></FormField>
          <FormField label="Dissolved oxygen (mg/L)"><input type="number" min="0" step="0.1" value={form.oxygen_mg_l} onChange={(e) => set("oxygen_mg_l", e.target.value)} placeholder="Not measured" /></FormField>
          <FormField label="Pool status"><select value={form.status} onChange={(e) => set("status", e.target.value)}><option value="active">Active</option><option value="inactive">Inactive</option><option value="maintenance">Maintenance</option></select></FormField>
        </div>
        <div className="form-actions"><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy}>{busy ? "Saving…" : initial?.id ? "Save changes" : "Create pool"}</button></div>
      </form>
    </Modal>
  );
}

export default function Pools() {
  const { user } = useAuth();
  const toast = useToast();
  const [pools, setPools] = useState([]);
  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      const [poolResponse, cameraResponse] = await Promise.all([api.get("/pools"), api.get("/cameras")]);
      setPools(poolResponse.data);
      setCameras(cameraResponse.data);
    } catch (error) { toast.error(getErrorMessage(error)); }
    finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);

  const visible = pools.filter((pool) => {
    const matchesText = `${pool.id} ${pool.name} ${pool.location} ${pool.species}`.toLowerCase().includes(query.toLowerCase());
    return matchesText && (filter === "all" || pool.health === filter);
  });

  const deletePool = async () => {
    setBusy(true);
    try {
      await api.delete(`/pools/${deleting.id}`);
      toast.success(`${deleting.id} was removed.`);
      setDeleting(null);
      refresh();
    } catch (error) { toast.error(getErrorMessage(error)); }
    finally { setBusy(false); }
  };

  if (loading) return <LoadingBlock label="Loading pools…" />;
  return (
    <div>
      <PageHeading eyebrow="WATER BODIES" title="Pool management" description="Manage your farm’s pools, water conditions, and assigned cameras." action={user?.role === "admin" && <button className="btn-primary" onClick={() => { setEditing(null); setShowForm(true); }}><Plus size={16} /> Add pool</button>} />
      <div className="list-toolbar">
        <div className="search-control"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search pools, species, location…" /></div>
        <label className="filter-control"><Filter size={14} /><select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All health states</option><option value="normal">Normal</option><option value="warning">Warning</option><option value="alert">Alert</option><option value="unknown">Unknown</option></select></label>
        <span className="toolbar-count">{visible.length} pools</span>
      </div>
      {visible.length ? <div className="management-pool-grid">{visible.map((pool, index) => (
        <article className="management-pool-card" key={pool.id}>
          <div className={`management-pool-cover pool-water-${index % 4}`}><span className="pool-card-id">{pool.id}</span><span className="water-wave wave-a" /><span className="water-wave wave-b" /><div className="cover-type"><Waves size={13} /> {pool.pool_type || "Farm pool"}</div></div>
          <div className="management-pool-body">
            <div className="pool-card-title"><div><h3>{pool.name}</h3><span>{pool.location || "Location not set"}</span></div><StatusBadge value={pool.health}>{pool.health || "Unknown"}</StatusBadge></div>
            <div className="management-detail-grid">
              <div><span><Fish size={13} /> Population</span><b>{new Intl.NumberFormat("en-US").format(pool.fish_count || 0)}</b></div>
              <div><span><Droplets size={13} /> Species</span><b>{pool.species || "Unspecified"}</b></div>
              <div><span><Camera size={13} /> Camera</span><b>{pool.camera_id || "Not assigned"}</b></div>
              <div><span><Activity size={13} /> Water temp.</span><b>{pool.temperature_c != null ? `${pool.temperature_c}°C` : "Not measured"}</b></div>
            </div>
            <div className="pool-card-actions"><Link to={`/pools/${pool.id}`} className="btn-secondary compact">View details <ArrowRight size={13} /></Link>{user?.role === "admin" && <div className="inline-actions"><button className="btn-quiet" onClick={() => { setEditing(pool); setShowForm(true); }}>Edit</button><button className="btn-quiet danger-text" onClick={() => setDeleting(pool)}>Remove</button></div>}</div>
          </div>
        </article>
      ))}</div> : <EmptyState icon={Waves} title="No matching pools" description={pools.length ? "Try another search or clear the health filter." : "Create your first pool to start organizing farm monitoring."} action={user?.role === "admin" && <button className="btn-primary" onClick={() => setShowForm(true)}><Plus size={15} /> Add pool</button>} />}
      {showForm && <PoolForm initial={editing} cameras={cameras} onClose={() => setShowForm(false)} onSaved={refresh} />}
      {deleting && <ConfirmDialog title="Remove this pool?" message={`${deleting.id} · ${deleting.name} will be removed. Its camera will remain in the workspace but be unassigned.`} onCancel={() => setDeleting(null)} onConfirm={deletePool} busy={busy} />}
    </div>
  );
}