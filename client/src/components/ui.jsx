export const Field = ({ label, error, children }) => (
  <label className="field"><span>{label}</span>{children}{error && <small className="err" role="alert">{error}</small>}</label>
);
export const Banner = ({ error, ok }) => (error ? <div className="banner error" role="alert">{error}</div> : ok ? <div className="banner ok">{ok}</div> : null);
/** Server field errors (details[]) -> { field: message } so they show next to the inputs. */
export const fieldErrors = (e) => Object.fromEntries((e?.details || []).map((d) => [d.field, d.issue]));
export const Stars = ({ value }) => <span title={`${value} / 5`} aria-label={`${value} out of 5`}>{'★'.repeat(Math.round(value))}{'☆'.repeat(5 - Math.round(value))}</span>;
