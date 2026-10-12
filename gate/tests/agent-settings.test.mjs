// Agent settings (#97): a user file sets any pact lens's model and effort.
// The renderer is driven through its command line, as the install script runs
// it. Never touches ~/.claude. Expected agent bytes are built here from the
// repo's copy, never taken from the renderer. The install script end to end is
// in agent-settings-install.test.mjs.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { AGENT_EFFORTS, AGENT_MODEL_RE, AGENT_NAMES } from '../install-core.mjs';
import { copyGate, moduleMatch, plantModule } from './gate-files.mjs';
import { GATE, RENDER, REPO, lastLine } from './text.mjs';
import { moduleResult, table } from './tables.mjs';
import { tempDir } from './tree.mjs';

const WIN = process.platform === 'win32';
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

const agentsKey = agents => `${JSON.stringify({ schema: 1, agents })}\n`;
const setTo = v => () => ({ config: agentsKey({ 'integrity-lens': v }) });

for (const c of table('render agents key', {
  module: 'gate/render.mjs',
  base: () => ({ config: agentsKey({ 'integrity-lens': { model: 'sonnet' } }) }),
  run: ({ config }, t) => {
    const r = render(t, config);
    const planted = Object.values(JSON.parse(config).agents ?? {}).flatMap(e => (e && typeof e === 'object' ? Object.values(e) : [])).filter(v => typeof v === 'string' && v.length >= 6);
    return { ...moduleResult(r.code, r.stdout, r.stderr), outFiles: r.outFiles, planted };
  },
  // #262 C14: a refusal names the agent and the rule, never the refused value (data-lens F3).
  everyRow: r => {
    assert.deepEqual(r.outFiles, [], 'a refused render left output files');
    for (const v of r.planted) if (v !== 'sonnet') assert.ok(!r.out.includes(v), `a refused value was printed: ${JSON.stringify(v)}`);
  },
  rows: [
    { id: 'unknown-agent', plant: () => ({ config: agentsKey({ 'my-reviewer': { model: 'sonnet' } }) }), fails: ['config-agents'], says: /cannot set/, why: 'an agent the pact does not ship' },
    { id: 'agent-name-in-capitals', plant: () => ({ config: agentsKey({ 'Integrity-Lens': { model: 'sonnet' } }) }), fails: ['config-agents'], says: /cannot set/, why: 'names are matched exactly' },
    { id: 'constructor-as-agent', plant: () => ({ config: agentsKey({ constructor: { model: 'sonnet' } }) }), fails: ['config-agents'], says: /cannot set/, why: 'a prototype name is no agent' },
    { id: 'proto-as-agent', plant: () => ({ config: '{ "schema": 1, "agents": { "__proto__": { "model": "sonnet" } } }\n' }), fails: ['config-agents'], says: /cannot set/, why: 'a prototype name is no agent' },
    { id: 'agents-empty', plant: () => ({ config: agentsKey({}) }), fails: ['config-agents'], says: /at least one agent/, why: 'an empty agents object' },
    { id: 'agents-not-object', plant: () => ({ config: agentsKey('x') }), fails: ['config-agents'], says: /at least one agent/, why: 'agents is an object' },
    { id: 'entry-string', plant: setTo('sonnet'), fails: ['config-agents'], says: /must be an object/, why: 'an entry is an object' },
    { id: 'entry-list', plant: setTo([]), fails: ['config-agents'], says: /must be an object/, why: 'an entry is an object' },
    { id: 'entry-null', plant: setTo(null), fails: ['config-agents'], says: /must be an object/, why: 'an entry is an object' },
    { id: 'entry-empty', plant: setTo({}), fails: ['config-agents'], says: /must be an object/, why: 'an entry sets something' },
    { id: 'unknown-field', plant: setTo({ model: 'sonnet', tools: 'Bash' }), fails: ['config-agents'], says: /must be an object/, why: 'no setting adds a tool' },
    { id: 'field-in-capitals', plant: setTo({ Model: 'sonnet' }), fails: ['config-agents'], says: /must be an object/, why: 'fields are matched exactly' },
    { id: 'constructor-as-field', plant: setTo({ constructor: 'sonnet' }), fails: ['config-agents'], says: /must be an object/, why: 'a prototype name is no field' },
    { id: 'proto-as-field', plant: () => ({ config: '{ "schema": 1, "agents": { "integrity-lens": { "__proto__": "sonnet" } } }\n' }), fails: ['config-agents'], says: /must be an object/, why: 'a prototype name is no field' },
    // #262: a model is one word, so it stays one frontmatter line and one AGENT field.
    { id: 'model-newline-and-frontmatter', plant: setTo({ model: 'sonnet\ntools: [Bash]' }), fails: ['config-agents'], says: /model must be/, why: 'a line break would add a key' },
    { id: 'model-space', plant: setTo({ model: 'claude opus' }), fails: ['config-agents'], says: /model must be/, why: 'a space could start a key or a comment' },
    { id: 'model-trailing-space', plant: setTo({ model: 'sonnet ' }), fails: ['config-agents'], says: /model must be/, why: 'a space' },
    { id: 'model-colon-space', plant: setTo({ model: 'sonnet:\x20tools' }), fails: ['config-agents'], says: /model must be/, why: 'a colon and a space make a key' },
    { id: 'model-too-long', plant: setTo({ model: `a${'b'.repeat(128)}` }), fails: ['config-agents'], says: /model must be/, why: 'over 128 characters' },
    { id: 'model-empty', plant: setTo({ model: '' }), fails: ['config-agents'], says: /model must be/, why: 'no model' },
    { id: 'model-number', plant: setTo({ model: 4 }), fails: ['config-agents'], says: /model must be/, why: 'a model is text' },
    { id: 'model-null', plant: setTo({ model: null }), fails: ['config-agents'], says: /model must be/, why: 'a model is text' },
    { id: 'effort-unknown', plant: setTo({ effort: 'ultra' }), fails: ['config-agents'], says: /effort must be one of/, why: 'an effort Claude Code does not take' },
    { id: 'effort-in-capitals', plant: setTo({ effort: 'High' }), fails: ['config-agents'], says: /effort must be one of/, why: 'efforts are matched exactly' },
    { id: 'effort-list', plant: setTo({ effort: ['low'] }), fails: ['config-agents'], says: /effort must be one of/, why: 'an effort is text' },
    { id: 'effort-object', plant: setTo({ effort: { v: 'low' } }), fails: ['config-agents'], says: /effort must be one of/, why: 'an effort is text' },
  ],
})) test(c.name, c.fn);

