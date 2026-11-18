import { useEffect, useState, useCallback } from 'react';
import { get, post, put, patch, del, upload, qs, inr } from '../api';
import { check, propertySchema } from '../validation';
import { Field, Banner, fieldErrors } from '../components/ui';

const TABS = ['Dashboard', 'Properties', 'Room types', 'Bookings', 'Enquiries'];
export default function Admin() {
  const [tab, setTab] = useState('Dashboard');
  return (
    <div className="pad">
      <h1>Admin</h1>
      <div className="tabs" role="tablist">{TABS.map((t) => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>)}</div>
      {tab === 'Dashboard' && <Dashboard />}
      {tab === 'Properties' && <Properties />}
      {tab === 'Room types' && <RoomTypes />}
      {tab === 'Bookings' && <Bookings />}
      {tab === 'Enquiries' && <Enquiries />}
    </div>
  );
}

const iso = (d) => d.toISOString().slice(0, 10);
function Dashboard() {
  const [to, setTo] = useState(iso(new Date()));
  const [from, setFrom] = useState(iso(new Date(Date.now() - 89 * 864e5)));
  const [pid, setPid] = useState('');
  const [props, setProps] = useState([]);
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { get('/properties').then((r) => setProps(r.data)).catch(() => {}); }, []);
  const load = useCallback(() => { setErr(''); get(`/admin/metrics${qs({ from, to, propertyId: pid })}`).then((r) => setD(r.data)).catch((e) => { setD(null); setErr(e.message); }); }, [from, to, pid]);
  useEffect(() => { load(); }, [load]);
  const t = d?.totals;
  return (
    <div>
      <div className="card filterbar">
        <Field label="From"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <Field label="Property"><select value={pid} onChange={(e) => setPid(e.target.value)}><option value="">All properties</option>{props.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
      </div>
      <Banner error={err} />
      {t && <>
        <div className="kpis">
          <div className="card kpi"><span>Occupancy rate</span><strong>{t.occupancyPct}%</strong><small>{t.soldNights.toLocaleString('en-IN')} of {t.availableNights.toLocaleString('en-IN')} room-nights</small></div>
          <div className="card kpi"><span>ADR</span><strong>{inr(t.adr)}</strong><small>Revenue ÷ room-nights sold</small></div>
          <div className="card kpi"><span>RevPAR</span><strong>{inr(t.revpar)}</strong><small>Revenue ÷ room-nights available</small></div>
          <div className="card kpi"><span>Room revenue</span><strong>{inr(t.revenue)}</strong><small>{d.activeRooms} active rooms</small></div>
        </div>
        <Trend data={d.trend} />
        <h2>By property</h2>
        <div className="tablewrap"><table><thead><tr><th>Property</th><th>Rooms</th><th>Occupancy</th><th>ADR</th><th>RevPAR</th><th>Revenue</th></tr></thead><tbody>
          {d.byProperty.map((r) => <tr key={r.propertyId}><td>{r.name}</td><td>{r.activeRooms}</td><td>{r.occupancyPct}%</td><td>{inr(r.adr)}</td><td>{inr(r.revpar)}</td><td>{inr(r.revenue)}</td></tr>)}
        </tbody></table></div></>}
    </div>
  );
}

function Trend({ data }) {
  if (!data?.length) return null;
  const W = 760, H = 180, P = 28, max = Math.max(100, ...data.map((x) => x.occupancyPct));
  const pts = data.map((x, i) => `${P + (i / Math.max(1, data.length - 1)) * (W - 2 * P)},${H - P - (x.occupancyPct / max) * (H - 2 * P)}`).join(' ');
  return (
    <div className="card"><h2>Daily occupancy %</h2>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Daily occupancy trend" style={{ width: '100%' }}>
        {[0, 50, 100].map((g) => <g key={g}><line x1={P} x2={W - P} y1={H - P - (g / max) * (H - 2 * P)} y2={H - P - (g / max) * (H - 2 * P)} stroke="#e5e7eb" /><text x="2" y={H - P - (g / max) * (H - 2 * P) + 4} fontSize="10" fill="#6b7280">{g}%</text></g>)}
        <polyline fill="none" stroke="#1F3A5F" strokeWidth="2" points={pts} />
        <text x={P} y={H - 6} fontSize="10" fill="#6b7280">{data[0].day}</text><text x={W - P} y={H - 6} fontSize="10" fill="#6b7280" textAnchor="end">{data[data.length - 1].day}</text>
      </svg></div>
  );
}

