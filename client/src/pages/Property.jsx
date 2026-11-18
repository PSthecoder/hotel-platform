import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { get, post, inr, ApiError } from '../api';
import { check, enquirySchema } from '../validation';
import { Field, Banner, Stars, fieldErrors } from '../components/ui';
import { useAuth } from '../auth';

export default function Property() {
  const { id } = useParams();
  const { user } = useAuth();
  const [p, setP] = useState(null);
  const [err, setErr] = useState('');
  const [f, setF] = useState({ name: '', email: '', message: '' });
  const [errors, setErrors] = useState({});
  const [ok, setOk] = useState('');
  useEffect(() => { get(`/properties/${id}`).then((r) => setP(r.data)).catch((e) => setErr(e.message)); }, [id]);
  useEffect(() => { if (user) setF((x) => ({ ...x, name: x.name || user.fullName, email: x.email || user.email })); }, [user]);

  async function send(e) {
    e.preventDefault(); setOk(''); setErr('');
    const r = check(enquirySchema, f); setErrors(r.errors); if (!r.ok) return;
    try { await post('/enquiries', { propertyId: Number(id), ...r.data }); setOk('Thanks! The front desk will get back to you shortly.'); setF({ ...f, message: '' }); }
    catch (x) { setErr(x.message); setErrors(x instanceof ApiError ? fieldErrors(x) : {}); }
  }
  if (err && !p) return <div className="pad"><Banner error={err} /></div>;
  if (!p) return <p className="muted pad">Loading…</p>;
  return (
    <div className="pad">
      <h1>{p.name}</h1>
      <p className="muted">{p.address}, {p.city} · {p.rating ? <><Stars value={p.rating} /> {p.rating} ({p.reviewCount} reviews)</> : 'No reviews yet'}</p>
      <h2>Rooms</h2>
      <div className="grid">{p.roomTypes.map((r) => <div key={r.id} className="card"><h3>{r.name}</h3><p className="muted">Sleeps {r.capacity} · {r.amenities}</p><p className="price">{inr(r.rateInr)} <small>/ night</small></p><Link className="btn" to={`/book/${r.id}`}>Book</Link></div>)}</div>
      <h2>Guest reviews</h2>
      {p.reviews.length === 0 ? <p className="muted">No reviews yet.</p> : p.reviews.map((r) => <div key={r.id} className="card slim"><Stars value={r.rating} /> <strong>{r.guest}</strong><p>{r.comment}</p>{r.imageUrl && <img className="thumb" src={r.imageUrl} alt="Guest upload" loading="lazy" />}</div>)}
      <h2>Ask the front desk</h2>
      <form className="card narrow" onSubmit={send} noValidate>
        <Banner error={err} ok={ok} />
        <Field label="Your name" error={errors.name}><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Email" error={errors.email}><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Message" error={errors.message}><textarea rows="4" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} /></Field>
        <button className="btn">Send enquiry</button>
      </form>
    </div>
  );
}
