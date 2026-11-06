import { useEffect, useState } from 'react';
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Bell, Camera, ChartNoAxesCombined, ChevronRight, FileText, Fish, LayoutDashboard, LogOut, Menu, Moon, Settings, Sun, Waves, X } from 'lucide-react';
import { useSession } from '../context/SessionContext';
import { useToast } from '../context/ToastContext';

const navItems = [
  { to: '/dashboard', label: 'Operations overview', icon: LayoutDashboard },
  { to: '/pools', label: 'Pools', icon: Waves },
  { to: '/cameras', label: 'Cameras', icon: Camera },
  { to: '/analysis', label: 'Health screening', icon: Fish, roles: ['ADMIN', 'MARINE_EXPERT'] },
  { to: '/analytics', label: 'Analytics', icon: ChartNoAxesCombined },
];
const manageItems = [
  { to: '/alerts', label: 'Alerts', icon: Bell },
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/settings', label: 'Settings', icon: Settings },
];
export function RequireAuth({ children }) {
  const { status } = useSession();
  const location = useLocation();
  if (status === 'loading') return <div style={{ minHeight: '100vh', padding: 30, background: 'var(--paper)' }}><div className="skeleton" style={{ maxWidth: 400 }} /></div>;
  return status === 'ready' ? children : <Navigate to="/login" state={{ from: location.pathname }} replace />;
}
export function RequireRole({ children, roles }) {
  const { user } = useSession();
  if (!roles.includes(user?.role)) {
    return <div className="surface" style={{ margin: 32, padding: 24 }}><div className="eyebrow">Access restricted</div><h2 className="display" style={{ marginTop: 8, fontSize: 22 }}>Administrator access required</h2><p className="page-subtitle">Your current account can view farm operations but cannot change this resource.</p><NavLink className="btn-quiet" to="/pools">Return to pools</NavLink></div>;
  }
  return children;
}
export function AppLayout() {
  const { user, signOut } = useSession();
  const notify = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dark, setDark] = useState(localStorage.getItem('pelagic_theme') === 'dark');
  useEffect(() => {
    document.documentElement.classList.toggle('dark-theme', dark);
    document.body.dataset.role = String(user?.role || '').toLowerCase();
  }, [dark, user?.role]);
  useEffect(() => {
    const syncTheme = (event) => setDark(event.detail === 'dark');
    window.addEventListener('pelagic-theme', syncTheme);
    return () => window.removeEventListener('pelagic-theme', syncTheme);
  }, []);
  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    localStorage.setItem('pelagic_theme', next ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark-theme', next);
    window.dispatchEvent(new CustomEvent('pelagic-theme', { detail: next ? 'dark' : 'light' }));
  };
  const items = [...navItems.filter((item) => !item.roles || item.roles.includes(user?.role)), ...manageItems];
  const title = items.find((item) => item.to === location.pathname)?.label || (location.pathname.startsWith('/pools/') ? 'Pool details' : 'Farm operations');
  const signOutNow = async () => {
    try { await signOut(); navigate('/login'); } catch { notify('Could not complete sign out. Please try again.', 'error'); }
  };
  return <div className="app-shell">
    {mobileOpen && <button aria-label="Close navigation" onClick={() => setMobileOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 19, border: 0, background: 'rgba(7,29,28,.36)' }} />}
    <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
      <div className="brand"><div className="brand-mark"><Waves size={19} /></div><div><div className="brand-name">PELAGIC</div><div className="brand-tag">Farm operations</div></div><button className="icon-button mobile-toggle" style={{ marginLeft: 'auto', background: 'transparent', color: '#d3eee4', borderColor: 'rgba(255,255,255,.2)' }} onClick={() => setMobileOpen(false)}><X size={15} /></button></div>
      <div className="nav-label">Monitor</div><nav className="side-nav">{items.slice(0, 5).map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`} onClick={() => setMobileOpen(false)}><Icon size={16} strokeWidth={1.7} />{label}{to === '/alerts' && <ChevronRight size={13} style={{ marginLeft: 'auto' }} />}</NavLink>)}</nav>
      <div className="nav-label">Workspace</div><nav className="side-nav">{items.slice(5).map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`} onClick={() => setMobileOpen(false)}><Icon size={16} strokeWidth={1.7} />{label}</NavLink>)}</nav>
       <div className="sidebar-bottom"><div className="farm-chip"><div className="farm-avatar">{(user?.full_name || user?.name || user?.email || 'PF').split(/[ @._-]/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</div><div><div className="farm-name">{user?.full_name || user?.name || 'Farm team'}</div><div className="farm-sub">{(user?.role || 'FARM USER').replaceAll('_', ' ')}</div></div></div><button className="side-link" style={{ width: '100%', border: 0, background: 'transparent', textAlign: 'left' }} onClick={signOutNow}><LogOut size={15} />Sign out</button></div>
    </aside>
    <div className="content-column">
      <header className="topbar"><div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><button className="icon-button mobile-toggle" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={16} /></button><div className="breadcrumb"><span>PELAGIC</span><ChevronRight size={12} style={{ margin: '0 5px' }} />{title}</div></div><div className="top-actions"><button className="icon-button" aria-label={`Switch to ${dark ? 'light' : 'dark'} theme`} onClick={toggleTheme}>{dark ? <Sun size={16} /> : <Moon size={16} />}</button><button className="icon-button relative" aria-label="View alerts" onClick={() => navigate('/alerts')}><Bell size={16} /><i className="notification-count" /></button><div className="user-pill"><div className="user-initial">{(user?.name || user?.email || 'PF').slice(0, 1).toUpperCase()}</div><span className="desktop-user-name">{user?.name || user?.email}</span></div></div></header>
      <main className="main-content"><Outlet /></main>
    </div>
  </div>;
}