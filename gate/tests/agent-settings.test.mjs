// Agent settings (#97): a user file sets any pact lens's model and effort.
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
import { OLD_REVIEWERS } from '../pact-text.mjs';

const sha256 = b => createHash('sha256').update(b).digest('hex');
const AGENT = readFileSync(join(REPO, 'claude', 'agents', 'integrity-lens.md'), 'utf8');
const SOURCE = readFileSync(join(REPO, 'claude', 'CLAUDE.md'));

/** The repo's integrity-lens file with its model and effort lines set. */
const withAgent = (model, effort) => AGENT.replace(/^model: .*$/m, `model: ${model}`).replace(/^effort: .*$/m, `effort: ${effort}`);

const AGENTS_DIR = join(REPO, 'claude', 'agents');
const PACT_AGENTS = readdirSync(AGENTS_DIR).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3)).sort();

/**
 * Run the renderer on a staged-like source folder: claude/CLAUDE.md, every
 * repo agent file, and claude/agents/<name>.md (integrity-lens by default)
 * holding `agent` (or none when null), with a user file holding `config`.
 * `renderer` defaults to the repo's.
 */
function render(t, config, { agent = AGENT, name = 'integrity-lens', renderer = RENDER, noConfig = false, source = SOURCE } = {}) {
  const stage = tempDir(t, 'pact-agents-stage-');
  mkdirSync(join(stage, 'claude', 'agents'), { recursive: true });
  writeFileSync(join(stage, 'claude', 'CLAUDE.md'), source);
  for (const a of PACT_AGENTS) if (a !== name) cpSync(join(AGENTS_DIR, `${a}.md`), join(stage, 'claude', 'agents', `${a}.md`));
  if (agent !== null) {
    if (typeof agent === 'function') agent(join(stage, 'claude', 'agents', `${name}.md`));
    else writeFileSync(join(stage, 'claude', 'agents', `${name}.md`), agent);
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
  const agentOut = join(out, `agent-${name}.md`);
  return { code: r.status, stdout: r.stdout, out: r.stdout + r.stderr, outFiles, agentBytes: existsSync(agentOut) ? readFileSync(agentOut) : null, rules: existsSync(join(out, 'CLAUDE.md')) ? readFileSync(join(out, 'CLAUDE.md'), 'utf8') : null };
}

function refusedWith(r, rule, reason) {
  assert.equal(r.code, 1, r.out);
  assert.equal(lastLine(r.stdout), 'RESULT: fail', r.out);
  assert.match(r.stdout, new RegExp(`^FAIL ${rule}: .*${reason ? reason.source : ''}`, 'm'), r.out);
  assert.deepEqual(r.outFiles, [], 'a refused render left output files');
}

const cfg = agents => ({ schema: 1, agents });

/** The rendered notice: its lines from "Configuration in effect" up to the next empty line. */
function notice(rules) {
  const lines = rules.split('\n');
  const i = lines.findIndex(l => l.startsWith('**Configuration in effect.**'));
  assert.ok(i >= 0, 'no configuration notice');
  let j = i;
  while (j < lines.length && lines[j] !== '') j += 1;
  const n = lines.slice(i, j).join('\n');
  // The helper must reach the agents line, or a doesNotMatch on it proves nothing.
  assert.match(n, /^Agents set: /m, 'the notice read stops before its agents line');
  return n;
}

// ------------------------------------------------------------ the renderer: what renders

test('integrity-lens set to sonnet and low renders: only its model and effort lines change, the AGENT line names its hash, and the notice says so', t => {
  const r = render(t, cfg({ 'integrity-lens': { model: 'sonnet', effort: 'low' } }));
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(r.outFiles, ['CLAUDE.md', 'agent-integrity-lens.md', 'config.diff']);
  const want = Buffer.from(withAgent('sonnet', 'low'));
  assert.deepEqual(r.agentBytes, want);
  assert.match(r.stdout, new RegExp(`^AGENT integrity-lens sonnet low ${sha256(want)} plain override local$`, 'm'));
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
  assert.match(r.stdout, /^AGENT integrity-lens sonnet medium [0-9a-f]{64} plain override local$/m);
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
  ['the sealed agent scout', cfg({ scout: { model: 'opus' } }), /scout is locked: it is sealed/],
  // Every retired reviewer, from the roster's own list: an old configuration fails loudly.
  ...OLD_REVIEWERS.map(a => [`the retired reviewer ${a}`, cfg({ [a]: { model: 'sonnet' } }), /cannot set/]),
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

  ['the file\'s own effort off the list', AGENT.replace(/^effort: .*$/m, 'effort: max'), /effort line is not one of/],
  ['CRLF line endings', AGENT.replace(/\n/g, '\r\n'), /carriage return/],
  ['a folder in place of the file', p => mkdirSync(p), /not a regular file/],
  ['a file over 1 MiB', `${AGENT}${'x'.repeat(1024 * 1024)}\n`, /larger than its cap/],
  ['two model lines', AGENT.replace(/^model: .*$/m, 'model: opus\nmodel: opus'), /exactly one model line/],
  ['no effort line', AGENT.replace(/^effort: .*\n/m, ''), /exactly one effort line/],
  ['the file\'s own model off the list', AGENT.replace(/^model: .*$/m, 'model: haiku'), /model line is not one of/],
  ['a second tools line after the default one', AGENT.replace('tools: [Read, Glob, Grep]', 'tools: [Read, Glob, Grep]\ntools: [Bash]'), /exactly one tools line/],
  ['no tools line', AGENT.replace(/^tools: .*\n/m, ''), /exactly one tools line/],
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

// ------------------------------------------------------------ the renderer: security-set lenses

/** The AGENT line's three words for `name` set to sonnet, or the refusal. */
function classify(t, name, opts = {}) {
  const file = opts.agent ?? readFileSync(join(AGENTS_DIR, `${name}.md`), 'utf8');
  const r = render(t, cfg({ [name]: { model: 'sonnet', effort: 'low' } }), { ...opts, name, agent: file });
  assert.equal(r.code, 0, r.out);
  const m = new RegExp(`^AGENT ${name} sonnet low [0-9a-f]{64} (\\S+) (\\S+) (\\S+)$`, 'm').exec(r.stdout);
  assert.ok(m, r.out);
  return { words: m.slice(1).join(' '), r };
}

test('every pact lens can be set, and the security-set ones are exactly the six the spec names; only the shell and web lenses are egress', t => {
  assert.deepEqual(PACT_AGENTS, ['adversarial-lens', 'behaviour-lens', 'data-lens', 'executability-lens', 'good-enough-lens', 'integrity-lens', 'unstated-lens']);
  const got = Object.fromEntries(PACT_AGENTS.map(a => [a, classify(t, a).words]));
  assert.deepEqual(got, {
    'adversarial-lens': 'security-set override egress',
    'behaviour-lens': 'security-set override egress',
    'data-lens': 'security-set override local',
    'executability-lens': 'security-set override local',
    'good-enough-lens': 'security-set override local',
    'integrity-lens': 'plain override local',
    'unstated-lens': 'security-set override local',
  });
});

test('a lens set to its own values is not an override: no mark, and the AGENT line says default', t => {
  const r = render(t, cfg({ 'data-lens': { model: 'opus', effort: 'high' } }), { name: 'data-lens', agent: readFileSync(join(AGENTS_DIR, 'data-lens.md'), 'utf8') });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^AGENT data-lens opus high [0-9a-f]{64} security-set default local$/m);
  assert.match(r.rules, /^Agents set: data-lens \(opus, high effort\)\.$/m);
  assert.doesNotMatch(notice(r.rules), /override, not security-tested/);
});

test('a security-set override carries its own mark in the notice, and the sentence that carries it to every posted report; a plain one does not', t => {
  const r = render(t, cfg({ 'data-lens': { model: 'sonnet' }, 'integrity-lens': { effort: 'low' } }), { name: 'data-lens', agent: readFileSync(join(AGENTS_DIR, 'data-lens.md'), 'utf8') });
  assert.equal(r.code, 0, r.out);
  assert.match(r.rules, /^Agents set: data-lens \(sonnet, high effort; override, not security-tested\), integrity-lens \(opus, low effort\)\.$/m);
  assert.match(r.rules, /^Put "override, not security-tested" beside every report you post from these lenses, and in their rows of the Lens dispositions table: data-lens\.$/m);
  // The cross script's "not verified" keeps its one meaning.
  assert.doesNotMatch(notice(r.rules), /not verified/);
});

test('bad case: each sign alone marks integrity-lens security-set; with none it stays plain', t => {
  assert.equal(classify(t, 'integrity-lens').words, 'plain override local');
  // A tool beyond the read tools: security-set, and egress.
  assert.equal(classify(t, 'integrity-lens', { agent: AGENT.replace('tools: [Read, Glob, Grep]', 'tools: [Read, Glob, Grep, Bash]') }).words, 'security-set override egress');
  // The security-route clause names it.
  const src = SOURCE.toString('utf8');
  const route = src.replace(/(<!-- pact:begin security-route -->\n)/, '$1   The QA pair includes `integrity-lens` here.\n');
  assert.notEqual(route, src);
  assert.equal(classify(t, 'integrity-lens', { source: route }).words, 'security-set override local');
  // Its own file carries a risk-floor block.
  const floor = AGENT.replace('# integrity-lens', '<!-- pact:begin risk-floor -->\nThe risk floor.\n<!-- pact:end risk-floor -->\n\n# integrity-lens');
  assert.notEqual(floor, AGENT);
  assert.equal(classify(t, 'integrity-lens', { agent: floor }).words, 'security-set override local');
  // An entry in the tool allow-list.
  const gate = tempDir(t, 'pact-agents-gate-');
  for (const f of ['render.mjs', 'shared.mjs']) cpSync(join(GATE, f), join(gate, f));
  const allow = JSON.parse(readFileSync(join(GATE, 'tool-allowlist.json'), 'utf8'));
  writeFileSync(join(gate, 'tool-allowlist.json'), `${JSON.stringify({ ...allow, 'integrity-lens': ['Read', 'Glob', 'Grep'] })}\n`);
  assert.equal(classify(t, 'integrity-lens', { renderer: join(gate, 'render.mjs') }).words, 'security-set override local');
  // On the doubt list.
  writeFileSync(join(gate, 'tool-allowlist.json'), `${JSON.stringify(allow)}\n`);
  const p = join(gate, 'render.mjs');
  const s = readFileSync(p, 'utf8');
  const doubt = "  'unstated-lens': 'it reports work that should have taken the security route',";
  assert.equal(s.split(doubt).length, 2);
  writeFileSync(p, s.replace(doubt, `${doubt}\n  'integrity-lens': 'planted',`));
  assert.equal(classify(t, 'integrity-lens', { renderer: p }).words, 'security-set override local');
});

test('bad case: a renderer whose output would change another line refuses by its own self-check', t => {
  const gate = tempDir(t, 'pact-agents-gate-');
  for (const f of ['render.mjs', 'shared.mjs', 'tool-allowlist.json']) cpSync(join(GATE, f), join(gate, f));
  const p = join(gate, 'render.mjs');
  const s = readFileSync(p, 'utf8');
  const from = '  out[effortAt[0]] = `effort: ${effort}`;';
  assert.equal(s.split(from).length, 2);
  writeFileSync(p, s.replace(from, `${from}\n  out[toolsAt[0]] = 'tools: [Read, Glob, Grep, Bash]';`));
  const r = render(t, cfg({ 'integrity-lens': { model: 'sonnet' } }), { renderer: p });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stdout, /would differ from the source beyond its model and effort lines/);
  assert.deepEqual(r.outFiles, []);
});

test('bad case: a source with no security-route clause refuses a setting', t => {
  const src = SOURCE.toString('utf8').replace('<!-- pact:begin security-route -->', '<!-- pact:begin security-rout -->');
  const r = render(t, cfg({ 'integrity-lens': { model: 'sonnet' } }), { source: src });
  assert.equal(r.code, 1, r.out);
  assert.deepEqual(r.outFiles, []);
});

test('bad case: a renderer whose locked list loses scout still cannot set it: scout stays outside the configurable list', t => {
  const gate = tempDir(t, 'pact-agents-gate-');
  for (const f of ['render.mjs', 'shared.mjs', 'tool-allowlist.json']) cpSync(join(GATE, f), join(gate, f));
  const p = join(gate, 'render.mjs');
  const s = readFileSync(p, 'utf8');
  const from = "const LOCKED_AGENTS = Object.freeze(['scout']);";
  assert.equal(s.split(from).length, 2);
  writeFileSync(p, s.replace(from, 'const LOCKED_AGENTS = Object.freeze([]);'));
  const r = render(t, cfg({ scout: { model: 'opus' } }), { renderer: p });
  refusedWith(r, 'config-agents', /cannot set/);
});

test('the install script\'s list of agents equals the renderer\'s configurable list', () => {
  const r = /const CONFIGURABLE_AGENTS = Object\.freeze\(\[([^\]]*)\]\);/.exec(readFileSync(RENDER, 'utf8'));
  const i = /^\$agentNames = @\(([^)]*)\)$/m.exec(readFileSync(join(REPO, 'scripts', 'install.ps1'), 'utf8'));
  assert.ok(r && i);
  const names = s => s.split(',').map(x => x.trim().replace(/^'|'$/g, ''));
  assert.deepEqual(names(i[1]), names(r[1]));
  assert.deepEqual(names(r[1]), PACT_AGENTS);
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

test('a configured install sets a security-set lens and a shell lens: each WARN names the override, the shell lens names its egress risk, and both files install', t => {
  const repo = makeRepo(t);
  const h = home(t);
  configure(h, { schema: 1, agents: { 'behaviour-lens': { model: 'sonnet' }, 'data-lens': { effort: 'medium' }, 'integrity-lens': { effort: 'high' } } });
  const dry = install(repo, h);
  assert.equal(dry.code, 0, dry.out);
  const over = name => `${name} is a security-set lens, so this is an override, not security-tested: its security set ran only on its default\\.`;
  const egress = ' On a weaker setting it may follow instructions planted in the code it reviews, or send a secret out through a command, a browser address or a search query\\.';
  assert.match(dry.stdout, new RegExp(`^ {2}WARN: the user configuration sets behaviour-lens to sonnet, medium effort\\. ${over('behaviour-lens')}${egress}\\r?$`, 'm'), dry.out);
  assert.match(dry.stdout, new RegExp(`^ {2}WARN: the user configuration sets data-lens to opus, medium effort\\. ${over('data-lens')}\\r?$`, 'm'), dry.out);
  assert.match(dry.stdout, /^ {2}WARN: the user configuration sets integrity-lens to opus, high effort\.\r?$/m, dry.out);
  const r = install(repo, h, { apply: true, extra: ['-RenderedHash', dryRunHash(dry)] });
  assert.equal(r.code, 0, r.out);
  const set = (name, model, effort) => Buffer.from(readFileSync(join(repo, 'claude', 'agents', `${name}.md`), 'utf8').replace(/^model: .*$/m, `model: ${model}`).replace(/^effort: .*$/m, `effort: ${effort}`));
  assert.deepEqual(readFileSync(join(h, 'agents', 'behaviour-lens.md')), set('behaviour-lens', 'sonnet', 'medium'));
  assert.deepEqual(readFileSync(join(h, 'agents', 'data-lens.md')), set('data-lens', 'opus', 'medium'));
  const rules = readFileSync(join(h, 'CLAUDE.md'), 'utf8');
  assert.match(rules, /^Agents set: behaviour-lens \(sonnet, medium effort; override, not security-tested\), data-lens \(opus, medium effort; override, not security-tested\), integrity-lens \(opus, high effort\)\.$/m);
  assert.match(rules, /^Put "override, not security-tested" beside every report you post from these lenses, and in their rows of the Lens dispositions table: behaviour-lens, data-lens\.$/m);
  // Rollback: with the agents key gone, the next install puts back the committed files.
  configure(h, { schema: 1 });
  const dry2 = install(repo, h);
  assert.equal(dry2.code, 0, dry2.out);
  const r2 = install(repo, h, { apply: true, extra: ['-RenderedHash', dryRunHash(dry2)] });
  assert.equal(r2.code, 0, r2.out);
  for (const a of ['behaviour-lens', 'data-lens', 'integrity-lens']) assert.deepEqual(readFileSync(join(h, 'agents', `${a}.md`)), readFileSync(join(repo, 'claude', 'agents', `${a}.md`)));
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
const R_AGENT_PUSH = "  for (const a of agents) report.lines.push(`AGENT ${a.name} ${a.model} ${a.effort} ${sha256(a.buf)} ${a.security ? 'security-set' : 'plain'} ${a.override ? 'override' : 'default'} ${a.egress ? 'egress' : 'local'}`);";
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
  ['an AGENT line with no configuration', null, R_PUSH, `${R_PUSH}\n  report.lines.push('AGENT integrity-lens sonnet low ${A64} plain override local');`, 'the renderer reported a digest, a value, an edit or an agent setting with no configuration'],
  ['an AGENT line for an agent off the list', SET, R_AGENT_PUSH, "  report.lines.push(`AGENT scout sonnet low ${sha256(agents[0].buf)} plain override local`);", 'the renderer printed a line the install does not read'],
  ['an AGENT line whose name differs only in case', SET, R_AGENT_PUSH, "  report.lines.push(`AGENT Integrity-lens sonnet low ${sha256(agents[0].buf)} plain override local`);", 'the renderer printed a line the install does not read'],
  ['an AGENT line with a value off the pattern', SET, R_AGENT_PUSH, "  report.lines.push(`AGENT integrity-lens haiku low ${sha256(agents[0].buf)} plain override local`);", 'the renderer printed a line the install does not read'],
  ['an AGENT line with no classification words', SET, R_AGENT_PUSH, "  report.lines.push(`AGENT integrity-lens sonnet low ${sha256(agents[0].buf)}`);", 'the renderer printed a line the install does not read'],
  ['the AGENT line twice', SET, R_AGENT_PUSH, `${R_AGENT_PUSH}\n${R_AGENT_PUSH}`, 'the renderer reported one agent setting twice'],
  ['an agent file hash other than its own', SET, R_AGENT_PUSH, `  report.lines.push('AGENT integrity-lens sonnet low ${A64} plain override local');`, "the rendered agent file's hash does not match the one the renderer reported"],
  ['default for a changed file', SET, R_AGENT_PUSH, "  for (const a of agents) report.lines.push(`AGENT ${a.name} ${a.model} ${a.effort} ${sha256(a.buf)} plain default local`);", "the renderer's override word for integrity-lens does not match whether its file changed"],
  ['override for a file at its own values', { schema: 1, agents: { 'integrity-lens': { model: 'opus' } } }, R_AGENT_PUSH, "  for (const a of agents) report.lines.push(`AGENT ${a.name} ${a.model} ${a.effort} ${sha256(a.buf)} plain override local`);", "the renderer's override word for integrity-lens does not match whether its file changed"],
  ['local and plain for the shell lens', { schema: 1, agents: { 'behaviour-lens': { model: 'sonnet' } } }, R_AGENT_PUSH, "  for (const a of agents) report.lines.push(`AGENT ${a.name} ${a.model} ${a.effort} ${sha256(a.buf)} plain override local`);", "the renderer's egress word for behaviour-lens does not match its committed tools line"],
  ['egress for a lens with only the read tools', SET, R_AGENT_PUSH, "  for (const a of agents) report.lines.push(`AGENT ${a.name} ${a.model} ${a.effort} ${sha256(a.buf)} security-set override egress`);", "the renderer's egress word for integrity-lens does not match its committed tools line"],
  ['egress but plain for the shell lens', { schema: 1, agents: { 'behaviour-lens': { model: 'sonnet' } } }, R_AGENT_PUSH, "  for (const a of agents) report.lines.push(`AGENT ${a.name} ${a.model} ${a.effort} ${sha256(a.buf)} plain override egress`);", 'the renderer called behaviour-lens egress but not security-set'],
  ['an AGENT line for another lens than the file it left', SET, R_AGENT_PUSH, "  report.lines.push(`AGENT behaviour-lens sonnet low ${sha256(agents[0].buf)} security-set override egress`);", 'the renderer did not leave exactly its rules file of at most 1 MiB, its diff, and an agent file only for an agent setting it reported'],  ['an AGENT line with no agent file', SET, R_AGENT_WRITE, '', 'the renderer did not leave exactly its rules file of at most 1 MiB, its diff, and an agent file only for an agent setting it reported'],
  ['an agent file with no AGENT line', SET, R_AGENT_PUSH, '', 'the renderer did not leave exactly its rules file of at most 1 MiB, its diff, and an agent file only for an agent setting it reported'],
  ['a third file under another name', null, R_DIFF_WRITE, `${R_DIFF_WRITE}\n  writeFileSync(join(out, 'agent-behaviour-lens.md'), 'x');`, 'the renderer did not leave exactly its rules file of at most 1 MiB, its diff, and an agent file only for an agent setting it reported'],
  ['an agent file changed beyond its two lines', SET, R_AGENT_WRITE, "  for (const a of agents) { a.buf = Buffer.from(a.buf.toString('utf8').replace('tools: [Read, Glob, Grep]', 'tools: [Read, Glob, Grep, Bash]')); writeFileSync(join(out, `${AGENT_OUTPUT_PREFIX}${a.name}.md`), a.buf, { flag: 'wx' }); }", 'the rendered agent file differs from the committed one beyond its model and effort lines, or does not hold the reported values'],
  ['a model line other than the one it reports', SET, R_AGENT_WRITE, `  for (const a of agents) a.buf = Buffer.from(a.buf.toString('utf8').replace('model: sonnet', 'model: opus'));\n${R_AGENT_WRITE}`, 'the rendered agent file differs from the committed one beyond its model and effort lines, or does not hold the reported values'],
  ['the committed lines left unchanged while it reports a setting', SET, R_AGENT_WRITE, `  for (const a of agents) a.buf = Buffer.from(a.buf.toString('utf8').replace('model: sonnet', 'model: opus').replace('effort: low', 'effort: medium'));\n${R_AGENT_WRITE}`, 'the rendered agent file differs from the committed one beyond its model and effort lines, or does not hold the reported values'],
  ['an effort line other than the one it reports', SET, R_AGENT_WRITE, `  for (const a of agents) a.buf = Buffer.from(a.buf.toString('utf8').replace('effort: low', 'effort: medium'));\n${R_AGENT_WRITE}`, 'the rendered agent file differs from the committed one beyond its model and effort lines, or does not hold the reported values'],
  ['a body line changed in place of the frontmatter', SET, R_AGENT_WRITE, `  for (const a of agents) a.buf = Buffer.from(a.buf.toString('utf8').replace('# integrity-lens', 'model: sonnet'));\n${R_AGENT_WRITE}`, 'the rendered agent file differs from the committed one beyond its model and effort lines, or does not hold the reported values'],
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

test('bad case: a renderer that rewrites a model line in the body, not the frontmatter, refuses', t => {
  // The committed lens carries a body line that starts like a model line, so
  // only the frontmatter-only rule tells the two apart.
  const repo = makeRepo(t, root => {
    const f = join(root, 'claude', 'agents', 'integrity-lens.md');
    writeFileSync(f, readFileSync(f, 'utf8').replace('# integrity-lens', 'model: opus\n\n# integrity-lens'));
    plantRenderer(root, R_AGENT_WRITE, `  for (const a of agents) { const l = a.buf.toString('utf8').split('\\n'); const i = l.indexOf('model: opus', 8); l[i] = 'model: sonnet'; a.buf = Buffer.from(l.join('\\n')); }\n${R_AGENT_WRITE}`);
  });
  const h = home(t);
  configure(h, SET);
  const r = install(repo, h, { apply: true, extra: ['-RenderedHash', A64] });
  refused(r);
  assert.match(r.stdout, /^render\| RESULT: pass\r?$/m, r.out);
  assert.match(r.stdout, /^REFUSED: the rendered agent file differs from the committed one beyond its model and effort lines, or does not hold the reported values\./m, r.out);
});

test('bad case: a configuration setting integrity-lens on a commit with no integrity-lens file refuses', t => {
  // A planted renderer that does not read the file, so only the install's own check stands.
  const repo = makeRepo(t, root => {
    plantRenderer(root, "    agents = checked.agents.map(a => renderAgent(source, a, report, buf.toString('utf8')));", "    agents = checked.agents.map(a => ({ name: a.name, model: 'sonnet', effort: 'low', buf: Buffer.from('x') }));");
    rmSync(join(root, 'claude', 'agents', 'integrity-lens.md'));
  });
  const h = home(t);
  configure(h, SET);
  const r = install(repo, h, { apply: true, extra: ['-RenderedHash', A64] });
  refused(r);
  assert.match(r.stdout, /^REFUSED: the configuration sets integrity-lens, but the commit holds no claude\/agents\/integrity-lens\.md\./m, r.out);
});