// ------------------------------------------------------------ the renderer: the agent file's refusals

for (const c of table('render agent file', {
  module: 'gate/render.mjs',
  base: () => ({ 'agent.md': AGENT }),
  run: (tree, t) => {
    const agent = Object.hasOwn(tree, 'agent.md') ? tree['agent.md'] : Object.hasOwn(tree, 'folder') ? p => mkdirSync(p) : null;
    const r = render(t, cfg({ 'integrity-lens': { model: 'sonnet' } }), { agent });
    return { ...moduleResult(r.code, r.stdout, r.stderr), outFiles: r.outFiles };
  },
  everyRow: r => assert.deepEqual(r.outFiles, [], 'a refused render left output files'),
  rows: [
    { id: 'missing', plant: () => ({ none: '' }), fails: ['agent-file'], says: /the file is missing/, why: 'no file to set' },
    { id: 'folder', plant: () => ({ folder: '' }), fails: ['agent-file'], says: /not a regular file/, why: 'a folder in place of the file' },
    { id: 'over-1-mib', plant: () => ({ 'agent.md': `${AGENT}${'x'.repeat(1024 * 1024)}\n` }), fails: ['agent-file'], says: /larger than its cap/, why: 'the read cap' },
    { id: 'crlf', plant: () => ({ 'agent.md': AGENT.replace(/\n/g, '\r\n') }), fails: ['characters'], says: /carriage return/, why: 'line feeds only' },
    { id: 'no-frontmatter', plant: () => ({ 'agent.md': AGENT.replace(/^---\n/, '') }), fails: ['agent-file'], says: /no frontmatter/, why: 'the lines live in frontmatter' },
    { id: 'frontmatter-never-closes', plant: () => ({ 'agent.md': AGENT.replace(/\n---\n/, '\n') }), fails: ['agent-file'], says: /never closes/, why: 'the frontmatter must end' },
    { id: 'no-model-line', plant: () => ({ 'agent.md': AGENT.replace(/^model: .*\n/m, '') }), fails: ['agent-file'], says: /exactly one model line/, why: 'one line to rewrite' },
    { id: 'two-model-lines', plant: () => ({ 'agent.md': AGENT.replace(/^model: .*$/m, 'model: opus\nmodel: opus') }), fails: ['agent-file'], says: /exactly one model line/, why: 'one line to rewrite' },
    { id: 'model-line-only-in-body', plant: () => ({ 'agent.md': AGENT.replace(/^model: .*\n/m, '').replace('# integrity-lens', 'model: opus\n\n# integrity-lens') }), fails: ['agent-file'], says: /exactly one model line/, why: 'only the frontmatter counts' },
    { id: 'model-line-indented-child', plant: () => ({ 'agent.md': AGENT.replace(/^model: .*$/m, 'notes:\n  model: opus') }), fails: ['agent-file'], says: /exactly one model line/, why: 'only a column-0 line counts' },
    { id: 'no-effort-line', plant: () => ({ 'agent.md': AGENT.replace(/^effort: .*\n/m, '') }), fails: ['agent-file'], says: /exactly one effort line/, why: 'one line to rewrite' },
    { id: 'two-effort-lines', plant: () => ({ 'agent.md': AGENT.replace(/^effort: .*$/m, 'effort: medium\neffort: low') }), fails: ['agent-file'], says: /exactly one effort line/, why: 'one line to rewrite' },
    { id: 'metadata-seal-key', plant: () => ({ 'agent.md': AGENT.replace(/^effort: .*$/m, '$&\nmetadata:\n  contract-version: 1') }), fails: ['agent-file'], says: /sealed agent cannot be configured/, why: 'a seal would break' },
    // #262 C14: the file's own values pass the same checks as a setting.
    { id: 'own-model-off-shape', plant: () => ({ 'agent.md': AGENT.replace(/^model: .*$/m, 'model: opus # cheap') }), fails: ['agent-file'], says: /model line is not one word/, why: 'a kept model is written back' },
    { id: 'own-effort-off-list', plant: () => ({ 'agent.md': AGENT.replace(/^effort: .*$/m, 'effort: ultra') }), fails: ['agent-file'], says: /effort line is not one of/, why: 'a kept effort is written back' },
    { id: 'second-tools-line', plant: () => ({ 'agent.md': AGENT.replace('tools: [Read, Glob, Grep]', 'tools: [Read, Glob, Grep]\ntools: [Bash]') }), fails: ['agent-file'], says: /exactly one tools line/, why: 'the tools line is read once' },
    { id: 'no-tools-line', plant: () => ({ 'agent.md': AGENT.replace(/^tools: .*\n/m, '') }), fails: ['agent-file'], says: /exactly one tools line/, why: 'the tools line is read once' },
  ],
})) test(c.name, c.fn);

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

