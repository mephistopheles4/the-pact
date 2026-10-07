// Agent settings (#97): a user file sets integrity-lens's model and effort.
// The renderer is driven through its command line, as the install script runs
// it; the install script end to end, against a throwaway repo and -ClaudeHome.
// Never touches ~/.claude. Expected agent bytes are built here from the
// repo's copy, never taken from the renderer.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { GATE, RENDER, REPO, lastLine, tempDir } from './helpers.mjs';
import { home, install, listTree, makeRepo, refused, WIN } from './install-harness.mjs';

const sha256 = b => createHash('sha256').update(b).digest('hex');
const AGENT = readFileSync(join(REPO, 'claude', 'agents', 'integrity-lens.md'), 'utf8');
const SOURCE = readFileSync(join(REPO, 'claude', 'CLAUDE.md'));

/** The repo's integrity-lens file with its model and effort lines set. */
const withAgent = (model, effort) => AGENT.replace(/^model: .*$/m, `model: ${model}`).replace(/^effort: .*$/m, `effort: ${effort}`);

/**
 * Run the renderer on a staged-like source folder: claude/CLAUDE.md, and
 * claude/agents/integrity-lens.md holding `agent` (or none when null), with a
 * user file holding `config`. `renderer` defaults to the repo's.
 */
function render(t, config, { agent = AGENT, renderer = RENDER, noConfig = false } = {}) {
  const stage = tempDir(t, 'pact-agents-stage-');
  mkdirSync(join(stage, 'claude', 'agents'), { recursive: true });
  writeFileSync(join(stage, 'claude', 'CLAUDE.md'), SOURCE);
  if (agent !== null) {
    if (typeof agent === 'function') agent(join(stage, 'claude', 'agents', 'integrity-lens.md'));
    else writeFileSync(join(stage, 'claude', 'agents', 'integrity-lens.md'), agent);
  }
  const h = tempDir(t, 'pact-agents-home-');
  if (!noConfig) {
    mkdirSync(join(h, 'pact'), { recursive: true });
    writeFileSync(join(h, 'pact', 'config.json'), typeof config === 'string' ? config : `${JSON.stringify(config)}\n`);
  }
  const out = tempDir(t, 'pact-agents-out-');
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  const r = spawnSync(process.execPath, [renderer, join(stage, 'claude', 'CLAUDE.md'), out, h], { encoding: 'utf8', env });
  const outFiles = readdirSync(out).sort();
  const agentOut = join(out, 'agent-integrity-lens.md');
  return { code: r.status, stdout: r.stdout, out: r.stdout + r.stderr, outFiles, agentBytes: existsSync(agentOut) ? readFileSync(agentOut) : null, rules: existsSync(join(out, 'CLAUDE.md')) ? readFileSync(join(out, 'CLAUDE.md'), 'utf8') : null };
}

function refusedWith(r, rule, reason) {
  assert.equal(r.code, 1, r.out);
  assert.equal(lastLine(r.stdout), 'RESULT: fail', r.out);
  assert.match(r.stdout, new RegExp(`^FAIL ${rule}: .*${reason ? reason.source : ''}`, 'm'), r.out);
  assert.deepEqual(r.outFiles, [], 'a refused render left output files');
}

const cfg = agents => ({ schema: 1, agents });

// ------------------------------------------------------------ the renderer: what renders

test('integrity-lens set to sonnet and low renders: only its model and effort lines change, the AGENT line names its hash, and the notice says so', t => {
  const r = render(t, cfg({ 'integrity-lens': { model: 'sonnet', effort: 'low' } }));
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(r.outFiles, ['CLAUDE.md', 'agent-integrity-lens.md', 'config.diff']);
  const want = Buffer.from(withAgent('sonnet', 'low'));
  assert.deepEqual(r.agentBytes, want);
  assert.match(r.stdout, new RegExp(`^AGENT integrity-lens sonnet low ${sha256(want)}$`, 'm'));
  assert.match(r.rules, /^Agents set: integrity-lens \(sonnet, low effort\)\.$/m);
  // Every byte outside the two lines is the committed file's.
  const a = AGENT.split('\n');
  const b = want.toString('utf8').split('\n');
  assert.equal(a.length, b.length);
  assert.deepEqual(a.map((l, i) => (l === b[i] ? null : i)).filter(i => i !== null).map(i => a[i].split(':')[0]), ['model', 'effort']);
});

