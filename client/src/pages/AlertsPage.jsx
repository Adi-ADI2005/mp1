import { useEffect, useState } from 'react';
import { Bell, Check, CircleAlert, RefreshCw } from 'lucide-react';
import { alertsApi } from '../services/api';
import { apiMessage, formatDate, getRows, statusTone } from '../services/format';
import { LoadingBlock, PageHeading, Panel, StateBox, StatusTag } from '../components/UI';
import { useToast } from '../context/ToastContext';

function isRead(alert) {
  return Boolean(alert.is_read ?? alert.read ?? String(alert.status || '').toLowerCase() === 'read');
}
export function AlertsPage() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const notify = useToast();
  const load = async () => {
    setLoading(true);
    try { setAlerts(getRows(await alertsApi.list())); setError(''); }
    catch (requestError) { setError(apiMessage(requestError)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const markRead = async (alert) => {
    const id = alert.id ?? alert.alert_id;
    setBusyId(id);
    try {
      const updated = await alertsApi.markRead(id);
      setAlerts((current) => current.map((item) => (item.id ?? item.alert_id) === id ? { ...item, ...updated, is_read: true, read: true, status: 'read' } : item));
      notify('Alert marked as read.', 'success');
    } catch (requestError) { notify(apiMessage(requestError), 'error'); }
    finally { setBusyId(null); }
  };
  const unread = alerts.filter((item) => !isRead(item)).length;
  return <>
    <PageHeading eyebrow="Attention queue" title="Alerts" subtitle="Review health flags and operational events before they become surprises." action={<button className="btn-quiet" onClick={load}><RefreshCw size={13} />Refresh queue</button>} />
    {loading ? <LoadingBlock count={3} /> : error ? <div className="surface"><StateBox type="error" title="Alert feed unavailable" message={error} action={<button className="btn-quiet" onClick={load}>Retry</button>} /></div> : <Panel title="Farm alert feed" meta={`${unread} UNREAD · ${alerts.length} TOTAL`} action={<span className="tag"><Bell size={11} />Live queue</span>}>
      {alerts.length ? alerts.map((alert, index) => {
        const id = alert.id ?? alert.alert_id;
        const read = isRead(alert);
        const tone = statusTone(alert.severity || alert.priority || alert.type);
        return <div className="report-row" key={id ?? index} style={{ background: read ? 'transparent' : 'color-mix(in srgb, var(--aqua) 7%, var(--surface))' }}>
          <div className="report-icon" style={{ color: tone === 'danger' ? 'var(--coral)' : undefined }}><CircleAlert size={17} /></div>
          <div className="report-info"><div className="report-name">{alert.title || alert.message || alert.type || 'Farm alert'}</div><div className="report-meta">{[alert.pool_name || alert.pool?.name, alert.severity || alert.priority, formatDate(alert.created_at)].filter(Boolean).join(' · ')}</div></div>
          <StatusTag tone={read ? 'neutral' : tone}>{read ? 'READ' : alert.severity || alert.priority || 'NEW'}</StatusTag>
          {!read && <button className="btn-quiet" disabled={busyId === id} onClick={() => markRead(alert)}><Check size={13} />Mark read</button>}
        </div>;
      }) : <StateBox title="No alerts in the queue" message="New health flags and operational alerts will appear here." />}
    </Panel>}
  </>;
}