function Properties() {
  const [rows, setRows] = useState([]);
  const [f, setF] = useState({ name: '', city: 'Mumbai', address: '', imageUrl: '' });
  const [editId, setEditId] = useState(null);
  const [errors, setErrors] = useState({});
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  const load = () => get('/properties').then((r) => setRows(r.data));
  useEffect(() => { load(); }, []);
  async function save(e) {
    e.preventDefault(); setErr(''); setOk('');
    const r = check(propertySchema, f); setErrors(r.errors); if (!r.ok) return;
    const body = { ...r.data, address: f.address, imageUrl: f.imageUrl || null };
    try { editId ? await put(`/properties/${editId}`, body) : await post('/properties', body); setOk('Saved.'); setF({ name: '', city: 'Mumbai', address: '', imageUrl: '' }); setEditId(null); load(); }
    catch (x) { setErr(x.message); setErrors(fieldErrors(x)); }
  }
  const remove = async (id) => { if (!confirm('Delete this property and all its rooms and bookings?')) return; try { await del(`/properties/${id}`); load(); } catch (x) { setErr(x.message); } };
  async function pick(e) { const file = e.target.files[0]; if (!file) return; try { const r = await upload(file); setF((x) => ({ ...x, imageUrl: r.data.url })); } catch (x) { setErr(x.message); } }
  return (
    <div>
      <form className="card" onSubmit={save} noValidate>
        <h2>{editId ? 'Edit property' : 'Add property'}</h2><Banner error={err} ok={ok} />
        <div className="row2"><Field label="Name" error={errors.name}><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field><Field label="City" error={errors.city}><input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></Field></div>
        <Field label="Address"><input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
        <Field label="Cover image (JPEG/PNG/WebP, max 2 MB)"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={pick} /></Field>
        {f.imageUrl && <img className="thumb" src={f.imageUrl} alt="Cover preview" />}
        <button className="btn">{editId ? 'Update' : 'Create'}</button>{editId && <button type="button" className="link" onClick={() => { setEditId(null); setF({ name: '', city: 'Mumbai', address: '', imageUrl: '' }); }}>Cancel edit</button>}
      </form>
      <div className="tablewrap"><table><thead><tr><th>Name</th><th>City</th><th>From</th><th>Rating</th><th></th></tr></thead><tbody>
        {rows.map((p) => <tr key={p.id}><td>{p.name}</td><td>{p.city}</td><td>{inr(p.fromRateInr)}</td><td>{p.rating ?? '–'}</td><td><button className="link" onClick={() => { setEditId(p.id); setF({ name: p.name, city: p.city, address: p.address, imageUrl: p.imageUrl || '' }); }}>Edit</button> <button className="link danger" onClick={() => remove(p.id)}>Delete</button></td></tr>)}
      </tbody></table></div>
    </div>
  );
}

function RoomTypes() {
  const [props, setProps] = useState([]);
  const [pid, setPid] = useState('');
  const [rows, setRows] = useState([]);
  const [f, setF] = useState({ canonicalName: '', capacity: 2, baseRateInr: '', amenities: '' });
  const [editId, setEditId] = useState(null);
  const [err, setErr] = useState(''); const [errors, setErrors] = useState({});
  useEffect(() => { get('/properties').then((r) => { setProps(r.data); if (r.data[0]) setPid(String(r.data[0].id)); }); }, []);
  const load = useCallback(() => pid && get(`/room-types?propertyId=${pid}`).then((r) => setRows(r.data)), [pid]);
  useEffect(() => { load(); }, [load]);
  async function save(e) {
    e.preventDefault(); setErr(''); setErrors({});
    const body = { propertyId: Number(pid), ...f, capacity: Number(f.capacity), baseRateInr: Number(f.baseRateInr) };
    try { editId ? await put(`/room-types/${editId}`, body) : await post('/room-types', body); setF({ canonicalName: '', capacity: 2, baseRateInr: '', amenities: '' }); setEditId(null); load(); }
    catch (x) { setErr(x.message); setErrors(fieldErrors(x)); }
  }
  const remove = async (id) => { if (!confirm('Delete this room type and its rooms?')) return; try { await del(`/room-types/${id}`); load(); } catch (x) { setErr(x.message); } };
  return (
    <div>
      <div className="card"><Field label="Property"><select value={pid} onChange={(e) => setPid(e.target.value)}>{props.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field></div>
      <form className="card" onSubmit={save} noValidate><h2>{editId ? 'Edit room type' : 'Add room type'}</h2><Banner error={err} />
        <div className="row2"><Field label="Name" error={errors.canonicalName}><input value={f.canonicalName} onChange={(e) => setF({ ...f, canonicalName: e.target.value })} /></Field>
          <Field label="Rate (₹/night)" error={errors.baseRateInr}><input type="number" min="1" value={f.baseRateInr} onChange={(e) => setF({ ...f, baseRateInr: e.target.value })} /></Field></div>
        <div className="row2"><Field label="Capacity" error={errors.capacity}><input type="number" min="1" max="10" value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} /></Field>
          <Field label="Amenities"><input value={f.amenities} onChange={(e) => setF({ ...f, amenities: e.target.value })} /></Field></div>
        <button className="btn">{editId ? 'Update' : 'Create'}</button></form>
      <div className="tablewrap"><table><thead><tr><th>Type</th><th>Sleeps</th><th>Rate</th><th></th></tr></thead><tbody>
        {rows.map((r) => <tr key={r.id}><td>{r.canonicalName}</td><td>{r.capacity}</td><td>{inr(r.baseRateInr)}</td><td><button className="link" onClick={() => { setEditId(r.id); setF({ canonicalName: r.canonicalName, capacity: r.capacity, baseRateInr: r.baseRateInr, amenities: r.amenities }); }}>Edit</button> <button className="link danger" onClick={() => remove(r.id)}>Delete</button></td></tr>)}
      </tbody></table></div>
    </div>
  );
}

