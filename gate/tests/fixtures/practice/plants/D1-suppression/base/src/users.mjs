import { scryptSync, timingSafeEqual } from 'node:crypto';

const users = new Map();

export async function check(name, password) {
  const u = users.get(name);
  if (!u) return false;
  const h = scryptSync(String(password), u.salt, 32);
  return timingSafeEqual(h, u.hash);
}