test('an unset field keeps the file\'s value, printed as its allow-list constant', t => {
  const r = render(t, cfg({ 'integrity-lens': { model: 'sonnet' } }));
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^AGENT integrity-lens sonnet medium [0-9a-f]{64}$/m);
  assert.deepEqual(r.agentBytes, Buffer.from(withAgent('sonnet', 'medium')));
});

test('with no agents key, no agent file is read: a stage with none renders, and no AGENT line is printed', t => {
  const r = render(t, { schema: 1, settings: { 'usage-pause': 90 } }, { agent: null });
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.stdout, /^AGENT /m);
  assert.deepEqual(r.outFiles, ['CLAUDE.md', 'config.diff']);
  assert.doesNotMatch(r.rules, /Agents set/);
  const none = render(t, null, { agent: null, noConfig: true });
  assert.equal(none.code, 0, none.out);
});

// ------------------------------------------------------------ the renderer: the configuration's refusals

const BAD_CONFIGS = [
  ['an unknown agent', cfg({ 'my-reviewer': { model: 'sonnet' } }), /cannot set/],
  ...['behaviour-lens', 'executability-lens', 'good-enough-lens', 'security-reviewer', 'unstated-lens', 'scout'].map(a => [`the locked agent ${a}`, cfg({ [a]: { model: 'sonnet' } }), new RegExp(`${a} is locked`)]),
  ['an entry that is a string', cfg({ 'integrity-lens': 'sonnet' }), /must be an object/],
  ['an entry that is a list', cfg({ 'integrity-lens': [] }), /must be an object/],
  ['an entry that is null', cfg({ 'integrity-lens': null }), /must be an object/],
  ['an empty agents object', cfg({}), /at least one agent/],
  ['agents that is not an object', cfg('x'), /at least one agent/],
  ['an empty entry', cfg({ 'integrity-lens': {} }), /must be an object/],
  ['an unknown field', cfg({ 'integrity-lens': { model: 'sonnet', tools: 'Bash' } }), /must be an object/],
  ['a field in capitals', cfg({ 'integrity-lens': { Model: 'sonnet' } }), /must be an object/],
  ['the agent name in capitals', cfg({ 'Integrity-Lens': { model: 'sonnet' } }), /cannot set/],
  ['a model in capitals', cfg({ 'integrity-lens': { model: 'Sonnet' } }), /model must be one of/],
  ['a model in upper case', cfg({ 'integrity-lens': { model: 'OPUS' } }), /model must be one of/],
  ['an effort in capitals', cfg({ 'integrity-lens': { effort: 'High' } }), /effort must be one of/],
  ['haiku', cfg({ 'integrity-lens': { model: 'haiku' } }), /model must be one of/],
  ['inherit', cfg({ 'integrity-lens': { model: 'inherit' } }), /model must be one of/],
  ['a full model id', cfg({ 'integrity-lens': { model: 'claude-opus-5-5' } }), /model must be one of/],
  ['a trailing space', cfg({ 'integrity-lens': { model: 'sonnet ' } }), /model must be one of/],
  ['xhigh', cfg({ 'integrity-lens': { effort: 'xhigh' } }), /effort must be one of/],
  ['max', cfg({ 'integrity-lens': { effort: 'max' } }), /effort must be one of/],
  ['a model that is a number', cfg({ 'integrity-lens': { model: 4 } }), /model must be one of/],
  ['a model that is null', cfg({ 'integrity-lens': { model: null } }), /model must be one of/],
  ['an effort that is a list', cfg({ 'integrity-lens': { effort: ['low'] } }), /effort must be one of/],
  ['an effort that is an object', cfg({ 'integrity-lens': { effort: { v: 'low' } } }), /effort must be one of/],
  ['a value holding a newline and frontmatter', cfg({ 'integrity-lens': { model: 'sonnet\ntools: [Bash]' } }), /model must be one of/],
  ['__proto__ as the agent', '{ "schema": 1, "agents": { "__proto__": { "model": "sonnet" } } }\n', null],
  ['constructor as the agent', cfg({ constructor: { model: 'sonnet' } }), /cannot set/],
  ['__proto__ as the field', '{ "schema": 1, "agents": { "integrity-lens": { "__proto__": "sonnet" } } }\n', null],
  ['constructor as the field', cfg({ 'integrity-lens': { constructor: 'sonnet' } }), /must be an object/],
];