// #262 C13: scout is set like any lens.
test('every pact agent can be set, scout included, and the security-set ones are exactly the six the spec names; only the shell and web lenses are egress', t => {
  assert.deepEqual(PACT_AGENTS, ['adversarial-lens', 'behaviour-lens', 'conventions-lens', 'data-lens', 'executability-lens', 'good-enough-lens', 'integrity-lens', 'reader-lens', 'scout', 'unstated-lens']);
  const got = Object.fromEntries(PACT_AGENTS.map(a => [a, classify(t, a).words]));
  assert.deepEqual(got, {
    'adversarial-lens': 'security-set override egress',
    'behaviour-lens': 'security-set override egress',
    'conventions-lens': 'plain override local',
    'data-lens': 'security-set override local',
    'executability-lens': 'security-set override local',
    'good-enough-lens': 'security-set override local',
    'integrity-lens': 'plain override local',
    'reader-lens': 'plain override local',
    scout: 'plain override local',
    'unstated-lens': 'security-set override local',
  });
});

// #262 C13
test('any Claude Code model and each of the five efforts render, written exactly as given', t => {
  for (const [model, effort] of [['haiku', 'xhigh'], ['fable', 'max'], ['inherit', 'low'], ['claude-opus-5-5', 'medium'], ['us.anthropic.claude-opus-5-5-v1:0', 'high'], ['Sonnet', 'low']]) {
    const r = render(t, cfg({ 'integrity-lens': { model, effort } }));
    assert.equal(r.code, 0, r.out);
    const want = Buffer.from(withAgent(model, effort));
    assert.deepEqual(r.agentBytes, want);
    assert.ok(r.stdout.split('\n').includes(`AGENT integrity-lens ${model} ${effort} ${sha256(want)} plain override local`), r.out);
    // The rules file's notice names an alias as it is, and any other model only as custom (data-lens F1).
    const named = ['haiku', 'fable', 'inherit'].includes(model);
    assert.match(r.rules, new RegExp(`^Agents set: integrity-lens \\(${named ? model : 'a custom model'}, ${effort} effort\\)\\.$`, 'm'));
    // (The tier table already says "Sonnet", so only the IDs are looked for.)
    if (model.includes('-')) assert.ok(!r.rules.includes(model), 'a custom model reached the rules file');
  }
});

