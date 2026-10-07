export function truncate(s, n) {
  if (n < 1) throw new RangeError('n must be at least 1');
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}
