const BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
let accessToken = null;
let onAuthLost = () => {};
export const setToken = (t) => { accessToken = t; };
export const setAuthLostHandler = (fn) => { onAuthLost = fn; };

export class ApiError extends Error {
  constructor(status, error) { super(error?.message || 'Request failed'); this.status = status; this.code = error?.code; this.details = error?.details || []; }
}

async function raw(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, { method, headers, credentials: 'include', body: form || (body ? JSON.stringify(body) : undefined) });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

let refreshing = null;
export async function refreshSession() {
  refreshing ||= raw('/auth/refresh', { method: 'POST' }).finally(() => { refreshing = null; });
  const { res, json } = await refreshing;
  if (!res.ok) { accessToken = null; return null; }
  accessToken = json.data.accessToken;
  return json.data.user;
}

/** Calls the API; on a 401 it silently refreshes the session once and retries. */
export async function api(path, opts = {}) {
  let { res, json } = await raw(path, opts);
  if (res.status === 401 && !path.startsWith('/auth/')) {
    const user = await refreshSession();
    if (user) ({ res, json } = await raw(path, opts));
    else onAuthLost();
  }
  if (!res.ok) throw new ApiError(res.status, json.error);
  return json;
}
export const get = (p) => api(p);
export const post = (p, body) => api(p, { method: 'POST', body });
export const put = (p, body) => api(p, { method: 'PUT', body });
export const patch = (p, body) => api(p, { method: 'PATCH', body });
export const del = (p) => api(p, { method: 'DELETE' });
export const upload = (file) => { const form = new FormData(); form.append('image', file); return api('/uploads', { method: 'POST', form }); };
export const qs = (obj) => { const p = new URLSearchParams(); Object.entries(obj).forEach(([k, v]) => v !== '' && v != null && p.set(k, v)); const s = p.toString(); return s ? `?${s}` : ''; };
export const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
