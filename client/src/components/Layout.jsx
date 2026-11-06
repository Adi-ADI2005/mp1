import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Activity, AlertTriangle, BarChart3, Bell, Camera, ChevronDown, Fish,
  FlaskConical, LayoutDashboard, LogOut, Menu, Moon, Settings, Sun,
  UsersRound, Waves, X, FileText,
} from "lucide-react";
import { useAuth, useToast } from "../context";
import useBackendHealth from "../hooks/useBackendHealth";
import PageTransition from "./PageTransition";

const navigation = [
  { label: "Overview", to: "/", icon: LayoutDashboard, end: true },
  { label: "Pools", to: "/pools", icon: Waves },
  { label: "Cameras", to: "/cameras", icon: Camera },
  { label: "Fish monitoring", to: "/fish", icon: Fish },
  { label: "AI analysis", to: "/analysis", icon: FlaskConical },
  { label: "Disease review", to: "/disease", icon: AlertTriangle },
  { label: "Species", to: "/species", icon: Fish },
  { label: "Analytics", to: "/analytics", icon: BarChart3 },
  { label: "Alerts", to: "/alerts", icon: Bell },
  { label: "Reports", to: "/reports", icon: FileText },
];

const pageNames = {
  "/": "Overview", "/pools": "Pool management", "/cameras": "Camera monitoring",
  "/fish": "Fish monitoring", "/analysis": "AI analysis", "/disease": "Disease review",
  "/species": "Species", "/analytics": "Farm analytics", "/alerts": "Alerts",
  "/reports": "Reports", "/users": "Team access", "/settings": "Settings",
};

function Sidebar({ open, close }) {
  const { user, logout } = useAuth();
  return (
    <>
      {open && <button className="mobile-scrim" aria-label="Close navigation" onClick={close} />}
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand">
          <span className="brand-mark"><Waves size={19} strokeWidth={2.4} /></span>
          <span className="brand-name">fish<span>check</span><small>FARM INTELLIGENCE</small></span>
          <button className="mobile-close icon-button" onClick={close} aria-label="Close navigation"><X size={19} /></button>
        </div>
        <div className="farm-switch">
          <div className="farm-icon"><Waves size={16} /></div>
          <div><strong>Bluewater Farms</strong><span>Primary workspace</span></div>
          <ChevronDown size={15} className="muted-icon" />
        </div>
        <div className="side-section-label">WORKSPACE</div>
        <nav className="side-navigation">
          {navigation.map(({ label, to, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} onClick={close} className={({ isActive }) => `side-link ${isActive ? "active" : ""}`}>
              <Icon size={17} strokeWidth={1.8} /><span>{label}</span>
              {label === "Alerts" && <span className="nav-count">3</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        {user?.role === "admin" && (
          <div className="side-admin-links">
            <div className="side-section-label">ADMINISTRATION</div>
            <NavLink to="/users" onClick={close} className={({ isActive }) => `side-link ${isActive ? "active" : ""}`}>
              <UsersRound size={17} strokeWidth={1.8} /><span>Team access</span>
            </NavLink>
          </div>
        )}
        <NavLink to="/settings" onClick={close} className={({ isActive }) => `side-link ${isActive ? "active" : ""}`}>
          <Settings size={17} strokeWidth={1.8} /><span>Settings</span>
        </NavLink>
        <div className="sidebar-bottom">
          <div className="help-card">
            <span className="help-icon"><Activity size={16} /></span>
            <div><strong>All systems steady</strong><span>Monitoring is active</span></div>
            <i className="status-dot" />
          </div>
          <div className="user-profile">
            <div className="avatar">{(user?.name || "F").split(" ").map((part) => part[0]).slice(0, 2).join("")}</div>
            <div className="user-profile-text"><strong>{user?.name}</strong><span>{user?.role || "Farm user"}</span></div>
            <button className="icon-button logout-button" title="Sign out" onClick={logout}><LogOut size={16} /></button>
          </div>
        </div>
      </aside>
    </>
  );
}

export default function Layout() {
  const { user } = useAuth();
  const toast = useToast();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem("fishcheck_theme") || "dark");
  const { health, status: backendStatus } = useBackendHealth();
  const [alertsOpen, setAlertsOpen] = useState(false);
  const pageName = location.pathname.startsWith("/pools/") ? "Pool details" : pageNames[location.pathname] || "FishCheck";

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("fishcheck_theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme((current) => current === "dark" ? "light" : "dark");
  const backendStatusLabel = backendStatus === "online"
    ? "Backend online"
    : backendStatus === "offline" ? "Backend unavailable" : "Checking backend";

  return (
    <div className="app-shell">
      <Sidebar open={mobileOpen} close={() => setMobileOpen(false)} />
      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={20} /></button>
            <div><div className="breadcrumb-label">Bluewater Farms <span>/</span> <b>{pageName}</b></div><h1>{pageName}</h1></div>
          </div>
          <div className="topbar-actions">
            <span className={`header-date backend-status-${backendStatus}`} role="status" aria-live="polite">
              <span className="status-dot" aria-hidden="true" /> {backendStatusLabel}
            </span>
            <button className="icon-button theme-toggle" onClick={toggleTheme} title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} aria-label="Toggle color theme">
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <div className="topbar-divider" />
            <button className="icon-button notification-button" title="View alerts" onClick={() => setAlertsOpen((open) => !open)}>
              <Bell size={18} /><i className="notification-dot" />
            </button>
            <button className="topbar-user" onClick={() => toast.info(`${user?.name} · ${user?.role}`)} aria-label="Account details">
              <div className="avatar avatar-small">{(user?.name || "F").split(" ").map((part) => part[0]).slice(0, 2).join("")}</div>
            </button>
          </div>
          {alertsOpen && (
            <div className="notification-popover">
              <div className="popover-title"><strong>Farm notifications</strong><button className="icon-button" onClick={() => setAlertsOpen(false)}><X size={15} /></button></div>
              <p><AlertTriangle size={15} /> 3 items need a quick review</p>
              <NavLink to="/alerts" onClick={() => setAlertsOpen(false)}>Open alert centre</NavLink>
            </div>
          )}
        </header>
        {backendStatus === "offline" && (
          <div className="backend-warning app-backend-warning" role="status" aria-live="polite">
            <i className="bi bi-exclamation-triangle" />
            <span><strong>Backend unavailable.</strong> Monitoring data may be stale; the API will be retried automatically.</span>
          </div>
        )}
        {health?.storage === "demo" && (
          <div className="demo-banner">
            <i className="bi bi-info-circle" />
            <span><strong>Demo workspace</strong> · Example farm data resets when the server restarts. Connect MongoDB to persist changes.</span>
            {health.ai?.species_classifier && <span className="banner-model"><i className="bi bi-cpu" /> Species & health models ready</span>}
          </div>
        )}
        {health?.storage === "mongodb" && <div className="live-banner"><i className="bi bi-cloud-check" /><span>MongoDB connected · farm data is persistent</span></div>}
        <div className="page-content"><PageTransition key={location.pathname}><Outlet /></PageTransition></div>
        <footer className="page-footer"><span>FishCheck <b>·</b> Aquaculture intelligence</span><span>{health?.storage === "mongodb" ? "Persistent workspace" : "Sample workspace"}</span></footer>
      </main>
    </div>
  );
}