// How long ago, as T3's sidebar times: "just now", then 5m, 3h, 2d; no "ago", nothing past days. `ms` and `now` in ms.
export function ago(ms, now) {
  const m = Math.floor((now - ms) / 60000);
  if (!(m >= 1)) return "just now";
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h`;
  return `${Math.floor(m / 1440)}d`;
}
