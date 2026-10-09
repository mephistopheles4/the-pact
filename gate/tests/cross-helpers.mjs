// Shared fixtures for the cross script's tests (#44). Every lens report here
// is synthetic and built in code, so no line-ending setting can change the
// bytes a test depends on. Hostile characters are made at runtime from
// escapes, so this source stays plain ASCII.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './text.mjs';
import { tempDir } from './tree.mjs';

// The script under test. Only the mutation battery sets PACT_CROSS_UNDER_TEST,
// to point the tests at a mutated copy in a temp folder.
export const CROSS = process.env.PACT_CROSS_UNDER_TEST || join(REPO, 'cross', 'cross.mjs');
export const PROMPT = '**Where do you expect the problem?**';
export const LIMIT = 65536;

/** A finding. `anchor` is a claim or section id ('C2', 'S1') or a full anchor object. */
export function finding(id, anchor, severity, headline, extra = {}) {
  const a = typeof anchor === 'string' ? { kind: anchor[0] === 'C' ? 'claim' : 'section', id: anchor } : anchor;
  return { id, anchor: a, severity, headline, ...extra };
}

/** A findings block. */
export function block(lens, verdict, findings = [], extra = {}) {
  return { lens, verdict, findings, notChecked: [`${lens} did not check the synthetic claim list`], ...extra };
}

/** A lens report around one findings block (an object, or raw JSON text). */
export function report(b, { before = '', after = '' } = {}) {
  const json = typeof b === 'string' ? b : JSON.stringify(b, null, 2);
  return `**For the owner**\n\nA synthetic report.\n\n**For the session**\n\n${before}\`\`\`lens-findings\n${json}\n\`\`\`\n${after}`;
}

/**
 * Run the cross script on reports given as { lens: text } (or [[lens, text, fileName]]).
 * Returns the exit code, stdout, the FAIL rules, and the written files.
 */
export function cross(t, { reports, point = 'result', tier = 'thorough', anchors = 'C1,C2,C3,C4', mode = 'cross', pick, args, out = true, env } = {}) {
  const dir = tempDir(t, 'pact-cross-');
  const list = Array.isArray(reports) ? reports : Object.entries(reports);
  const argv = [CROSS, mode];
  if (args) argv.push(...args);
  else {
    if (point !== null) argv.push('--point', point);
    if (tier !== null) argv.push('--tier', tier);
    if (anchors !== null) argv.push('--anchors', anchors);
    if (pick !== undefined) argv.push('--pick', pick);
    if (mode === 'cross' && out) argv.push('--out', join(dir, 'out'));
  }
  for (const [lens, text, name] of list) {
    const file = join(dir, name ?? `${lens}.md`);
    if (text !== null) writeFileSync(file, text); // null: a file that does not exist
    argv.push(`${lens}=${file}`);
  }
  const e = { ...process.env, ...env };
  delete e.NODE_OPTIONS;
  const r = spawnSync(process.execPath, argv, { encoding: 'utf8', env: e });
  const outDir = join(dir, 'out');
  const files = {};
  if (existsSync(outDir)) for (const f of readdirSync(outDir).sort()) files[f] = readFileSync(join(outDir, f), 'utf8');
  const comments = Object.keys(files)
    .filter(f => /^comment-[0-9]+\.md$/.test(f))
    .sort((a, b) => Number(a.slice(8, -3)) - Number(b.slice(8, -3)))
    .map(f => files[f]);
  return {
    code: r.status,
    stdout: r.stdout,
    stderr: r.stderr,
    rules: r.stdout.split('\n').filter(l => l.startsWith('FAIL ')).map(l => l.slice(5).split(':')[0]),
    files,
    comments,
    all: comments.join('\n'),
    page: files['page.html'],
    dir,
  };
}

/** The bytes above the prediction prompt in each part, in order: '' once the prompt has passed. */
export function abovePrompt(comments) {
  let passed = false;
  return comments.map(c => {
    if (passed) return '';
    const i = c.indexOf(PROMPT);
    if (i < 0) return c;
    passed = true;
    return c.slice(0, i);
  });
}

/** A valid QA pair: a crossing at C2, a single at C3, and one lens per verdict given. */
export function qaPair({ aVerdict = 'findings', bVerdict = 'blocking', aSev = 'medium', bSev = 'high' } = {}) {
  const aF = aVerdict === 'clear' ? [] : [finding('F1', 'C2', aSev, 'The retry test mocks the helper it is meant to test')];
  const bF = bVerdict === 'clear' ? [] : [finding('F1', 'C2', bSev, 'The mutation run left the retry branch alive'), finding('F2', 'C3', bSev === 'high' ? 'low' : bSev, 'No test covers the empty input')];
  return {
    'behaviour-lens': report(block('behaviour-lens', aVerdict, aF)),
    'integrity-lens': report(block('integrity-lens', bVerdict, bF)),
  };
}