for (const [name, config, reason] of BAD_CONFIGS) {
  test(`bad case: ${name} is refused`, t => {
    const r = render(t, config);
    refusedWith(r, reason ? 'config-agents' : 'config-(?:agents|json)', reason);
    assert.ok(!r.stdout.includes('tools: [Bash]'), 'a refused value was printed');
  });
}

// ------------------------------------------------------------ the renderer: the agent file's refusals

const BAD_AGENT_FILES = [
  ['a missing agent file', null, /the file is missing/],
  ['no model line', AGENT.replace(/^model: .*\n/m, ''), /exactly one model line/],
  ['two effort lines', AGENT.replace(/^effort: .*$/m, 'effort: medium\neffort: low'), /exactly one effort line/],
  ['no frontmatter', AGENT.replace(/^---\n/, ''), /no frontmatter/],
  ['frontmatter that never closes', AGENT.replace(/\n---\n/, '\n'), /never closes/],
  ['a model line only in the body', AGENT.replace(/^model: .*\n/m, '').replace('# integrity-lens', 'model: opus\n\n# integrity-lens'), /exactly one model line/],
  ['a model line only as an indented child', AGENT.replace(/^model: .*$/m, 'notes:\n  model: opus'), /exactly one model line/],
  ['a metadata (seal) key', AGENT.replace(/^effort: .*$/m, '$&\nmetadata:\n  contract-version: 1'), /sealed agent cannot be configured/],
  ['a tool gained', AGENT.replace('tools: [Read, Glob, Grep]', 'tools: [Read, Glob, Grep, Bash]'), /default read tools/],
  ['the file\'s own effort off the list', AGENT.replace(/^effort: .*$/m, 'effort: max'), /effort line is not one of/],
  ['CRLF line endings', AGENT.replace(/\n/g, '\r\n'), /carriage return/],
  ['a folder in place of the file', p => mkdirSync(p), /not a regular file/],
  ['a file over 1 MiB', `${AGENT}${'x'.repeat(1024 * 1024)}\n`, /larger than its cap/],
];

for (const [name, agent, reason] of BAD_AGENT_FILES) {
  test(`bad case: ${name} is refused, with a setting given`, t => {
    const r = render(t, cfg({ 'integrity-lens': { model: 'sonnet' } }), { agent });
    assert.equal(r.code, 1, r.out);
    assert.match(r.stdout, reason, r.out);
    assert.deepEqual(r.outFiles, []);
  });
}

test('bad case: an agent file that is a link is refused', { skip: WIN && 'not run: planting a symbolic link needs privileges on Windows' }, t => {
  const target = join(tempDir(t, 'pact-agents-target-'), 'real.md');
  writeFileSync(target, AGENT);
  const r = render(t, cfg({ 'integrity-lens': { model: 'sonnet' } }), { agent: p => symlinkSync(target, p) });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stdout, /not a regular file/);
});

test('bad case: an agent with an entry in the tool allow-list is refused', t => {
  const gate = tempDir(t, 'pact-agents-gate-');
  for (const f of ['render.mjs', 'shared.mjs']) cpSync(join(GATE, f), join(gate, f));
  const allow = JSON.parse(readFileSync(join(GATE, 'tool-allowlist.json'), 'utf8'));
  writeFileSync(join(gate, 'tool-allowlist.json'), `${JSON.stringify({ ...allow, 'integrity-lens': ['Read', 'Glob', 'Grep'] })}\n`);
  const r = render(t, cfg({ 'integrity-lens': { model: 'sonnet' } }), { renderer: join(gate, 'render.mjs') });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stdout, /entry in the tool allow-list/);
  // Control: the same copied renderer with the real allow-list renders.
  writeFileSync(join(gate, 'tool-allowlist.json'), `${JSON.stringify(allow)}\n`);
  assert.equal(render(t, cfg({ 'integrity-lens': { model: 'sonnet' } }), { renderer: join(gate, 'render.mjs') }).code, 0);
});

test('bad case: a renderer whose locked list loses an agent still cannot set it: the agent stays outside the configurable list', t => {
  const gate = tempDir(t, 'pact-agents-gate-');
  for (const f of ['render.mjs', 'shared.mjs', 'tool-allowlist.json']) cpSync(join(GATE, f), join(gate, f));
  const p = join(gate, 'render.mjs');
  const s = readFileSync(p, 'utf8');
  writeFileSync(p, s.replace("'security-reviewer', ", ''));
  const r = render(t, cfg({ 'security-reviewer': { model: 'sonnet' } }), { renderer: p });
  refusedWith(r, 'config-agents', /cannot set/);
});

