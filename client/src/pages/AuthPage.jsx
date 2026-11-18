import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { check, loginSchema, registerSchema } from '../validation';
import { Field, Banner, fieldErrors } from '../components/ui';

export default function AuthPage({ mode }) {
  const isReg = mode === 'register';
  const { login, register } = useAuth();
  const nav = useNavigate();
  const from = useLocation().state?.from || '/';
  const [v, setV] = useState({ fullName: '', email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault(); setMsg('');
    const r = check(isReg ? registerSchema : loginSchema, v);
    setErrors(r.errors);
    if (!r.ok) return;
    setBusy(true);
    try { const u = await (isReg ? register(r.data) : login(r.data)); nav(u.role === 'admin' && from === '/' ? '/admin' : from, { replace: true }); }
    catch (err) { setMsg(err.message); setErrors(fieldErrors(err)); }
    finally { setBusy(false); }
  }
  return (
    <form className="card narrow" onSubmit={submit} noValidate>
      <h1>{isReg ? 'Create your account' : 'Welcome back'}</h1>
      <Banner error={msg} />
      {isReg && <Field label="Full name" error={errors.fullName}><input value={v.fullName} onChange={set('fullName')} autoComplete="name" /></Field>}
      <Field label="Email" error={errors.email}><input type="email" value={v.email} onChange={set('email')} autoComplete="email" /></Field>
      <Field label="Password" error={errors.password}><input type="password" value={v.password} onChange={set('password')} autoComplete={isReg ? 'new-password' : 'current-password'} /></Field>
      <button className="btn" disabled={busy}>{busy ? 'Please wait…' : isReg ? 'Sign up' : 'Log in'}</button>
      <p className="muted">{isReg ? <>Already registered? <Link to="/login">Log in</Link></> : <>New here? <Link to="/register">Create an account</Link></>}</p>
    </form>
  );
}
