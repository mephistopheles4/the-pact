#!/usr/bin/env node
// Scoped personal Codex mirror: committed code, private plan, explicit apply, no Claude writes.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha = b => createHash('sha256').update(b).digest('hex');
const say = s => process.stdout.write(s + '\n');
export function repositoryPath(repository, file, paths = path) {
  const fold = value => paths.sep === '\\' ? value.toLowerCase() : value;
  const rel = paths.relative(fold(repository), fold(paths.resolve(file)));
  return rel === '' || (rel !== '..' && !rel.startsWith('..' + paths.sep) && !paths.isAbsolute(rel));
}
export function failureReport(error) {
  if (error?.code === 'ROLLBACK_REQUIRED') return {
    code: 3,
    lines: ['ROLLBACK REQUIRED: recovery did not finish; live files may still contain installation changes.',
      `Backup: ${error.backupPath}`, `Backup digest: ${error.backupDigest ?? 'unavailable; inspect the private backup before recovery'}`,
      ...(error.diagnosticsPath ? [`Private diagnostics: ${error.diagnosticsPath}`] : []),
      'Keep this private backup and review recovery before retrying the installer.', 'RESULT: rollback required'],
  };
  return { code: 2, lines: ['REFUSED: input, code, destination or required CI verification did not pass. Nothing may be applied from this run.', 'RESULT: refused'] };
}
export function tool(name, { repository = root, searchPath = process.env.PATH ?? '' } = {}) {
  const canonicalRoot = realpathSync(repository);
  for (const raw of searchPath.split(delimiter)) {
    const dir = raw.replace(/^"|"$/g, '');
    if (!isAbsolute(dir)) continue;
    const file = join(dir, process.platform === 'win32' ? name + '.exe' : name);
    if (repositoryPath(repository, file)) continue;
    try {
      const candidate = realpathSync(file);
      if (!repositoryPath(canonicalRoot, candidate) && statSync(candidate).isFile()) return candidate;
    } catch {}
  }
  throw Error('required executable unavailable');
}
function run(exe, args) {
  const r = spawnSync(tool(exe), args, { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
  if (r.status !== 0 || !r.stdout) throw Error('required repository or CI read failed');
  return r.stdout.trim();
}
async function main() {
  if (Number(process.versions.node.split('.')[0]) < 24 || process.env.NODE_OPTIONS !== undefined || process.execArgv.length) throw Error('Node 24 without preloads required');
  const words = process.argv.slice(2), mode = words[0]?.startsWith('--') ? 'dry-run' : words.shift() ?? 'dry-run';
  if (!['dry-run', 'apply', 'rollback'].includes(mode)) throw Error('mode must be dry-run, apply or rollback');
  const options = {};
  while (words.length) {
    const key = words.shift(), value = words.shift();
    if (!['--review-dir', '--digest'].includes(key) || !value || Object.hasOwn(options, key)) throw Error('unknown or duplicate option');
    options[key] = value;
  }
  let review = options['--review-dir'];
  if (!review || !isAbsolute(review)) throw Error('an absolute private review directory is required');
  const home = realpathSync(homedir());
  const origin = run('git', ['remote', 'get-url', 'origin']);
  if (!/(?:\/mephistopheles4\/the-pact|:mephistopheles4\/the-pact)(?:\.git)?$/.test(origin)) throw Error('unexpected repository origin');
  const head = run('git', ['rev-parse', 'HEAD']);
  const code = [];
  const codeFiles = [...readdirSync(join(root, 'codex')).filter(n => n.endsWith('.mjs')).map(n => 'codex/' + n), '.claude/hooks/athanor-guard.mjs'].sort();
  for (const rel of codeFiles) {
    const bytes = readFileSync(join(root, rel));
    const committed = spawnSync(tool('git'), ['show', `HEAD:${rel}`], { cwd: root, windowsHide: true });
    if (committed.status !== 0 || !bytes.equals(committed.stdout)) throw Error('adapter code must be committed and unchanged');
    code.push([rel, sha(bytes)]);
  }
  const { snapshot } = await import('./source.mjs');
  const { plan, apply, rollback, digest, verifyPlan, RollbackRequiredError } = await import('./transaction.mjs');
  const { reviewPath } = await import('./review-path.mjs');
  const { verifyCI } = await import('./ci.mjs');
  const { probeAthanor } = await import('../.claude/hooks/athanor-guard.mjs');
  review = reviewPath(review, home, root);
  const planFile = join(review, 'plan.json');
  if (mode === 'rollback') {
    const backup = readFileSync(join(review, 'backup.json'));
    if (sha(backup) !== options['--digest']) throw Error('reviewed backup digest required');
    let restored;
    try { restored = rollback(home, review); }
    catch (error) { throw new RollbackRequiredError([error], review); }
    say(`ROLLBACK: ${restored} files restored`); say('RESULT: pass'); return;
  }
  const source = snapshot(home, root, process.execPath);
  const ancestor = spawnSync(tool('git'), ['merge-base', '--is-ancestor', source.sourceCommit, head], { cwd: root, windowsHide: true });
  if (ancestor.status !== 0) throw Error('checkout is behind or unrelated to the installed source');
  const pins = { head, code, sources: source.pins, nativeIsolation: 'accepted-weaker' };
  const p = plan(home, source.files, pins), id = digest(p);
  const checks = JSON.parse(run('gh', ['api', `repos/mephistopheles4/the-pact/commits/${head}/check-runs?per_page=100&filter=latest`])).check_runs;
  if (!Array.isArray(checks)) throw Error('CI read invalid');
  const ciRuns = verifyCI(checks, head, id => JSON.parse(run('gh', ['api', `repos/mephistopheles4/the-pact/actions/runs/${id}`])));
  const athanorReady = await probeAthanor({ env: { ...process.env, MISE_AUTO_INSTALL: '0' } });
  if (mode === 'dry-run') {
    if (existsSync(planFile)) throw Error('review plan already exists; use a fresh review directory');
    mkdirSync(review, { recursive: true, mode: 0o700 });
    writeFileSync(planFile, JSON.stringify(p, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    const report = `Codex mirror: ${p.counts.add} add; ${p.counts.replace} replace; ${p.counts.unchanged} unchanged\nSkills: ${source.skillCount} direct, ${source.supportingSkills} supporting; lenses: 9; commands: 4\n${ciRuns.map(r => `CI ${r.name}: ${r.url} @ ${r.head}\n`).join('')}Live writes: 0\nReview digest: ${id}\nDifferences: native subagent isolation accepted; commands use skill invocation; cleaner override is owner-run; hooks need native review and trust after installation.\n${source.warnings.map(w => 'SOURCE WARNING: ' + w + '\n').join('')}Rollback: private backup.json with prior file bytes; refuses subsequent owner edits.\nAPPLY argv: ${JSON.stringify([process.execPath, join(root, 'codex/install.mjs'), 'apply', '--review-dir', review, '--digest', id])}\nRESULT: pass\n`;
    const completeReport = `Athanor shim: ${athanorReady ? 'available; automatic installation disabled' : 'unavailable to this process; verify host access before diagnosing missing tools'}\n` + report;
    writeFileSync(join(review, 'dry-run.txt'), completeReport, { mode: 0o600 }); say(completeReport.trimEnd()); return;
  }
  const reviewed = JSON.parse(readFileSync(planFile, 'utf8'));
  verifyPlan(reviewed, p, options['--digest']);
  const backup = apply(home, reviewed, id, review);
  say(`APPLIED: ${backup.completed.length} files; backup digest ${sha(readFileSync(join(review, 'backup.json')))}`);
  say('Review the new hooks in Codex Settings > Hooks before relying on them.'); say('RESULT: pass');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { const report = failureReport(error); report.lines.forEach(say); process.exitCode = report.code; });
}
