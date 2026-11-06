import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Anchor, LoaderCircle, Waves } from 'lucide-react';
import { useSession } from '../context/SessionContext';
import { useToast } from '../context/ToastContext';
import { apiMessage } from '../services/format';

export function RegisterPage() {
  const { register } = useSession();
  const notify = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ full_name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await register(form);
      notify('Farm account created.', 'success');
      navigate('/dashboard', { replace: true });
    } catch (requestError) {
      const message = apiMessage(requestError, 'We could not create this account.');
      setError(message);
      notify(message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return <div className="auth-page">
    <section className="auth-art">
      <div className="brand" style={{ padding: 0 }}><div className="brand-mark"><Waves size={19} /></div><div><div className="brand-name">PELAGIC</div><div className="brand-tag">Farm operations</div></div></div>
      <div className="auth-art-content"><div className="eyebrow" style={{ color: '#9bd3c0' }}>A clearer view below the surface</div><h1>Bring your farm<br />into focus.</h1><p>Create a farmer workspace to monitor pools, track farm activity and generate reports.</p></div>
      <div className="auth-coordinate"><Anchor size={13} style={{ verticalAlign: 'middle', marginRight: 7 }} /> FISH FARMER ACCESS</div>
    </section>
    <section className="auth-panel"><div className="auth-card">
      <div className="eyebrow">New farm account</div><h2>Create account</h2><p>Farmer accounts include monitoring, analytics and reporting access.</p>
      <form onSubmit={submit}>
        <div className="field"><label htmlFor="full-name">Full name</label><input id="full-name" autoComplete="name" value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} minLength="2" maxLength="80" required placeholder="Your name" /></div>
        <div className="field"><label htmlFor="register-email">Email address</label><input id="register-email" type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required placeholder="you@farm.org" /></div>
        <div className="field"><label htmlFor="register-password">Password</label><input id="register-password" type="password" autoComplete="new-password" minLength="10" maxLength="128" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required placeholder="At least 10 characters" /></div>
        {error && <div className="error-inline" role="alert" style={{ marginBottom: 14 }}>{error}</div>}
        <button className="btn-aqua" type="submit" disabled={busy} style={{ width: '100%', minHeight: 43 }}>{busy ? <><LoaderCircle size={15} />Creating account</> : 'Create farmer account'}</button>
      </form>
      <div style={{ marginTop: 20, color: 'var(--muted)', fontSize: 11 }}>Already have access? <Link to="/login" style={{ color: 'var(--ocean)', fontWeight: 700 }}>Sign in</Link></div>
    </div></section>
  </div>;
}

export function ForgotPasswordPage() {
  return <div className="auth-page">
    <section className="auth-art">
      <div className="brand" style={{ padding: 0 }}><div className="brand-mark"><Waves size={19} /></div><div><div className="brand-name">PELAGIC</div><div className="brand-tag">Farm operations</div></div></div>
      <div className="auth-art-content"><div className="eyebrow" style={{ color: '#9bd3c0' }}>Account support</div><h1>Keep your<br />farm moving.</h1><p>Account access is controlled by your farm administrator so operational records stay protected.</p></div>
      <div className="auth-coordinate"><Anchor size={13} style={{ verticalAlign: 'middle', marginRight: 7 }} /> ACCOUNT RECOVERY</div>
    </section>
    <section className="auth-panel"><div className="auth-card">
      <div className="eyebrow">Password recovery</div><h2>Contact your administrator</h2>
      <p>Password reset links are not configured for this deployment. Ask your farm administrator to reset your access; this screen does not collect or send account details.</p>
      <Link className="btn-aqua" to="/login" style={{ width: '100%', minHeight: 43, marginTop: 12 }}>Return to sign in</Link>
    </div></section>
  </div>;
}