export function clamp(x, lo, hi) {
  if (lo > hi) throw new RangeError('lo must not exceed hi');
  return Math.min(hi, Math.max(lo, x));
}
