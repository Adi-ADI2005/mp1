import { useState } from "react";
import { Activity, ArrowUpRight, Eye, EyeOff, Fish, ShieldCheck, Waves } from "lucide-react";
import { useAuth, useToast } from "../context";
import api, { getErrorMessage } from "../services/api";
import useBackendHealth from "../hooks/useBackendHealth";

export default function Login() {
  const { login, register, demoLogin } = useAuth();
  const toast = useToast();
  const [registering, setRegistering] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const { health, status: backendStatus } = useBackendHealth();
  const demoAvailable = health?.storage === "demo" && health.demo_auth_enabled;

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    if (registering && form.password !== form.confirmPassword) {
      toast.error("Your passwords do not match.");
      return;
    }
    if (
      registering
      && (
        form.password.length < 8
        || !/[a-z]/.test(form.password)
        || !/[A-Z]/.test(form.password)
        || !/[0-9]/.test(form.password)
      )
    ) {
      toast.error("Use at least 8 characters, including uppercase, lowercase, and a number.");
      return;
    }
    setBusy(true);
    try {
      if (registering) {
        await register(form.name, form.email, form.password, form.confirmPassword);
        setRegistering(false);
        setForm((current) => ({ ...current, password: "", confirmPassword: "" }));
        toast.success("Account created successfully. Please log in.");
      } else {
        await login(form.email, form.password);
        toast.success("Login successful. Welcome back!");
      }
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not sign in."));
    } finally {
      setBusy(false);
    }
  };

  const useDemo = async () => {
    setBusy(true);
    try {
      await demoLogin();
      toast.success("Demo farm workspace opened.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Demo sign-in is unavailable."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <section className="login-showcase">
        <div className="login-brand">
          <span className="brand-mark"><Waves size={19} /></span>
          <span className="brand-name">fish<span>check</span></span>
        </div>
        <div className="showcase-copy">
          <div className="eyebrow"><span className="eyebrow-line" /> INTELLIGENCE FOR AQUACULTURE</div>
          <h1>Better visibility.<br /><em>Healthier</em> harvests.</h1>
          <p>One clear view of every pool, camera, and health signal across your farm.</p>
          <div className="showcase-metrics">
            <div><span>POOLS MONITORED</span><strong>06 <i>+2</i></strong></div>
            <div><span>HEALTH SIGNAL</span><strong>98.2<small>%</small></strong></div>
          </div>
        </div>
        <div className="showcase-art" aria-hidden="true">
          <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
          <div className="art-water"><div /><div /><div /></div>
          <div className="art-fish"><Fish size={100} strokeWidth={0.85} /></div>
          <div className="art-point point-one"><span /><b>Pool P1</b><small>healthy</small></div>
          <div className="art-point point-two"><span /><b>CAM-002</b><small>online</small></div>
        </div>
        <div className="showcase-foot"><span><ShieldCheck size={15} /> Secure farm workspace</span><span>BUILT FOR BETTER WATER</span></div>
      </section>
      <section className="login-panel">
        <div className="auth-card">
          <div className="auth-intro">
            <div className="auth-icon"><Activity size={19} /></div>
            <span className="auth-kicker">{registering ? "NEW WORKSPACE" : "FARM OPERATIONS"}</span>
            <h2>{registering ? "Create your account" : "Welcome back"}</h2>
            <p>{registering ? "Set up your access to the FishCheck platform." : "Sign in to your monitoring workspace."}</p>
          </div>
          {backendStatus === "offline" && (
            <div className="backend-warning login-backend-warning" role="status" aria-live="polite">
              <i className="bi bi-exclamation-triangle" />
              <span><strong>Backend unavailable.</strong> The API cannot be reached; retrying automatically.</span>
            </div>
          )}
          <form onSubmit={submit} className="auth-form">
             {registering && <label>Full name<input autoComplete="name" required minLength="2" maxLength="100" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Alex Morgan" /></label>}
             <label>Email address<input type="email" autoComplete="email" required maxLength="254" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="you@farm.com" /></label>
             <label>Password<div className="password-input"><input type={showPassword ? "text" : "password"} autoComplete={registering ? "new-password" : "current-password"} minLength={registering ? 8 : 1} maxLength="128" required value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder={registering ? "At least 8 characters" : "Enter your password"} /><button type="button" className="password-toggle" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>{registering && <small className="field-help">Include uppercase and lowercase letters and a number.</small>}</label>
             {registering && <label>Confirm password<input type={showPassword ? "text" : "password"} autoComplete="new-password" required maxLength="128" value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} placeholder="Enter the same password again" /></label>}
             <div className="auth-options"><span /> <button type="button" className="text-button" onClick={() => toast.info("Ask your farm administrator to reset your password.")}>Forgot password?</button></div>
            <button type="submit" className="btn-primary auth-submit" disabled={busy}>{busy ? <span className="spinner-border spinner-border-sm" /> : <>{registering ? "Create account" : "Sign in"} <ArrowUpRight size={17} /></>}</button>
          </form>
          {demoAvailable && (
            <>
              <div className="auth-separator"><span /> OR CONTINUE WITH <span /></div>
              <button className="btn-outline auth-demo" onClick={useDemo} disabled={busy}><Waves size={16} /> Explore the demo workspace</button>
            </>
          )}
          <p className="auth-switch">{registering ? "Already have access?" : "New to FishCheck?"} <button onClick={() => setRegistering((value) => !value)}>{registering ? "Sign in" : "Create an account"}</button></p>
          <p className="auth-legal">By continuing, you agree to our <button onClick={() => toast.info("Terms and privacy details are provided by your farm administrator.")}>Terms</button> and <button onClick={() => toast.info("Terms and privacy details are provided by your farm administrator.")}>Privacy Policy</button>.</p>
        </div>
      </section>
    </div>
  );
}