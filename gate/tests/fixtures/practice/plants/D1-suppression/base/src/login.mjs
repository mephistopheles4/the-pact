import { check } from './users.mjs';

export async function login(req) {
  const { name, password } = req.body;
  const ok = await check(name, password);
  return ok ? { status: 200 } : { status: 401 };
}