// ------------------------------------------------------------ the install script, end to end

function configure(h, config) {
  mkdirSync(join(h, 'pact'), { recursive: true });
  writeFileSync(join(h, 'pact', 'config.json'), `${JSON.stringify(config)}\n`);
}

function dryRunHash(r) {
  const m = /^ {2}rendered rules file: sha256 ([0-9a-f]{64})\r?$/m.exec(r.stdout);
  assert.ok(m, r.out);
  return m[1];
}

test('a configured install writes the rendered integrity-lens, records its hash, and removing the setting puts the committed file back', t => {
  const repo = makeRepo(t);
  const h = home(t);
  configure(h, { schema: 1, agents: { 'integrity-lens': { model: 'sonnet', effort: 'low' } } });
  const dry = install(repo, h);
  assert.equal(dry.code, 0, dry.out);
  assert.match(dry.stdout, /^ {2}WARN: the user configuration sets integrity-lens to sonnet, low effort\.\r?$/m, dry.out);
  assert.match(dry.stdout, /^seam-a\| RESULT: pass\r?$/m, dry.out);
  const r = install(repo, h, { apply: true, extra: ['-RenderedHash', dryRunHash(dry)] });
  assert.equal(r.code, 0, r.out);
  const want = Buffer.from(withAgent('sonnet', 'low'));
  assert.deepEqual(readFileSync(join(h, 'agents', 'integrity-lens.md')), want);
  const manifest = JSON.parse(readFileSync(join(h, '.pact-install.json'), 'utf8'));
  assert.equal(manifest.files.find(f => f.path === 'agents/integrity-lens.md').sha256, sha256(want));
  assert.match(readFileSync(join(h, 'CLAUDE.md'), 'utf8'), /^Agents set: integrity-lens \(sonnet, low effort\)\.$/m);
  const again = install(repo, h);
  assert.match(again.stdout, /^Nothing to do\.\r?$/m, again.out);

  // Removing the setting: the next install overwrites the live file with the committed bytes, with no drift.
  configure(h, { schema: 1, settings: { 'usage-pause': 90 } });
  const dry2 = install(repo, h);
  assert.equal(dry2.code, 0, dry2.out);
  assert.match(dry2.stdout, /^Drift: 0\r?$/m, dry2.out);
  const r2 = install(repo, h, { apply: true, extra: ['-RenderedHash', dryRunHash(dry2)] });
  assert.equal(r2.code, 0, r2.out);
  assert.deepEqual(readFileSync(join(h, 'agents', 'integrity-lens.md')), readFileSync(join(repo, 'claude', 'agents', 'integrity-lens.md')));
});

test('bad case: an agent setting changed between the dry run and -Apply refuses by the rendered hash', t => {
  const repo = makeRepo(t);
  const h = home(t);
  configure(h, { schema: 1, agents: { 'integrity-lens': { model: 'sonnet' } } });
  const hash = dryRunHash(install(repo, h));
  configure(h, { schema: 1, agents: { 'integrity-lens': { model: 'opus', effort: 'low' } } });
  const r = install(repo, h, { apply: true, extra: ['-RenderedHash', hash] });
  refused(r);
  assert.match(r.stdout, /^REFUSED: the hash given with -RenderedHash is not the full hash/m, r.out);
  assert.ok(!existsSync(join(h, 'agents')), 'the refused install wrote agents');
});

// ------------------------------------------------------------ the install script: a renderer that lies

const R_PUSH = '  report.lines.push(`RENDERED ${sha256(rendered)}`, `DIFF ${sha256(diff)}`, ...head);';
const R_AGENT_PUSH = '  for (const a of agents) report.lines.push(`AGENT ${a.name} ${a.model} ${a.effort} ${sha256(a.buf)}`);';
const R_AGENT_WRITE = "  for (const a of agents) writeFileSync(join(out, `${AGENT_OUTPUT_PREFIX}${a.name}.md`), a.buf, { flag: 'wx' });";
const R_DIFF_WRITE = "  writeFileSync(join(out, DIFF_NAME), diff, { flag: 'wx' });";
const A64 = 'a'.repeat(64);

function plantRenderer(root, from, to) {
  const p = join(root, 'gate', 'render.mjs');
  const s = readFileSync(p, 'utf8');
  assert.equal(s.split(from).length, 2, `expected exactly one ${JSON.stringify(from)}`);
  writeFileSync(p, s.replace(from, () => to));
}

