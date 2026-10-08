export function parsePort(s) {
  if (typeof s !== 'string' || !/^[0-9]{1,5}$/.test(s)) throw new RangeError('a port is 1 to 5 digits');
  const n = Number(s);
  if (n < 1 || n > 65535) throw new RangeError('a port is from 1 to 65535');
  return n;
}
