// A retired agent's name (#302, from #281): good-enough-lens left the pact. The
// renderer refuses an agents key that names it, and warns, with a fixed line,
// when an edit block or a project qualities list still names it. Driven
// through the renderer's command line, as the install script runs it. Every
// fixture is invented text. The install's side of these lines is in
// retired-agent-install.test.mjs.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { AGENT_NAMES, RETIRED_AGENTS } from '../install-core.mjs';
import { RENDER, REPO, lastLine } from './text.mjs';
import { tempDir } from './tree.mjs';

const SOURCE = join(REPO, 'claude', 'CLAUDE.md');
const LENS = 'good-enough-lens';
const MODEL = 'zz-distinctive-model-9';
const SENTINEL = 'ZZSENTINELWORD';

const env = () => {
  const e = { ...process.env };
  delete e.NODE_OPTIONS;
  return e;
};

function readAll(dir) {
  return readdirSync(dir, { recursive: true }).map(String).map(f => {
    try {
      return readFileSync(join(dir, f), 'utf8');
    } catch {
      return '';
    }
  }).join('\n');
}

/** Render the repo's rules file for a home holding `config` and the given blocks. */
function render(t, config, blocks = {}) {
  const h = tempDir(t, 'pact-retired-home-');
  mkdirSync(join(h, 'pact', 'blocks'), { recursive: true });
  writeFileSync(join(h, 'pact', 'config.json'), `${JSON.stringify(config)}\n`);
  for (const [rel, text] of Object.entries(blocks)) {
    const p = join(h, 'pact', 'blocks', ...rel.split('/'));
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, text);
  }
  const out = tempDir(t, 'pact-retired-out-');
  const r = spawnSync(process.execPath, [RENDER, SOURCE, out, h], { encoding: 'utf8', env: env() });
  return { code: r.status, stdout: r.stdout, all: `${r.stdout}${r.stderr}`, files: readAll(out) };
}

function renderProject(t, project) {
  const h = tempDir(t, 'pact-retired-home-');
  const p = tempDir(t, 'pact-retired-project-');
  mkdirSync(join(p, '.claude'));
  writeFileSync(join(p, '.claude', 'pact-config.json'), `${JSON.stringify(project)}\n`);
  const out = tempDir(t, 'pact-retired-out-');
  const r = spawnSync(process.execPath, [RENDER, 'project', out, h, p], { encoding: 'utf8', env: env() });
  return { code: r.status, stdout: r.stdout, all: `${r.stdout}${r.stderr}`, files: readAll(out) };
}

const edit = (mark, file) => ({ schema: 1, edits: [{ mark, op: 'replace', file }] });
const retiredLines = r => r.stdout.split('\n').filter(l => l.startsWith('RETIRED-NAME'));

// ------------------------------------------------------------ the agents key

test('bad case: an agents key naming the retired lens is refused with the retired message, and the model value is never printed', t => {
  const r = render(t, { schema: 1, agents: { [LENS]: { model: MODEL } } });
  assert.equal(r.code, 1, r.all);
  assert.equal(lastLine(r.stdout), 'RESULT: fail', r.all);
  assert.match(r.stdout, /^FAIL config-agents:/m, r.all);
  assert.match(r.stdout, /good-enough-lens was retired; remove its key from agents/, r.all);
  assert.ok(!r.all.includes(MODEL), 'a value set under the key was printed');
  assert.ok(!r.files.includes(MODEL), 'a value set under the key was written');
});

test('another unknown agent name keeps the generic message, which no longer lists the retired lens', t => {
  const r = render(t, { schema: 1, agents: { 'my-reviewer': { model: MODEL } } });
  assert.equal(r.code, 1, r.all);
  assert.match(r.stdout, /agents names an agent this configuration cannot set; only /, r.all);
  assert.doesNotMatch(r.stdout, /was retired/, r.all);
  assert.ok(!r.stdout.includes(LENS), 'the generic message still lists the retired lens');
});

test('the retired name is spelled exactly: a longer name that contains it gets the generic message', t => {
  const r = render(t, { schema: 1, agents: { [`${LENS}-two`]: { model: MODEL } } });
  assert.equal(r.code, 1, r.all);
  assert.match(r.stdout, /cannot set/, r.all);
  assert.doesNotMatch(r.stdout, /was retired/, r.all);
});

