import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { get, post, patch, upload, inr } from '../api';
import { Banner } from '../components/ui';
import { today } from '../validation';

export default function MyBookings() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(useLocation().state?.just ? 'Booking confirmed! A confirmation email is on its way.' : '');
  const [review, setReview] = useState(null); // { id, rating, comment, imageUrl }
  const load = () => get('/bookings?limit=50').then((r) => setRows(r.data)).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const cancel = async (id) => {
    if (!confirm('Cancel this booking?')) return;
    try { await patch(`/bookings/${id}`, { status: 'cancelled' }); setOk('Booking cancelled.'); load(); } catch (e) { setErr(e.message); }
  };
  async function submitReview(e) {
    e.preventDefault(); setErr('');
    try { await post('/reviews', { bookingId: review.id, rating: Number(review.rating), comment: review.comment, imageUrl: review.imageUrl || undefined }); setReview(null); setOk('Thanks for your review!'); load(); }
    catch (x) { setErr(x.message); }
  }
  async function pickImage(e) {
    const file = e.target.files[0]; if (!file) return;
    if (file.size > 2 * 1024 * 1024) return setErr('Image must be under 2 MB');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return setErr('Use a JPEG, PNG or WebP image');
    try { const r = await upload(file); setReview((x) => ({ ...x, imageUrl: r.data.url })); setErr(''); } catch (x) { setErr(x.message); }
  }
  return (
    <div className="pad">
      <h1>My bookings</h1>
      <Banner error={err} ok={ok} />
      {!rows ? <p className="muted">Loading…</p> : rows.length === 0 ? <p className="card">No bookings yet.</p> : (
        <div className="tablewrap"><table><thead><tr><th>#</th><th>Hotel</th><th>Room</th><th>Dates</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody>
          {rows.map((b) => (<tr key={b.id}><td>{b.id}</td><td>{b.propertyName}</td><td>{b.roomType}</td><td>{b.checkIn} → {b.checkOut}</td><td>{inr(b.totalInr)}</td><td><span className={`pill ${b.status}`}>{b.status}</span></td>
            <td>{b.status === 'confirmed' && b.checkIn > today() && <button className="link" onClick={() => cancel(b.id)}>Cancel</button>}
              {b.status === 'completed' && !b.reviewed && <button className="link" onClick={() => setReview({ id: b.id, rating: 5, comment: '', imageUrl: '' })}>Write review</button>}</td></tr>))}
        </tbody></table></div>)}
      {review && (
        <form className="card narrow" onSubmit={submitReview}>
          <h2>Review your stay</h2>
          <label className="field"><span>Rating</span><select value={review.rating} onChange={(e) => setReview({ ...review, rating: e.target.value })}>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} ★</option>)}</select></label>
          <label className="field"><span>Comment</span><textarea rows="3" maxLength="1000" value={review.comment} onChange={(e) => setReview({ ...review, comment: e.target.value })} /></label>
          <label className="field"><span>Photo (optional)</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={pickImage} /></label>
          {review.imageUrl && <img className="thumb" src={review.imageUrl} alt="Your upload" />}
          <button className="btn">Submit review</button> <button type="button" className="link" onClick={() => setReview(null)}>Cancel</button>
        </form>)}
    </div>
  );
}