test('a lens set to its own values is not an override: no mark, and the AGENT line says default', t => {
  const r = render(t, cfg({ 'data-lens': { model: 'opus', effort: 'high' } }), { name: 'data-lens', agent: readFileSync(join(AGENTS_DIR, 'data-lens.md'), 'utf8') });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^AGENT data-lens opus high [0-9a-f]{64} security-set default local$/m);
  assert.match(r.rules, /^Agents set: data-lens \(opus, high effort\)\.$/m);
  assert.doesNotMatch(notice(r.rules), /override/);
});

// #262: no setting is marked; a person may run any agent on any model.
test('a security-set lens off its default is listed like any other: no mark in the notice, and no sentence carrying one to reports', t => {
  const r = render(t, cfg({ 'data-lens': { model: 'sonnet' }, 'integrity-lens': { effort: 'low' } }), { name: 'data-lens', agent: readFileSync(join(AGENTS_DIR, 'data-lens.md'), 'utf8') });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^AGENT data-lens sonnet high [0-9a-f]{64} security-set override local$/m);
  assert.match(r.rules, /^Agents set: data-lens \(sonnet, high effort\), integrity-lens \(opus, low effort\)\.$/m);
  assert.doesNotMatch(r.rules, /not security-tested|beside every report/);
  // The review template's "not verified" keeps its one meaning.
  assert.doesNotMatch(notice(r.rules), /not verified/);
});

