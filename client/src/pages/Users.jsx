import { useEffect, useState } from "react";
import { KeyRound, Mail, Plus, Shield, Trash2, UserRound, UsersRound } from "lucide-react";
import api, { getErrorMessage } from "../services/api";
import { useAuth, useToast } from "../context";
import { ConfirmDialog, EmptyState, FormField, LoadingBlock, Modal, PageHeading, Panel, StatusBadge } from "../components/common";

export default function Users() {
  const { user } = useAuth();
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [pools, setPools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "farmer", assigned_pools: [] });
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => Promise.all([api.get("/users"), api.get("/pools")]).then(([memberResponse, poolResponse]) => {
    setUsers(memberResponse.data);
    setPools(poolResponse.data);
  }).catch((error) => toast.error(getErrorMessage(error))).finally(() => setLoading(false));
  useEffect(() => { refresh(); }, []);
  const createUser = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api.post("/users", form);
      toast.success("Team member added.");
      setForm({ name: "", email: "", password: "", role: "farmer", assigned_pools: [] });
      setShowForm(false);
      refresh();
    } catch (error) { toast.error(getErrorMessage(error)); }
    finally { setBusy(false); }
  };
  const removeUser = async () => {
    setBusy(true);
    try {
      await api.delete(`/users/${deleting.id}`);
      toast.success("Team member access removed.");
      setDeleting(null);
      refresh();
    } catch (error) { toast.error(getErrorMessage(error)); }
    finally { setBusy(false); }
  };
  if (user?.role !== "admin") return <EmptyState icon={Shield} title="Administrator access required" description="Only farm administrators can view or manage team accounts." />;
  if (loading) return <LoadingBlock label="Loading team accounts…" />;
  return (
    <div>
      <PageHeading eyebrow="ACCESS CONTROL" title="Team access" description="Manage administrator, marine expert, and fish farmer accounts." action={<button className="btn-primary" onClick={() => setShowForm(true)}><Plus size={16} /> Add member</button>} />
      <div className="role-info-grid"><div><span className="role-icon role-admin"><Shield size={16} /></span><span><b>Administrator</b><small>Manage farm, pools, cameras, users, and reports.</small></span></div><div><span className="role-icon role-expert"><KeyRound size={16} /></span><span><b>Marine expert</b><small>Review assigned pools and analysis observations.</small></span></div><div><span className="role-icon role-farmer"><UserRound size={16} /></span><span><b>Fish farmer</b><small>View assigned pools, health, and reports.</small></span></div></div>
      <Panel title="Workspace members" subtitle={`${users.length} active account${users.length === 1 ? "" : "s"}`}>
        {users.length ? <div className="responsive-table"><table><thead><tr><th>Member</th><th>Email</th><th>Role</th><th>Pool access</th><th>Status</th><th></th></tr></thead><tbody>{users.map((member) => <tr key={member.id}><td><span className="member-cell"><span className="avatar avatar-small">{member.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><b>{member.name}{member.id === user.id && <small>YOU</small>}</b></span></td><td><span className="email-cell"><Mail size={13} /> {member.email}</span></td><td><span className={`role-label role-${member.role}`}>{member.role}</span></td><td>{member.role === "admin" ? "All pools" : (member.assigned_pools || []).join(", ") || "None assigned"}</td><td><StatusBadge value={member.status || "active"} /></td><td><button disabled={member.id === user.id} className="icon-button delete-user-button" title="Remove member" onClick={() => setDeleting(member)}><Trash2 size={15} /></button></td></tr>)}</tbody></table></div> : <EmptyState icon={UsersRound} title="No team members yet" description="Add trusted people who help manage and review your farm." action={<button className="btn-secondary" onClick={() => setShowForm(true)}><Plus size={15} /> Add a member</button>} />}
      </Panel>
      {showForm && <Modal title="Add a team member" subtitle="Create an account with the minimum access they need." onClose={() => setShowForm(false)}><form className="entity-form" onSubmit={createUser}><FormField label="Full name"><input required minLength="2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Sam Rivera" /></FormField><FormField label="Email"><input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="sam@farm.com" /></FormField><FormField label="Temporary password" help="At least 8 characters. Share it through your farm’s secure process."><input type="password" minLength="8" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></FormField><FormField label="Role"><select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value, assigned_pools: e.target.value === "admin" ? [] : form.assigned_pools })}><option value="farmer">Fish farmer</option><option value="expert">Marine expert</option><option value="admin">Administrator</option></select></FormField>{form.role !== "admin" && <FormField label="Assigned pools" help="Use Ctrl/Cmd to select multiple pools."><select multiple value={form.assigned_pools} onChange={(e) => setForm({ ...form, assigned_pools: Array.from(e.target.selectedOptions, (option) => option.value) })}>{pools.map((pool) => <option value={pool.id} key={pool.id}>{pool.id} · {pool.name}</option>)}</select></FormField>}<div className="form-actions"><button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button><button className="btn-primary" disabled={busy}>{busy ? "Adding…" : "Add member"}</button></div></form></Modal>}
      {deleting && <ConfirmDialog title="Remove team member?" message={`${deleting.name} will no longer be able to access this workspace.`} onCancel={() => setDeleting(null)} onConfirm={removeUser} busy={busy} />}
    </div>
  );
}