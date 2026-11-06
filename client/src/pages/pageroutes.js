import { createElement } from 'react';
import { Navigate } from 'react-router-dom';
import { LoginPage } from './LoginPage';
import { ForgotPasswordPage, RegisterPage } from './AccountPages';
import { DashboardPage } from './DashboardPage';
import { PoolsPage, PoolFormPage, PoolDetailPage } from './PoolsPage';
import { CamerasPage } from './CamerasPage';
import { AnalysisPage } from './AnalysisPage';
import { AnalyticsPage } from './AnalyticsPage';
import { AlertsPage } from './AlertsPage';
import { ReportsPage } from './ReportsPage';
import { SettingsPage } from './SettingsPage';
import { RequireAuth, RequireRole } from '../components/Shell';

export const pageRoutes = [
  { path: '/login', element: createElement(LoginPage) },
  { path: '/register', element: createElement(RegisterPage) },
  { path: '/forgot-password', element: createElement(ForgotPasswordPage) },
  { path: '/', element: createElement(Navigate, { to: '/dashboard', replace: true }) },
  { path: '/dashboard', element: createElement(RequireAuth, null, createElement(DashboardPage)) },
  { path: '/pools', element: createElement(RequireAuth, null, createElement(PoolsPage)) },
  { path: '/pools/new', element: createElement(RequireAuth, null, createElement(RequireRole, { roles: ['ADMIN'] }, createElement(PoolFormPage))) },
  { path: '/pools/:poolId', element: createElement(RequireAuth, null, createElement(PoolDetailPage)) },
  { path: '/cameras', element: createElement(RequireAuth, null, createElement(CamerasPage)) },
  { path: '/analysis', element: createElement(RequireAuth, null, createElement(AnalysisPage)) },
  { path: '/analytics', element: createElement(RequireAuth, null, createElement(AnalyticsPage)) },
  { path: '/alerts', element: createElement(RequireAuth, null, createElement(AlertsPage)) },
  { path: '/reports', element: createElement(RequireAuth, null, createElement(ReportsPage)) },
  { path: '/settings', element: createElement(RequireAuth, null, createElement(SettingsPage)) },
];