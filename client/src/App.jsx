import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, ToastProvider, useAuth } from "./context";
import { LoadingBlock } from "./components/common";

const Layout = lazy(() => import("./components/Layout"));
const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Pools = lazy(() => import("./pages/Pools"));
const NewPool = lazy(() => import("./pages/NewPool"));
const PoolDetails = lazy(() => import("./pages/PoolDetails"));
const Cameras = lazy(() => import("./pages/Cameras"));
const Analysis = lazy(() => import("./pages/Analysis"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Catalog = lazy(() => import("./pages/Catalog"));
const Alerts = lazy(() => import("./pages/Alerts"));
const Reports = lazy(() => import("./pages/Reports"));
const Users = lazy(() => import("./pages/Users"));
const Settings = lazy(() => import("./pages/Settings"));

function Guard({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return <div className="boot-screen"><span className="brand-mark">F</span><span className="spinner-border spinner-border-sm" /> Connecting to your farm workspace…</div>;
  return user ? children : <Navigate to="/login" replace />;
}

function RouteView() {
  const { user } = useAuth();
  return (
    <Suspense fallback={<div className="route-loading"><LoadingBlock label="Opening your workspace…" /></div>}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
        <Route element={<Guard><Layout /></Guard>}>
          <Route index element={<Dashboard />} />
          <Route path="pools" element={<Pools />} />
          <Route path="pools/new" element={<NewPool />} />
          <Route path="pools/:poolId" element={<PoolDetails />} />
          <Route path="cameras" element={<Cameras />} />
          <Route path="analysis" element={<Analysis />} />
          <Route path="fish" element={<Catalog kind="fish" />} />
          <Route path="fish/:fishId" element={<Catalog kind="fish" />} />
          <Route path="disease" element={<Catalog kind="disease" />} />
          <Route path="species" element={<Catalog kind="species" />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="reports" element={<Reports />} />
          <Route path="users" element={<Users />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to={user ? "/" : "/login"} replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <RouteView />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}