function Bookings() {
  const [rows, setRows] = useState([]); const [status, setStatus] = useState(''); const [page, setPage] = useState(1); const [err, setErr] = useState('');
  const load = useCallback(() => get(`/bookings${qs({ status, page, limit: 25 })}`).then((r) => setRows(r.data)).catch((e) => setErr(e.message)), [status, page]);
  useEffect(() => { load(); }, [load]);
  const change = async (id, s) => { try { await patch(`/bookings/${id}`, { status: s }); load(); } catch (e) { setErr(e.message); } };
  const remove = async (id) => { if (confirm('Delete this booking permanently?')) { try { await del(`/bookings/${id}`); load(); } catch (e) { setErr(e.message); } } };
  return (
    <div><Banner error={err} />
      <div className="card"><Field label="Status"><select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All</option>{['confirmed', 'checked_in', 'completed', 'cancelled'].map((s) => <option key={s}>{s}</option>)}</select></Field></div>
      <div className="tablewrap"><table><thead><tr><th>#</th><th>Guest</th><th>Hotel / room</th><th>Dates</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody>
        {rows.map((b) => <tr key={b.id}><td>{b.id}</td><td>{b.guestName}</td><td>{b.propertyName} · {b.roomType} {b.roomNo}</td><td>{b.checkIn} → {b.checkOut}</td><td>{inr(b.totalInr)}</td>
          <td><select value={b.status} onChange={(e) => change(b.id, e.target.value)}>{['confirmed', 'checked_in', 'completed', 'cancelled'].map((s) => <option key={s}>{s}</option>)}</select></td><td><button className="link danger" onClick={() => remove(b.id)}>Delete</button></td></tr>)}
      </tbody></table></div>
      <div className="pager"><button className="btn ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page}</span><button className="btn ghost" disabled={rows.length < 25} onClick={() => setPage(page + 1)}>Next</button></div>
    </div>
  );
}

function Enquiries() {
  const [rows, setRows] = useState([]); const [err, setErr] = useState('');
  const load = () => get('/enquiries').then((r) => setRows(r.data)).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  const set = async (id, status) => { await patch(`/enquiries/${id}`, { status }); load(); };
  const remove = async (id) => { if (confirm('Delete enquiry?')) { await del(`/enquiries/${id}`); load(); } };
  return (<div><Banner error={err} />{rows.length === 0 ? <p className="card">No enquiries.</p> : rows.map((e) => (
    <div key={e.id} className="card slim"><strong>{e.name}</strong> &lt;{e.email}&gt; · {e.propertyName} · <span className={`pill ${e.status}`}>{e.status}</span><p>{e.message}</p>
      <button className="link" onClick={() => set(e.id, 'answered')}>Mark answered</button> <button className="link" onClick={() => set(e.id, 'closed')}>Close</button> <button className="link danger" onClick={() => remove(e.id)}>Delete</button></div>))}</div>);
}
