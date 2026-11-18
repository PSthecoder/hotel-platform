const ISO = /^\d{4}-\d{2}-\d{2}$/;
function parseISO(s) {
  if (!ISO.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt : null;
}
const nightsBetween = (ci, co) => Math.round((parseISO(co) - parseISO(ci)) / 864e5);
const todayISO = () => new Date().toISOString().slice(0, 10);
module.exports = { ISO, parseISO, nightsBetween, todayISO };