test('the install keeps no copy of the lens in its agent names, and the same retired list as the renderer', () => {
  assert.ok(!AGENT_NAMES.includes(LENS));
  const src = readFileSync(join(REPO, 'gate', 'render-core.mjs'), 'utf8');
  const m = /const RETIRED_AGENTS = Object\.freeze\((\[[^\]]*\])\)/.exec(src);
  assert.ok(m, 'the renderer has no RETIRED_AGENTS list');
  assert.deepEqual(JSON.parse(m[1].replace(/'/g, '"')), [...RETIRED_AGENTS]);
});

// ------------------------------------------------------------ an edit block

test('bad case: an edit block naming the retired lens draws a fixed RETIRED-NAME line, and the render still passes', t => {
  const block = `Design runs \`${LENS}\` ${SENTINEL} here.\n`;
  const r = render(t, edit('workflow', 'wf.md'), { 'wf.md': block });
  assert.equal(r.code, 0, r.all);
  assert.deepEqual(retiredLines(r), [`RETIRED-NAME block workflow ${LENS}`], r.all);
  assert.ok(!r.stdout.includes(SENTINEL), 'a block word reached the output lines');
  assert.equal(lastLine(r.stdout), 'RESULT: pass', r.all);
});

test('each edited part that names the lens draws its own line, in edit order', t => {
  const r = render(t, { schema: 1, edits: [{ mark: 'workflow', op: 'replace', file: 'a.md' }, { mark: 'lenses', op: 'replace', file: 'b.md' }] }, { 'a.md': `${LENS}\n`, 'b.md': `| \`${LENS}\` | asks |\n` });
  assert.equal(r.code, 0, r.all);
  assert.deepEqual(retiredLines(r), [`RETIRED-NAME block workflow ${LENS}`, `RETIRED-NAME block lenses ${LENS}`], r.all);
});

test('a clean block draws no line', t => {
  const r = render(t, edit('workflow', 'wf.md'), { 'wf.md': 'Design runs `executability-lens` and `unstated-lens`.\n' });
  assert.equal(r.code, 0, r.all);
  assert.deepEqual(retiredLines(r), [], r.all);
});

test('a block naming a longer name that contains the lens draws no line', t => {
  const text = [`${LENS}-two`, `my-${LENS}`, `${LENS}s`, `${LENS}_x`].join('\n');
  const r = render(t, edit('workflow', 'wf.md'), { 'wf.md': `${text}\n` });
  assert.equal(r.code, 0, r.all);
  assert.deepEqual(retiredLines(r), [], r.all);
});

test('a block with a control character beside the name is refused as text, and neither the character nor the sentinel is printed', t => {
  const r = render(t, edit('workflow', 'wf.md'), { 'wf.md': `${LENS} ${SENTINEL} \x07\n` });
  assert.equal(r.code, 1, r.all);
  assert.match(r.stdout, /^FAIL characters:/m, r.all);
  assert.deepEqual(retiredLines(r), [], r.all);
  assert.ok(!r.all.includes(SENTINEL) && !r.all.includes('\x07'), 'block text reached the output');
});

test('a configuration with no edit draws no line', t => {
  const r = render(t, { schema: 1, settings: { 'usage-pause': 90 } });
  assert.equal(r.code, 0, r.all);
  assert.deepEqual(retiredLines(r), [], r.all);
});

// ------------------------------------------------------------ a project qualities list

test('bad case: a project qualities list naming the retired lens draws a fixed line, and the render still passes', t => {
  const r = renderProject(t, { schema: 1, qualities: [{ quality: 'Speed', measure: SENTINEL, lenses: [`\`${LENS}\``, 'behaviour-lens'] }] });
  assert.equal(r.code, 0, r.all);
  assert.deepEqual(retiredLines(r), [`RETIRED-NAME qualities ${LENS}`], r.all);
  assert.ok(!r.stdout.includes(SENTINEL), 'a project value reached the output lines');
});

test('a project qualities list of live lenses, or of a longer name, draws no line', t => {
  const r = renderProject(t, { schema: 1, qualities: [{ quality: 'Speed', measure: '', lenses: ['behaviour-lens', `${LENS}-two`] }] });
  assert.equal(r.code, 0, r.all);
  assert.deepEqual(retiredLines(r), [], r.all);
});
