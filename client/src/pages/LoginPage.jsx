import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Anchor, LoaderCircle, Waves, Sparkles } from 'lucide-react';
import { useSession } from '../context/SessionContext';
import { useToast } from '../context/ToastContext';
import { apiMessage } from '../services/format';

export function LoginPage() {
  const { signIn, useDemoAccess, status } = useSession();
  const notify = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [demoLoading, setDemoLoading] = useState(false);
  const onSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signIn(email, password);
      notify('Welcome back to farm operations.', 'success');
      navigate(location.state?.from || '/dashboard', { replace: true });
    } catch (requestError) {
      const message = apiMessage(requestError, 'We could not sign you in with those details.');
      setError(message);
      notify(message, 'error');
    } finally { setLoading(false); }
  };
  const enterDemo = async () => {
    setError('');
    setDemoLoading(true);
    try {
      await useDemoAccess();
      notify('Demo farm workspace is ready.', 'success');
      navigate('/dashboard', { replace: true });
    } catch (requestError) {
      const message = apiMessage(requestError, 'Demo access is currently unavailable.');
      setError(message);
      notify(message, 'error');
    } finally { setDemoLoading(false); }
  };
  if (status === 'loading') return <div className="auth-page"><div className="auth-panel"><div className="skeleton" style={{ width: 320 }} /></div></div>;
  return <div className="auth-page">
    <section className="auth-art">
      <div className="brand" style={{ padding: 0 }}><div className="brand-mark"><Waves size={19} /></div><div><div className="brand-name">PELAGIC</div><div className="brand-tag">Farm operations</div></div></div>
      <div className="auth-art-content"><div className="eyebrow" style={{ color: '#9bd3c0' }}>A clearer view below the surface</div><h1>Healthy water.<br />Confident decisions.</h1><p>One reliable field station for the people who keep aquaculture moving — from first light checks to end-of-day reports.</p><div style={{ display: 'flex', gap: 18, marginTop: 31, color: '#a9d2c5', font: '10px DM Mono, monospace' }}><span>POOL SYSTEMS</span><span>·</span><span>LIVE MONITORING</span><span>·</span><span>HEALTH SCREENING</span></div></div>
      <div className="auth-coordinate"><Anchor size={13} style={{ verticalAlign: 'middle', marginRight: 7 }} /> 37°48' N&nbsp; 122°25' W &nbsp;·&nbsp; FIELD CONTROL</div>
    </section>
    <section className="auth-panel"><div className="auth-card">
      <div className="eyebrow">Operations access</div><h2>Sign in</h2><p>Use your farm account to continue to the control room.</p>
      <form onSubmit={onSubmit}>
        <div className="field"><label htmlFor="email">Email address</label><input autoComplete="username" id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="you@farm.org" /></div>
        <div className="field"><label htmlFor="password">Password</label><input autoComplete="current-password" id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required placeholder="Enter your password" /></div>
        {error && <div className="error-inline" role="alert" style={{ marginBottom: 14 }}>{error}</div>}
        <button className="btn-aqua" type="submit" disabled={loading} style={{ width: '100%', minHeight: 43, marginTop: 5 }}>{loading ? <><LoaderCircle size={15} /> Connecting</> : <>Enter operations <span aria-hidden="true">→</span></>}</button>
      </form>
      <div style={{ marginTop: 18, paddingTop: 15, borderTop: '1px solid var(--line)' }}>
        <button className="btn-quiet" type="button" onClick={enterDemo} disabled={demoLoading} style={{ width: '100%', minHeight: 40 }}>{demoLoading ? <><LoaderCircle size={14} />Opening demo</> : <><Sparkles size={14} />Enter demo workspace</>}</button>
        <div className="toolbar" style={{ justifyContent: 'space-between', marginTop: 13, fontSize: 10 }}><a className="btn-quiet" href="/register">Create farm account</a><a className="btn-quiet" href="/forgot-password">Forgot password?</a></div>
        <div style={{ marginTop: 13, color: 'var(--muted)', fontSize: 10, lineHeight: 1.6 }}>Password resets are managed by your farm administrator.</div>
      </div>
    </div></section>
  </div>;
}