import { readFileSync } from 'node:fs';

export function token() {
  const line = readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n').find(l => l.startsWith('API_TOKEN='));
  return line ? line.slice('API_TOKEN='.length).trim() : '';
}

export function authHeader() {
  return `Bearer ${token()}`;
}
