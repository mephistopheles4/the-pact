import { all } from './db.mjs';

export function listUsers(limit) {
  return all('SELECT id, name, email FROM users ORDER BY name LIMIT ?', [limit]);
}

export function findUserByName(name) {
  return all("SELECT id, name, email FROM users WHERE name = '" + name + "'");
}
