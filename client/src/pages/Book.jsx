import { useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { post } from '../api';
import { check, bookingSchema, today } from '../validation';
import { Field, Banner, fieldErrors } from '../components/ui';

export default function Book() {
  const { roomTypeId } = useParams();
  const [q] = useSearchParams();
  const nav = useNavigate();
  const [v, setV] = useState({ checkIn: q.get('checkIn') || '', checkOut: q.get('checkOut') || '', guests: q.get('guests') || 2 });
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault(); setMsg('');
    const r = check(bookingSchema, v); setErrors(r.errors); if (!r.ok) return;
    setBusy(true);
    try { await post('/bookings', { roomTypeId: Number(roomTypeId), ...r.data }); nav('/my-bookings', { state: { just: true } }); }
    catch (err) { setMsg(err.message); setErrors(fieldErrors(err)); }
    finally { setBusy(false); }
  }
  return (
    <form className="card narrow" onSubmit={submit} noValidate>
      <h1>Confirm your stay</h1>
      <p className="muted">Pay at the hotel. Free cancellation until the day of check-in.</p>
      <Banner error={msg} />
      <Field label="Check-in" error={errors.checkIn}><input type="date" min={today()} value={v.checkIn} onChange={set('checkIn')} /></Field>
      <Field label="Check-out" error={errors.checkOut}><input type="date" min={v.checkIn || today()} value={v.checkOut} onChange={set('checkOut')} /></Field>
      <Field label="Guests" error={errors.guests}><input type="number" min="1" max="10" value={v.guests} onChange={set('guests')} /></Field>
      <button className="btn" disabled={busy}>{busy ? 'Booking…' : 'Confirm booking'}</button>
    </form>
  );
}
