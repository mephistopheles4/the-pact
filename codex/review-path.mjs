import { lstatSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

const fold = p => process.platform === 'win32' ? p.toLowerCase() : p;
export function plainPath(value) {
  const result = resolve(value);
  for (let p = result; ; p = dirname(p)) {
    let entry;
    try { entry = lstatSync(p); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (entry && (entry.isSymbolicLink() || fold(realpathSync(p)) !== fold(p))) throw Error('linked path refused');
    if (dirname(p) === p) break;
  }
  return result;
}
export function within(root, path) {
  const rel = relative(fold(root), fold(path));
  return rel !== '' && rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel);
}
export function reviewPath(value, home, repository) {
  if (!isAbsolute(value) || /^[\\/]{2}/.test(value)) throw Error('review directory must be local and absolute');
  const result = plainPath(value);
  if (fold(repository) === fold(result) || within(repository, result)) throw Error('review directory is in the repository');
  const allowed = [resolve(home, '.codex/visualizations'), resolve(home, '.codex/pact/reviews')];
  if (!allowed.some(root => within(root, result))) throw Error('use a private Codex review directory');
  return result;
}
