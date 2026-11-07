// Helpers for the auto-compact install tests (#482): a configuration file, the
// live settings, the pact's group as the install writes it, and the files an
// install leaves. They install nothing themselves.
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const EVENTS = ['PostToolUse', 'UserPromptSubmit', 'Stop', 'PreCompact', 'SessionStart'];

/** Writes pact/config.json in the Claude home folder `h`: schema 1 and `doc`. */
export function config(h, doc) {
  mkdirSync(join(h, 'pact'), { recursive: true });
  writeFileSync(join(h, 'pact', 'config.json'), `${JSON.stringify({ schema: 1, ...doc })}\n`);
}
export const windowCfg = n => ({ settings: { 'auto-compact-window': n } });
export const live = h => JSON.parse(readFileSync(join(h, 'settings.json'), 'utf8'));
export const writeLive = (h, doc) => writeFileSync(join(h, 'settings.json'), JSON.stringify(doc, null, 2), { mode: 0o600 });
export const script = h => join(h, 'pact', 'hooks', 'compact-handoff.mjs');

/** The group the install writes for `event` with window `w`. */
export function pactGroup(h, w, event) {
  const group = { hooks: [{ type: 'command', command: 'node', args: [script(h), String(w)], timeout: 15 }] };
  return event === 'SessionStart' ? { matcher: 'compact', ...group } : group;
}

/** Every file under `dir` (not folders), relative, but not the install record, the backups or the builder kit (whose copy of the overlay is the payload's own). */
export function files(dir) {
  return readdirSync(dir, { recursive: true })
    .map(String)
    .map(p => p.replace(/\\/g, '/'))
    .filter(p => statSync(join(dir, p)).isFile() && p !== '.pact-install.json' && !p.startsWith('pact/backups/') && !p.startsWith('pact/builder/'))
    .sort();
}

/** The rules file without the notice's two lines: its digest and its "Values set". */
export const withoutNotice = text => text.split('\n').filter(l => !l.startsWith('**Configuration in effect.**') && !l.startsWith('Values set:')).join('\n');
