// Private, digest-bound file transaction shared by the Codex planner and fixtures.
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const digest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
export class RollbackRequiredError extends AggregateError {
  constructor(errors, review) {
    super(errors, 'installation recovery is incomplete', { cause: errors[0] });
    this.code = 'ROLLBACK_REQUIRED';
    this.backupPath = join(review, 'backup.json');
    try { this.backupDigest = digest(readFileSync(this.backupPath)); }
    catch { this.backupDigest = null; }
    const diagnostics = join(review, 'recovery-error.json');
    try {
      atomic(diagnostics, JSON.stringify({ schema: 1, backupPath: this.backupPath, backupDigest: this.backupDigest,
        errors: errors.map(error => ({ name: error.name, message: error.message, stack: error.stack })) }));
      this.diagnosticsPath = diagnostics;
    } catch { /* Keep the recovery signal and backup even if diagnostics cannot be saved. */ }
  }
}
export function verifyPlan(reviewed, current, expected) {
  if (expected !== digest(reviewed) || digest(reviewed) !== digest(current)) throw Error('reviewed input, code, payload or destination drift');
}
function plain(p) {
  let s;
  try { s = lstatSync(p); } catch (e) { if (e.code === 'ENOENT') return; throw e; }
  if (s.isSymbolicLink() || (!s.isDirectory() && (!s.isFile() || s.nlink !== 1))) throw Error('unsafe target link or file');
}
function target(root, rel) {
  if (typeof rel !== 'string' || !rel.split('/').every(x => /^[A-Za-z0-9_.-]+$/.test(x) && x !== '.' && x !== '..' && !/[. ]$/.test(x) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(x))) throw Error('unsafe target path');
  plain(root);
  let p = root;
  for (const part of rel.split('/')) { p = join(p, part); plain(p); }
  return p;
}
const current = p => existsSync(p) ? digest(readFileSync(p)) : null;
function atomic(p, bytes) {
  plain(dirname(p)); mkdirSync(dirname(p), { recursive: true, mode: 0o700 });
  const tmp = join(dirname(p), `.pact-${randomUUID()}.tmp`);
  try { writeFileSync(tmp, bytes, { flag: 'wx', mode: 0o600 }); renameSync(tmp, p); }
  finally { if (existsSync(tmp)) unlinkSync(tmp); }
}
export function plan(root, files, pins) {
  if (resolve(root) !== realpathSync(root)) throw Error('unsafe target root alias');
  const seen = new Set(), counts = { add: 0, replace: 0, unchanged: 0 };
  const rows = files.map(({ path, text, bytes }) => {
    const p = target(root, path), key = path.toLowerCase();
    if (seen.has(key)) throw Error('duplicate target'); seen.add(key);
    if (typeof text !== 'string' && !Buffer.isBuffer(bytes)) throw Error('target bytes required');
    const content = bytes ?? Buffer.from(text);
    const before = current(p), after = digest(content);
    const action = before === after ? 'unchanged' : before === null ? 'add' : 'replace';
    counts[action]++;
    return { path, data: content.toString('base64'), before, after, action };
  });
  return { schema: 1, root: realpathSync(root), pins, counts, files: rows };
}
export function apply(root, p, expected, review) {
  if (digest(p) !== expected || p.schema !== 1 || p.root !== realpathSync(root)) throw Error('review digest or target mismatch');
  const journal = join(review, 'backup.json');
  plain(review); plain(journal);
  if (existsSync(journal)) throw Error('backup already exists');
  // Check the whole transaction before the first destination write.
  for (const row of p.files) {
    if (current(target(root, row.path)) !== row.before) throw Error('destination drift');
    if (digest(Buffer.from(row.data, 'base64')) !== row.after) throw Error('payload drift');
  }
  const backup = { schema: 1, root: p.root, plan: expected, completed: [], files: p.files.filter(r => r.action !== 'unchanged').map(r => ({ path: r.path, before: r.before, after: r.after, bytes: r.before === null ? null : readFileSync(target(root, r.path)).toString('base64') })) };
  atomic(journal, JSON.stringify(backup));
  try {
    for (const row of backup.files) {
      const pth = target(root, row.path);
      if (current(pth) !== row.before) throw Error('destination drift');
      const payload = p.files.find(r => r.path === row.path);
      backup.completed.push(row.path); atomic(journal, JSON.stringify(backup));
      atomic(pth, Buffer.from(payload.data, 'base64'));
      if (current(pth) !== row.after) throw Error('installed verification failed');
    }
  } catch (error) {
    try { rollback(root, review); }
    catch (recoveryError) { throw new RollbackRequiredError([error, recoveryError], review); }
    throw error;
  }
  return backup;
}
export function rollback(root, review) {
  const journal = join(review, 'backup.json'); plain(review); plain(journal);
  const b = JSON.parse(readFileSync(journal, 'utf8'));
  if (b.schema !== 1 || b.root !== realpathSync(root)) throw Error('backup target mismatch');
  const completed = new Set(b.completed);
  const rows = b.files.filter(r => completed.has(r.path));
  for (const r of rows) {
    const now = current(target(root, r.path));
    if (now !== r.after && now !== r.before) throw Error('installed files changed; rollback refused');
    if ((r.bytes === null ? null : digest(Buffer.from(r.bytes, 'base64'))) !== r.before) throw Error('backup digest mismatch');
  }
  for (const r of [...rows].reverse()) {
    const p = target(root, r.path);
    if (current(p) === r.before) continue;
    if (r.bytes === null) unlinkSync(p); else atomic(p, Buffer.from(r.bytes, 'base64'));
  }
  atomic(join(review, 'rolled-back.json'), JSON.stringify({ schema: 1, plan: b.plan, paths: rows.length }));
  return rows.length;
}