const SET = { schema: 1, agents: { 'integrity-lens': { model: 'sonnet', effort: 'low' } } };

for (const [label, config, from, to, why] of [
  ['an AGENT line with no configuration', null, R_PUSH, `${R_PUSH}\n  report.lines.push('AGENT integrity-lens sonnet low ${A64}');`, 'the renderer reported a digest, a value, an edit or an agent setting with no configuration'],
  ['an AGENT line for another agent', SET, R_AGENT_PUSH, "  report.lines.push(`AGENT behaviour-lens sonnet low ${sha256(agents[0].buf)}`);", 'the renderer printed a line the install does not read'],
  ['an AGENT line with a value off the pattern', SET, R_AGENT_PUSH, "  report.lines.push(`AGENT integrity-lens haiku low ${sha256(agents[0].buf)}`);", 'the renderer printed a line the install does not read'],
  ['the AGENT line twice', SET, R_AGENT_PUSH, `${R_AGENT_PUSH}\n${R_AGENT_PUSH}`, 'the renderer reported the agent setting twice'],
  ['an agent file hash other than its own', SET, R_AGENT_PUSH, `  report.lines.push('AGENT integrity-lens sonnet low ${A64}');`, "the rendered agent file's hash does not match the one the renderer reported"],
  ['an AGENT line with no agent file', SET, R_AGENT_WRITE, '', 'the renderer did not leave exactly its rules file of at most 1 MiB, its diff, and an agent file only for an agent setting it reported'],
  ['an agent file with no AGENT line', SET, R_AGENT_PUSH, '', 'the renderer did not leave exactly its rules file of at most 1 MiB, its diff, and an agent file only for an agent setting it reported'],
  ['a third file under another name', null, R_DIFF_WRITE, `${R_DIFF_WRITE}\n  writeFileSync(join(out, 'agent-behaviour-lens.md'), 'x');`, 'the renderer did not leave exactly its rules file of at most 1 MiB, its diff, and an agent file only for an agent setting it reported'],
  ['an agent file changed beyond its two lines', SET, R_AGENT_WRITE, "  for (const a of agents) { a.buf = Buffer.from(a.buf.toString('utf8').replace('tools: [Read, Glob, Grep]', 'tools: [Read, Glob, Grep, Bash]')); writeFileSync(join(out, `${AGENT_OUTPUT_PREFIX}${a.name}.md`), a.buf, { flag: 'wx' }); }", 'the rendered agent file differs from the committed one beyond its model and effort lines'],
  ['an agent written into the stage', SET, R_AGENT_WRITE, `${R_AGENT_WRITE}\n  for (const a of agents) writeFileSync(join(dirname(source), 'agents', 'integrity-lens.md'), a.buf);`, 'the renderer changed the stage'],
]) {
  test(`bad case: a renderer that reports ${label} refuses, and nothing is installed`, t => {
    const repo = makeRepo(t, root => plantRenderer(root, from, to));
    const h = home(t);
    if (config) configure(h, config);
    const r = install(repo, h, { apply: true, extra: config ? ['-RenderedHash', A64] : [] });
    refused(r);
    assert.match(r.stdout, /^render\| RESULT: pass\r?$/m, r.out);
    assert.match(r.stdout, new RegExp(`^REFUSED: ${why.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.`, 'm'), r.out);
    assert.ok(!listTree(h).some(f => f === 'CLAUDE.md' || f === '.pact-install.json' || f.startsWith('agents')), listTree(h).join('\n'));
  });
}

test('bad case: a configuration setting integrity-lens on a commit with no integrity-lens file refuses', t => {
  // A planted renderer that does not read the file, so only the install's own check stands.
  const repo = makeRepo(t, root => {
    plantRenderer(root, '    agents = checked.agents.map(a => renderAgent(source, a, report));', "    agents = checked.agents.map(a => ({ name: a.name, model: 'sonnet', effort: 'low', buf: Buffer.from('x') }));");
    rmSync(join(root, 'claude', 'agents', 'integrity-lens.md'));
  });
  const h = home(t);
  configure(h, SET);
  const r = install(repo, h, { apply: true, extra: ['-RenderedHash', A64] });
  refused(r);
  assert.match(r.stdout, /^REFUSED: the configuration sets integrity-lens, but the commit holds no claude\/agents\/integrity-lens\.md\./m, r.out);
});
