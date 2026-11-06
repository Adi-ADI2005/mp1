export function getRows(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.items)) return response.items;
  if (Array.isArray(response?.results)) return response.results;
  if (Array.isArray(response?.data)) return response.data;
  for (const key of ['pools', 'cameras', 'alerts', 'reports', 'analyses', 'results']) {
    if (Array.isArray(response?.[key])) return response[key];
  }
  return [];
}
export function apiMessage(error, fallback = 'Something went wrong. Please try again.') {
  return error?.response?.data?.detail || error?.response?.data?.message || error?.message || fallback;
}
export function formatDate(value, options = {}) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', ...options }).format(date);
}
export function timeAgo(value) {
  if (!value) return 'Recent';
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
export function poolLabel(pool) {
  return pool?.name || pool?.pool_name || `Pool ${pool?.id ?? pool?.pool_id ?? '—'}`;
}
export function statusTone(value) {
  const status = String(value || '').toLowerCase();
  if (['online', 'active', 'healthy', 'operational', 'read'].includes(status)) return 'good';
  if (['warning', 'pending', 'unread'].includes(status)) return 'warn';
  if (['offline', 'error', 'critical', 'disease', 'failed'].includes(status)) return 'danger';
  return 'neutral';
}