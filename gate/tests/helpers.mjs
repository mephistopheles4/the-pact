// Shared fixtures for the gate's tests. Everything is built in a fresh temp
// folder per test; nothing here touches the repo tree or ~/.claude.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const GATE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const REPO = resolve(GATE, '..');
export const SEAM_A = join(GATE, 'seam-a.mjs');
export const PINNED = join(GATE, 'grimoire', 'check.mjs');

export function tempDir(t, prefix = 'pact-test-') {
  const d = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
}

/** Write { 'rel/path': text } under root. */
export function writeTree(root, files) {
  for (const [rel, text] of Object.entries(files)) {
    const p = join(root, ...rel.split('/'));
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, text);
  }
}

/** An agent file from frontmatter lines and a body. */
export function agent(lines, body = 'Body.\n') {
  return `---\n${lines.join('\n')}\n---\n\n${body}`;
}

export const READ_ONLY = 'tools: [Read, Glob, Grep]';

/** A minimal valid unmigrated agent named `name`. */
export function plainAgent(name, extra = [], tools = READ_ONLY) {
  return agent([`name: ${name}`, 'description: A test agent.', ...(tools === null ? [] : [tools]), ...extra]);
}

/** Today's payload, copied from the repo, as the stage holds it. */
export function realPayload(root) {
  cpSync(join(REPO, 'claude'), join(root, 'claude'), { recursive: true });
  mkdirSync(join(root, 'familiars'), { recursive: true });
  writeFileSync(join(root, 'familiars', '.gitkeep'), '');
}

/** A minimal stage: a CLAUDE.md, an overlay, and the given extra files. */
export function stage(t, files = {}) {
  const root = tempDir(t);
  writeTree(root, {
    'claude/CLAUDE.md': '# pact\n',
    'claude/settings.overlay.json': '{}\n',
    'familiars/.gitkeep': '',
    ...files,
  });
  return root;
}

export function contractText(extraKeys = 'tools, model, effort') {
  return `# Contract: test\n\nVersion: 0.6.0\nTarget: claude\nExtra keys: ${extraKeys}\n`;
}

/** Write a familiar and its contract under root/familiars, then seal it with the pinned check (tests only). */
export function sealedFamiliar(root, name, { lines, contract } = {}) {
  const fm = lines ?? [`name: ${name}`, 'description: A test familiar.', READ_ONLY];
  writeTree(root, {
    [`familiars/${name}.md`]: agent(fm),
    [`familiars/${name}.contract.md`]: contract ?? contractText(),
  });
  const r = spawnSync(process.execPath, [PINNED, '--seal', join(root, 'familiars', `${name}.md`)], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`sealing ${name} failed:\n${r.stdout}${r.stderr}`);
}

export function runSeamA(root, script = SEAM_A) {
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  const r = spawnSync(process.execPath, [script, root], { encoding: 'utf8', env });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, out: r.stdout + r.stderr };
}

/** The FAIL rule names in seam A's output. */
export function failRules(stdout) {
  return stdout
    .split('\n')
    .filter(l => l.startsWith('FAIL '))
    .map(l => l.slice(5).split(':')[0]);
}

export function lastLine(stdout) {
  const ls = stdout.split('\n').filter(l => l !== '');
  return ls[ls.length - 1];
}

export function read(p) {
  return readFileSync(p, 'utf8');
}
