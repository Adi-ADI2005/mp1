import { useEffect, useState } from 'react';
import { Check, Moon, Sun } from 'lucide-react';
import { PageHeading, Panel, StatusTag } from '../components/UI';
import { useSession } from '../context/SessionContext';
import { useToast } from '../context/ToastContext';

export function SettingsPage() {
  const { user } = useSession();
  const notify = useToast();
  const [theme, setTheme] = useState(localStorage.getItem('pelagic_theme') || 'light');
  useEffect(() => { document.documentElement.classList.toggle('dark-theme', theme === 'dark'); }, [theme]);
  const changeTheme = (next) => {
    setTheme(next);
    localStorage.setItem('pelagic_theme', next);
    document.documentElement.classList.toggle('dark-theme', next === 'dark');
    window.dispatchEvent(new CustomEvent('pelagic-theme', { detail: next }));
    notify(`${next === 'dark' ? 'Deep water' : 'Daylight'} appearance enabled.`, 'success');
  };
  return <>
    <PageHeading eyebrow="Workspace" title="Settings" subtitle="Set your preferred working environment and check account access." />
    <div className="dashboard-grid">
      <Panel title="Appearance" meta="LOCAL PREFERENCE">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '0 18px 18px' }}>
          <button className="surface" onClick={() => changeTheme('light')} style={{ padding: 15, textAlign: 'left', borderColor: theme === 'light' ? 'var(--ocean)' : 'var(--line)', boxShadow: 'none' }}><Sun size={17} style={{ color: 'var(--ocean)' }} /><div style={{ marginTop: 10, fontSize: 12, fontWeight: 600 }}>Daylight</div><div className="section-kicker" style={{ marginTop: 4 }}>Cool sea-glass surfaces</div>{theme === 'light' && <Check size={14} style={{ float: 'right', color: 'var(--ocean)' }} />}</button>
          <button className="surface" onClick={() => changeTheme('dark')} style={{ padding: 15, textAlign: 'left', borderColor: theme === 'dark' ? 'var(--ocean)' : 'var(--line)', boxShadow: 'none' }}><Moon size={17} style={{ color: 'var(--ocean)' }} /><div style={{ marginTop: 10, fontSize: 12, fontWeight: 600 }}>Deep water</div><div className="section-kicker" style={{ marginTop: 4 }}>Low-light field setting</div>{theme === 'dark' && <Check size={14} style={{ float: 'right', color: 'var(--ocean)' }} />}</button>
        </div>
      </Panel>
      <Panel title="Account profile" meta="AUTHENTICATED SESSION">
        <div className="activity-list">
          <div className="activity-item"><span className="activity-dot" /><div><div className="section-kicker">NAME</div><div className="activity-message" style={{ marginTop: 4 }}>{user?.name || 'Name not provided'}</div></div></div>
          <div className="activity-item"><span className="activity-dot" /><div><div className="section-kicker">EMAIL</div><div className="activity-message" style={{ marginTop: 4 }}>{user?.email || 'Email not provided'}</div></div></div>
          <div className="activity-item"><span className="activity-dot" /><div><div className="section-kicker">ROLE</div><div style={{ marginTop: 5 }}><StatusTag>{(user?.role || 'FARM USER').replaceAll('_', ' ')}</StatusTag></div></div></div>
        </div>
        <div style={{ padding: '0 18px 17px', color: 'var(--muted)', fontSize: 10, lineHeight: 1.6 }}>Permissions are managed by the server. Pelagic hides tools that are not relevant to your role, but your farm administrator controls account access.</div>
      </Panel>
    </div>
  </>;
}