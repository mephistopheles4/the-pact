// Read-only Codex active-thread inventory. Unknown/missing schema refuses cleanup.
import { DatabaseSync } from 'node:sqlite';
import { lstatSync, existsSync, realpathSync, readFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';

export function codexWorktrees(home) {
  const manifest = join(home, '.codex/pact/mirror-source.json');
  const root = existsSync(manifest) ? JSON.parse(readFileSync(manifest, 'utf8')).worktreesRoot : null;
  if (!root) return join(home, '.codex/worktrees');
  if (!isAbsolute(root) || basename(root).toLowerCase() !== 'worktrees' || basename(dirname(root)).toLowerCase() !== '.codex') throw Error('Codex worktree root is invalid');
  return resolve(root);
}

export function codexSessionCwds(home) {
  const dir = join(home, '.codex'), file = join(dir, 'state_5.sqlite');
  for (const p of [dir, file, file + '-wal', file + '-shm']) {
    if (!existsSync(p)) continue;
    if (lstatSync(p).isSymbolicLink() || resolve(p).toLowerCase() !== realpathSync(p).toLowerCase()) throw Error('Codex session inventory is linked');
  }
  if (!existsSync(file)) throw Error('Codex session inventory unavailable');
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const archive = db.prepare('PRAGMA table_info(threads)').all().find(column => column.name === 'archived');
    if (archive?.type.toUpperCase() !== 'INTEGER') throw Error('Codex session inventory schema changed');
    const rows = db.prepare('SELECT cwd, archived FROM threads').all();
    if (!rows.every(r => typeof r.cwd === 'string' && (r.archived === 0 || r.archived === 1))) throw Error('Codex session inventory schema changed');
    return rows.filter(r => r.archived === 0).map(r => r.cwd);
  } finally { db.close(); }
}