// #261 C8
test('bad case: each sign alone marks integrity-lens security-set; with none it stays plain', t => {
  assert.equal(classify(t, 'integrity-lens').words, 'plain override local');
  // A tool beyond the read tools: security-set, and egress.
  assert.equal(classify(t, 'integrity-lens', { agent: AGENT.replace('tools: [Read, Glob, Grep]', 'tools: [Read, Glob, Grep, Bash]') }).words, 'security-set override egress');
  // On the fixed security-set list (#261).
  const listed = copyGate(tempDir(t, 'pact-agents-gate-'));
  plantModule(listed, 'render', "const SECURITY_SET = Object.freeze(['adversarial-lens', 'data-lens', 'executability-lens']);", "const SECURITY_SET = Object.freeze(['adversarial-lens', 'data-lens', 'executability-lens', 'integrity-lens']);");
  assert.equal(classify(t, 'integrity-lens', { renderer: join(listed, 'render.mjs') }).words, 'security-set override local');
  // Its own file carries a risk-floor block.
  const floor = AGENT.replace('# integrity-lens', '<!-- pact:begin risk-floor -->\nThe risk floor.\n<!-- pact:end risk-floor -->\n\n# integrity-lens');
  assert.notEqual(floor, AGENT);
  assert.equal(classify(t, 'integrity-lens', { agent: floor }).words, 'security-set override local');
  // On the doubt list.
  const gate = copyGate(tempDir(t, 'pact-agents-gate-'));
  const doubt = "  'unstated-lens': 'it reports work that should have taken the security route',";
  plantModule(gate, 'render', doubt, `${doubt}\n  'integrity-lens': 'planted',`);
  assert.equal(classify(t, 'integrity-lens', { renderer: join(gate, 'render.mjs') }).words, 'security-set override local');
});

test('bad case: a renderer whose output would change another line refuses by its own self-check', t => {
  const gate = copyGate(tempDir(t, 'pact-agents-gate-'));
  const from = '  out[effortAt[0]] = `effort: ${effort}`;';
  plantModule(gate, 'render', from, `${from}\n  out[toolsAt[0]] = 'tools: [Read, Glob, Grep, Bash]';`);
  const r = render(t, cfg({ 'integrity-lens': { model: 'sonnet' } }), { renderer: join(gate, 'render.mjs') });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stdout, /would differ from the source beyond its model and effort lines/);
  assert.deepEqual(r.outFiles, []);
});

// #261 S5: the fixed list carries the class. data-lens has no other sign, and
// executability-lens none once its risk-floor block is gone; each turns plain
// when the list loses it. Since #262 the class shows only on the AGENT line.
test('bad case: the fixed security-set list alone marks data-lens and executability-lens; a list that loses one leaves it plain', t => {
  const exAgent = readFileSync(join(AGENTS_DIR, 'executability-lens.md'), 'utf8');
  const exBare = exAgent.replace(/<!-- pact:begin risk-floor -->\n[\s\S]*?<!-- pact:end risk-floor -->\n/, '');
  assert.notEqual(exBare, exAgent);
  assert.equal(classify(t, 'data-lens').words, 'security-set override local');
  assert.equal(classify(t, 'executability-lens', { agent: exBare }).words, 'security-set override local');
  const gate = copyGate(tempDir(t, 'pact-agents-gate-'));
  plantModule(gate, 'render', "const SECURITY_SET = Object.freeze(['adversarial-lens', 'data-lens', 'executability-lens']);", "const SECURITY_SET = Object.freeze(['adversarial-lens']);");
  const renderer = join(gate, 'render.mjs');
  assert.equal(classify(t, 'data-lens', { renderer }).words, 'plain override local');
  assert.equal(classify(t, 'executability-lens', { agent: exBare, renderer }).words, 'plain override local');
});

test('the install script\'s list of agents equals the renderer\'s configurable list', () => {
  const r = moduleMatch(GATE, 'render', /const CONFIGURABLE_AGENTS = Object\.freeze\(\[([^\]]*)\]\);/);
  assert.ok(r);
  const names = s => s.split(',').map(x => x.trim().replace(/^'|'$/g, ''));
  // The Node install keeps the list as a constant in its core (#153, S14).
  assert.deepEqual([...AGENT_NAMES], names(r[1]));
  assert.deepEqual(names(r[1]), PACT_AGENTS);
  // #262: the install's copy of the model shape and the efforts.
  assert.equal(moduleMatch(GATE, 'render', /const AGENT_MODEL_RE = (.*);/)[1], String(AGENT_MODEL_RE));
  assert.equal(moduleMatch(GATE, 'render', /const AGENT_EFFORTS = Object\.freeze\((\[.*\])\);/)[1], JSON.stringify(AGENT_EFFORTS).replace(/"/g, "'").replace(/,/g, ', '));
});
