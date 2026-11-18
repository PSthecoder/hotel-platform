import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { get, qs, inr } from '../api';
import { check, searchSchema, today } from '../validation';
import { Field, Banner, Stars } from '../components/ui';

const EMPTY = { city: '', checkIn: '', checkOut: '', guests: '', minPrice: '', maxPrice: '', roomType: '', minRating: '', sort: 'price_asc' };
const ROOM_TYPES = ['Standard Room', 'Deluxe Room', 'Sea View Room', 'Executive Suite', 'Family Room', 'Presidential Suite'];

export default function Search() {
  const [params, setParams] = useSearchParams();
  const applied = { ...EMPTY, ...Object.fromEntries(params) };
  const [form, setForm] = useState(applied);
  const [errors, setErrors] = useState({});
  const [state, setState] = useState({ loading: true, rows: [], meta: null, error: '' });
  const page = Number(params.get('page') || 1);

  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true, error: '' }));
    const q = { ...applied, page, limit: 12 };
    get(`/rooms/search${qs(q)}`)
      .then((r) => live && setState({ loading: false, rows: r.data, meta: r.meta, error: '' }))
      .catch((e) => live && setState({ loading: false, rows: [], meta: null, error: e.message }));
    return () => { live = false; };
  }, [params.toString()]); // eslint-disable-line

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  function submit(e) {
    e.preventDefault();
    const r = check(searchSchema, form);
    setErrors(r.errors);
    if (!r.ok) return;
    setParams(Object.fromEntries(Object.entries(form).filter(([, v]) => v !== '')));
  }
  const reset = () => { setForm(EMPTY); setParams({}); setErrors({}); };
  const total = state.meta?.total || 0;
  const pages = Math.max(1, Math.ceil(total / 12));
  const goto = (p) => setParams({ ...Object.fromEntries(params), page: String(p) });

  return (
    <div className="layout">
      <aside className="filters card">
        <form onSubmit={submit} noValidate>
          <h2>Find a room</h2>
          <Field label="City / area"><input value={form.city} onChange={set('city')} placeholder="Mumbai" /></Field>
          <Field label="Check-in"><input type="date" min={today()} value={form.checkIn} onChange={set('checkIn')} /></Field>
          <Field label="Check-out" error={errors.checkOut}><input type="date" min={form.checkIn || today()} value={form.checkOut} onChange={set('checkOut')} /></Field>
          <Field label="Guests"><input type="number" min="1" max="10" value={form.guests} onChange={set('guests')} /></Field>
          <Field label="Room type"><select value={form.roomType} onChange={set('roomType')}><option value="">Any</option>{ROOM_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
          <div className="row2">
            <Field label="Min ₹"><input type="number" min="0" value={form.minPrice} onChange={set('minPrice')} /></Field>
            <Field label="Max ₹"><input type="number" min="0" value={form.maxPrice} onChange={set('maxPrice')} /></Field>
          </div>
          <Field label="Minimum rating"><select value={form.minRating} onChange={set('minRating')}><option value="">Any</option><option value="3">3+</option><option value="4">4+</option><option value="4.5">4.5+</option></select></Field>
          <Field label="Sort by"><select value={form.sort} onChange={set('sort')}><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option><option value="rating">Top rated</option></select></Field>
          <button className="btn">Search</button> <button type="button" className="link" onClick={reset}>Reset</button>
        </form>
      </aside>
      <section>
        <h1>Boutique stays across Mumbai</h1>
        <Banner error={state.error} />
        {state.loading ? <div className="grid">{Array.from({ length: 6 }, (_, i) => <div key={i} className="card skeleton" />)}</div>
          : state.rows.length === 0 && !state.error ? <p className="card">No rooms match these filters. Try different dates or widen the price range.</p>
          : <div className="grid">{state.rows.map((r) => (
            <article key={r.id} className="card room">
              {r.imageUrl ? <img src={r.imageUrl} alt={`${r.roomType} at ${r.propertyName}`} loading="lazy" /> : <div className="ph" aria-hidden>🛏️</div>}
              <h3>{r.roomType}</h3>
              <p><Link to={`/property/${r.propertyId}`}>{r.propertyName}</Link> · {r.city}</p>
              <p className="muted">Sleeps {r.capacity} · {r.rating > 0 ? <><Stars value={r.rating} /> {r.rating}</> : 'No reviews yet'}</p>
              <p className="price">{inr(r.rateInr)} <small>/ night</small></p>
              <p className="muted">{r.available} available</p>
              <Link className="btn" to={`/book/${r.id}${qs({ checkIn: applied.checkIn, checkOut: applied.checkOut, guests: applied.guests })}`}>Book</Link>
            </article>))}</div>}
        {total > 12 && <div className="pager"><button className="btn ghost" disabled={page <= 1} onClick={() => goto(page - 1)}>Previous</button><span>Page {page} of {pages}</span><button className="btn ghost" disabled={page >= pages} onClick={() => goto(page + 1)}>Next</button></div>}
      </section>
    </div>
  );
}
