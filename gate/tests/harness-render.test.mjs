// What each harness receives (spec 0007 S6, S7): C5-C9 and C29, over the pure
// render in gate/harness-render.mjs. neutral-home.test.mjs runs it in a real
// install.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { renderHarnesses } from '../harness-render.mjs';
import { parseKnown, resolveHarnesses } from '../harnesses.mjs';
import { runCore } from './gate-run.mjs';
import { realAgents } from './payload.mjs';
import { REPO, agent, assertPasses, moduleResult } from './text.mjs';
import { tempDir } from './tree.mjs';

const h = (id, over = {}) => ({
  id,
  name: id,
  rules: { path: `.${id}/RULES.md`, cap: null, sharedCap: null },
  agents: { dir: `.${id}/agents`, format: 'claude-md' },
  skills: null,
  commands: null,
  models: { planning: `${id}-plan`, executor: `${id}-exec`, light: `${id}-light` },
  capabilities: ['subagents'],
  own: false,
  overrides: [],
  ...over,
});
const CLAUDE = h('claude', { name: 'Claude Code', commands: { dir: '.claude/commands' }, models: { planning: 'opus', executor: 'sonnet', light: 'haiku' }, capabilities: ['subagents', 'cleaner', 'archive'] });
const CODEX = h('codex', { agents: { dir: '.codex/agents', format: 'codex-toml' }, skills: { dir: '.agents/skills' }, models: { planning: 'sol', executor: 'astra', light: null }, capabilities: ['subagents', 'explicit-skills'] });
const ANTI = h('antigravity', { agents: { dir: '.gemini/config/agents', format: 'antigravity-md' }, skills: { dir: '.gemini/config/skills' }, models: { planning: 'pro', executor: 'flash', light: 'flash' } });
// A harness with a skills folder and no capability for an explicit-only skill.
const NO_EXPLICIT = h('plain', { skills: { dir: '.plain/skills' } });

const RULES = [
  '# Rules',
  '<!-- pact:if cleaner -->',
  '- cleaner bullet',
  '<!-- pact:end -->',
  '<!-- pact:unless subagents -->',
  'run each lens in a separate session',
  '<!-- pact:end -->',
  'tiers',
  '<!-- pact:models -->',
  '',
].join('\n');

const LENS = agent(['name: data-lens', 'description: Reads for leaks. Not for "style".', 'tools: [Read, Glob, Grep, WebFetch]', 'model: planning', 'effort: high'], '# data-lens\n\nRead.\n');
const SCOUT = agent(['name: scout', 'description: Searches.', 'tools: [Read]', 'model: light', 'effort: medium'], '# scout\n');
// The line every codex-toml agent file opens its instructions with (spec 0007 S7).
const SHELL_READS = 'You have no Read, Glob or Grep tool here. Where these instructions name one, search and read with shell commands that only read files (`rg`, `ls`, `cat`, `Get-Content`), not `git`: reading that way is not a command to stop at.';
const AGENTS = new Map([['data-lens', LENS], ['scout', SCOUT]]);
const TABLE = { Read: 'view_file', Glob: 'find_by_name', Grep: 'grep_search' };

const command = (name, body) => `---\ndescription: The ${name} answer.\ndisable-model-invocation: true\n---\n\n# /${name}\n\n${body}`;
const COMMANDS = new Map([
  ['finis', command('finis', 'Check.\n<!-- pact:if archive -->\nArchive it.\n<!-- pact:end -->\n<!-- pact:unless archive -->\nNothing is outstanding; close this session.\n<!-- pact:end -->\n')],
  ['scry', command('scry', 'Say what waits.\n')],
]);

const render = (harnesses, over = {}) => renderHarnesses({ rules: RULES, agents: AGENTS, commands: COMMANDS, harnesses, tables: { 'antigravity-md': TABLE }, ...over });
const file = (r, rel) => {
  assert.ok(r.files.has(rel), `${rel} is rendered; got ${[...r.files.keys()].join(', ')}`);
  return r.files.get(rel);
};
const refuses = (fn, rule) => assert.throws(fn, e => e.rule === rule, rule);

test('C7, C29: each harness gets only the capability blocks it has, and a models line naming its own models', () => {
  const r = render([CLAUDE, CODEX, h('bare', { capabilities: [] })]);
  assert.equal(file(r, 'rendered/claude/rules.md'), '# Rules\n- cleaner bullet\ntiers\n\nHere the planning model is `opus`, the executor model `sonnet` and the light model `haiku`.\n');
  // No light model: the executor model stands in.
  assert.equal(file(r, 'rendered/codex/rules.md'), '# Rules\ntiers\n\nHere the planning model is `sol`, the executor model `astra` and the light model `astra`.\n');
  assert.match(file(r, 'rendered/bare/rules.md'), /^# Rules\nrun each lens in a separate session\ntiers\n/);
});

test('C29: a harness with no models gets no models line and no agent model, with a warning', () => {
  const r = render([h('plain', { models: null })]);
  assert.doesNotMatch(file(r, 'rendered/plain/rules.md'), /planning model is|pact:models/);
  assert.doesNotMatch(file(r, 'rendered/plain/agents/scout.md'), /^model:/m);
  assert.match(r.warnings.join('\n'), /^plain: it names no models/m);
});

test('C29: a models line that comes from the configuration warns that sessions may quote it, naming no model', () => {
  const w = render([{ ...CLAUDE, overrides: ['models'] }, CODEX, h('mine', { own: true }), h('bare', { own: true, models: null })]).warnings.filter(l => l.includes('may quote'));
  assert.deepEqual(w, [
    'claude: its rules hold your configuration’s model names as written; sessions read that file and may quote it.',
    'mine: its rules hold your configuration’s model names as written; sessions read that file and may quote it.',
  ]);
});

test('C29: a model per agent from the configuration warns that the agent files hold it, naming no model', () => {
  const warned = render([{ ...ANTI, overrides: ['agentModels'], agentModels: { scout: 'acct-model' } }, h('mine', { own: true, models: null, agentModels: { '*': 'acct-model' } })]).warnings;
  const held = 'its agent files hold your configuration’s model names as written; sessions read those files and may quote them.';
  assert.deepEqual(warned.filter(l => /may quote|names no models/.test(l)), [`antigravity: ${held}`, 'mine: it names no models, so its rules hold no models line.', `mine: ${held}`]);
  assert.doesNotMatch(warned.join('\n'), /acct-model/);
});

test('a conditional block that does not close, holds another, or names no capability the pact knows, refuses', () => {
  refuses(() => render([CLAUDE], { rules: '<!-- pact:if cleaner -->\nx\n' }), 'render-block');
  refuses(() => render([CLAUDE], { rules: '<!-- pact:end -->\n' }), 'render-block');
  refuses(() => render([CLAUDE], { rules: '<!-- pact:if cleener -->\nx\n<!-- pact:end -->\n' }), 'render-block');
  refuses(() => render([CLAUDE], { rules: '<!-- pact:if cleaner -->\n<!-- pact:if cleaner -->\nx\n<!-- pact:end -->\n' }), 'render-block');
});

test('an agent with no frontmatter refuses', () => {
  refuses(() => render([CLAUDE], { agents: new Map([['scout', '# scout\n']]) }), 'render-frontmatter');
});

test('C6: rules over a harness cap refuse; above half a shared cap the dry run warns', () => {
  const capped = cap => h('c', { rules: { path: '.c/R.md', cap, sharedCap: null } });
  const size = Buffer.byteLength(file(render([capped(null)]), 'rendered/c/rules.md'));
  render([capped(size)]);
  refuses(() => render([capped(size - 1)]), 'rules-cap');
  const shared = sharedCap => render([h('s', { rules: { path: '.s/R.md', cap: null, sharedCap } })]).warnings.join('\n');
  const own = Buffer.byteLength(file(render([h('s')]), 'rendered/s/rules.md'));
  assert.doesNotMatch(shared(own * 2), /share the rest/);
  assert.match(shared(own * 2 - 1), /^s: the rules take \d+ of \d+ shared bytes; project files share the rest\./m);
  // A shared cap bounds the rules too.
  refuses(() => shared(own - 1), 'rules-cap');
});

test('C5: a claude-md agent keeps its bytes but for the model its role names', () => {
  const r = render([CLAUDE]);
  assert.equal(file(r, 'rendered/claude/agents/data-lens.md'), LENS.replace('model: planning', 'model: opus'));
  assert.equal(file(r, 'rendered/claude/agents/scout.md'), SCOUT.replace('model: light', 'model: haiku'));
  const own = render([CLAUDE], { agents: new Map([['scout', SCOUT.replace('model: light', 'model: executor')]]) });
  assert.match(file(own, 'rendered/claude/agents/scout.md'), /^model: sonnet$/m);
});

test('C5: a codex-toml agent maps role and effort, drops tools, and every agent turns off what it may not use', () => {
  const r = render([CODEX]);
  assert.equal(
    file(r, 'rendered/codex/agents/data-lens.toml'),
    `name = "data-lens"\ndescription = "Reads for leaks. Not for \\"style\\"."\nmodel = "sol"\nmodel_reasoning_effort = "high"\ndeveloper_instructions = '''\n${SHELL_READS}\n\n# data-lens\n\nRead.\n'''\n\n[features]\napps = false\nplugins = false\nmemories = false\nrequest_permissions_tool = false\n`,
  );
  const scout = file(r, 'rendered/codex/agents/scout.toml');
  // So does an agent whose source names no read tool.
  const bare = render([CODEX], { agents: new Map([['scout', SCOUT.replace('tools: [Read]', 'tools: [WebFetch]')]]) });
  assert.ok(file(bare, 'rendered/codex/agents/scout.toml').includes(`developer_instructions = '''\n${SHELL_READS}\n\n# scout`));
  assert.match(scout, /^model = "astra"$/m);
  assert.match(scout, /^model_reasoning_effort = "medium"$/m);
  assert.match(scout, /\n\[features\]\napps = false\nplugins = false\nmemories = false\nrequest_permissions_tool = false\n$/);
  assert.doesNotMatch(scout, /^tools/m);
  refuses(() => render([CODEX], { agents: new Map([['scout', SCOUT.replace('# scout', "a ''' b")]]) }), 'agent-toml');
});

test('C5: an antigravity-md agent maps its tools, drops effort, and warns on each tool it has no name for', () => {
  const r = render([ANTI]);
  assert.equal(file(r, 'rendered/antigravity/agents/data-lens.md'), agent(['name: data-lens', 'description: Reads for leaks. Not for "style".', 'model: pro', 'tools: [view_file, find_by_name, grep_search]'], '# data-lens\n\nRead.\n'));
  assert.match(r.warnings.join('\n'), /^antigravity: data-lens loses the tool WebFetch/m);
});

test('C5: a harness’s own model for an agent wins over the one its role names, in that harness alone, and a model the source names stays', () => {
  const own = { ...ANTI, models: { planning: 'neon-<effort>', executor: 'hydrogen-<effort>', light: 'flash' }, agentModels: { '*': 'flash', 'data-lens': 'pro' } };
  const r = render([own, CODEX]);
  assert.match(file(r, 'rendered/antigravity/agents/data-lens.md'), /^model: pro$/m);
  assert.match(file(r, 'rendered/antigravity/agents/scout.md'), /^model: flash$/m);
  assert.match(file(r, 'rendered/codex/agents/data-lens.toml'), /^model = "sol"$/m);
  // A model with <effort> in it tells the session where the effort comes from.
  assert.match(file(r, 'rendered/antigravity/rules.md'), /the planning model is `neon-<effort>`, the executor model `hydrogen-<effort>` and the light model `flash`\. For `<effort>`, take the effort the tier table gives\.$/m);
  assert.doesNotMatch(file(r, 'rendered/codex/rules.md'), /<effort>/);
  const named = render([own], { agents: new Map([['scout', SCOUT.replace('model: light', 'model: my-model')]]) });
  assert.match(file(named, 'rendered/antigravity/agents/scout.md'), /^model: my-model$/m);
});

test('C5: an antigravity agent whose tools come out empty or lose a read tool refuses', () => {
  const only = table => render([ANTI], { tables: { 'antigravity-md': table } });
  refuses(() => only({ Bash: 'run_command' }), 'agent-tools');
  for (const gone of ['Read', 'Glob', 'Grep']) refuses(() => only(Object.fromEntries(Object.entries(TABLE).filter(([k]) => k !== gone))), 'agent-tools');
  // No tools line may mean every tool.
  refuses(() => render([ANTI], { agents: new Map([['data-lens', LENS.replace('tools: [Read, Glob, Grep, WebFetch]\n', '')]]) }), 'agent-tools');
});

test('an antigravity harness takes no agents while the pact has no tool names for it', () => {
  const r = render([ANTI], { tables: { 'antigravity-md': {} } });
  assert.deepEqual([...r.files.keys()].filter(k => k.startsWith('rendered/antigravity/agents/')), []);
});

test("C5: the pact's own table gives each of its six tool names Antigravity's name for it", () => {
  const all = agent(['name: all', 'description: All.', 'tools: [Read, Glob, Grep, Bash, WebFetch, WebSearch, PowerShell]', 'model: executor'], '# all\n');
  const r = render([ANTI], { agents: new Map([['all', all]]), tables: undefined });
  assert.match(file(r, 'rendered/antigravity/agents/all.md'), /^tools: \[view_file, find_by_name, grep_search, run_command, read_url_content, search_web\]$/m);
  assert.deepEqual(r.warnings.filter(l => l.includes('loses')), ['antigravity: all loses the tool PowerShell, which the pact has no name for there']);
});

// A shell is a tool an agent has only when its source lists one: the table never turns a reader into a runner.
test("C5: each of the pact's agents renders for Antigravity, with a shell only where its source has one", () => {
  const sources = new Map(Object.entries(realAgents()).map(([path, text]) => [path.slice('claude/agents/'.length, -'.md'.length), text.replaceAll('\r\n', '\n')]));
  const r = render([ANTI], { agents: sources, tables: undefined });
  assert.ok(sources.size >= 9, `${sources.size} agents`);
  for (const [name, source] of sources) {
    const out = file(r, `rendered/antigravity/agents/${name}.md`);
    const tools = /^tools: \[(.*)\]$/m.exec(out)[1].split(', ');
    for (const read of ['view_file', 'find_by_name', 'grep_search']) assert.ok(tools.includes(read), `${name} ${read}`);
    assert.equal(tools.includes('run_command'), /^tools:.*\bBash\b/m.test(source), name);
    assert.match(out, /^model: (?:pro|flash)$/m, name);
  }
});

test("C9: a skill keeps its command's own disable-model-invocation where a harness can hold it, and gains it nowhere", () => {
  const open = new Map([['scry', COMMANDS.get('scry').replace('disable-model-invocation: true\n', '')]]);
  const skill = r => file(r, 'rendered/skills/scry/SKILL.md');
  assert.match(skill(render([CODEX])), /^---\nname: scry\ndescription: The scry answer\.\ndisable-model-invocation: true\n---\n/);
  assert.doesNotMatch(skill(render([CODEX], { commands: open })), /disable-model-invocation/);
  assert.doesNotMatch(skill(render([NO_EXPLICIT])), /disable-model-invocation/);
});

test('C9: commands stay commands where there is a commands folder, with the blocks resolved', () => {
  const r = render([CLAUDE]);
  assert.equal(file(r, 'rendered/claude/commands/finis.md'), command('finis', 'Check.\nArchive it.\n'));
  assert.deepEqual([...r.files.keys()].filter(k => k.startsWith('rendered/skills/')), []);
});

test('C9: every command becomes a skill where there is a skills folder, kept from the model where a harness allows', () => {
  const r = render([CODEX, ANTI]);
  assert.equal(file(r, 'rendered/skills/finis/SKILL.md'), '---\nname: finis\ndescription: The finis answer.\ndisable-model-invocation: true\n---\n\n# /finis\n\nCheck.\nNothing is outstanding; close this session.\n');
  for (const name of COMMANDS.keys()) assert.equal(file(r, `rendered/skills/${name}/agents/openai.yaml`), 'policy:\n  allow_implicit_invocation: false\n');
  assert.deepEqual([...render([NO_EXPLICIT]).files.keys()].filter(k => k.endsWith('openai.yaml')), []);
  assert.deepEqual([...r.files.keys()].filter(k => k.includes('/commands/')), []);
});

test('C7, C9: the one shared skill folder counts a capability only when every harness that reads it has it', () => {
  const some = h('other', { skills: { dir: '.other/skills' }, capabilities: ['archive'] });
  assert.match(file(render([some]), 'rendered/skills/finis/SKILL.md'), /Archive it\./);
  const mixed = file(render([some, CODEX]), 'rendered/skills/finis/SKILL.md');
  assert.doesNotMatch(mixed, /Archive it\./);
  assert.match(mixed, /\nNothing is outstanding; close this session\.\n$/);
});

test('C8: a model named outright warns in each harness but Claude Code, unless it is that harness’s own', () => {
  const named = { rules: `${RULES}Plan on Opus, build on Sonnet, search on claude-haiku-5-5.\n`, agents: new Map([['scout', SCOUT.replace('model: light', 'model: my-model')]]) };
  const w = render([CLAUDE, CODEX, h('own', { models: { planning: 'opus', executor: 'my-model', light: null } })], named).warnings.filter(l => l.includes('names model'));
  assert.deepEqual(w.sort(), [
    '`.codex/RULES.md` names model `Opus`, which codex may not have',
    '`.codex/RULES.md` names model `Sonnet`, which codex may not have',
    '`.codex/RULES.md` names model `claude-haiku-5-5`, which codex may not have',
    '`.codex/agents/scout.toml` names model `my-model`, which codex may not have',
    '`.own/RULES.md` names model `Sonnet`, which own may not have',
    '`.own/RULES.md` names model `claude-haiku-5-5`, which own may not have',
  ].map(l => l.replace('.codex/RULES.md', CODEX.rules.path)).sort());
  assert.match(file(render([CODEX], named), 'rendered/codex/agents/scout.toml'), /^model = "my-model"$/m);
});

// ------------------------------------------------------------ per-harness tier efforts and agent efforts (PACT-111)

/** The known harness `id`, as the install resolves it. */
const known = id => resolveHarnesses({ known: parseKnown(readFileSync(join(REPO, 'harnesses', 'known.json'), 'utf8')), home: '/home/user', platform: 'linux', inWorkTree: null }).find(x => x.id === id);

const TIERED = [
  '| Tier | Fits | Plan | Build |',
  '| --- | --- | --- | --- |',
  '| **Quick** | small | none | executor model, low |',
  '| **Standard** | a spec | planning model, medium | executor model, high |',
  '',
  '| Stage | Quick | Standard | Sensitive route |',
  '| --- | --- | --- | --- |',
  '| Plan | planning model, low | planning model, medium | planning model, high |',
  '| Design | skipped | planning model, medium | planning model, high |',
  '| Build | executor model, low | executor model, high | executor model, high |',
  '| Test | executor model, low | executor model, high | executor model, high |',
  '',
].join('\n');
const tiered = (harness, rules = TIERED) => render([harness], { rules, agents: new Map(), commands: new Map() });
const rulesOf = (r, id) => file(r, `rendered/${id}/rules.md`);
const owns = tierEfforts => h('mine', { tierEfforts, ownTiers: Object.keys(tierEfforts) });

// PACT-111 C4.
test('with the default configuration, Codex’s Standard Build reads medium in both tables, Claude Code’s high, and every other cell is the same', t => {
  const out = tempDir(t, 'pact-tier-out-');
  const made = runCore('render', [join(REPO, 'claude', 'CLAUDE.md'), out, tempDir(t, 'pact-tier-home-'), join(REPO, 'builder', 'default-config')]);
  assertPasses(moduleResult(made.code, made.stdout, made.stderr));
  const rules = readFileSync(join(out, 'CLAUDE.md'), 'utf8');
  const r = render([known('claude'), known('codex')], { rules, agents: new Map(), commands: new Map() });
  const rows = id => rulesOf(r, id).split('\n').filter(l => l.startsWith('|')).map(l => l.split('|').map(c => c.trim()));
  const claude = rows('claude');
  const codex = rows('codex');
  assert.equal(codex.length, claude.length);
  const changed = [];
  let header = null;
  claude.forEach((row, i) => {
    if (row[1] === 'Tier' || row[1] === 'Stage') header = row;
    row.forEach((cell, j) => {
      if (codex[i][j] !== cell) changed.push([row[1], header[j], cell, codex[i][j]]);
    });
  });
  assert.deepEqual(changed, [
    ['**Standard**', 'Build', 'executor model, high', 'executor model, medium'],
    ['Build', 'Standard', 'executor model, high', 'executor model, medium'],
  ]);
  assert.deepEqual(r.warnings.filter(w => w.includes('tierEfforts')), []);
});

// No claim of its own (spec 0008 D5): the one test of plan keys, tier names of several words, CRLF rules and the route column.
test('a plan key moves the tier’s Plan cell and the workflow’s Plan row alone, under a name of several words, with CRLF kept', () => {
  const rules = TIERED.replaceAll('Standard', 'Big  Job').replaceAll('\n', '\r\n');
  const out = rulesOf(tiered(owns({ 'big-job': { plan: 'xhigh' } }), rules), 'mine');
  const want = rules.replace('| a spec | planning model, medium |', '| a spec | planning model, xhigh |').replace('| Plan | planning model, low | planning model, medium |', '| Plan | planning model, low | planning model, xhigh |');
  assert.equal(out, want);
  // A tier named as the route's column never rewrites it.
  const route = TIERED.replace('**Standard**', '**Sensitive route**');
  const moved = route.replace('| a spec | planning model, medium | executor model, high |', '| a spec | planning model, medium | executor model, low |');
  assert.equal(rulesOf(tiered(owns({ 'sensitive-route': { build: 'low' } }), route), 'mine'), moved);
});

// PACT-111 C6.
test('bad case: an own tier key with no tiers table, no row, or a cell that is no model and effort refuses', () => {
  const key = { standard: { build: 'low' } };
  refuses(() => tiered(owns(key), 'no table here\n'), 'tier-effort');
  refuses(() => tiered(owns(key), TIERED.replace('**Standard**', '**Usual**')), 'tier-effort');
  refuses(() => tiered(owns(key), TIERED.replace('| planning model, medium | executor model, high |', '| planning model, medium | I decide |')), 'tier-effort');
  refuses(() => tiered(owns(key), TIERED.replace('| Build | executor model, low | executor model, high |', '| Build | executor model, low | skipped |')), 'tier-effort');
  // A workflow table, or a row of it, that isn't there is skipped.
  for (const rules of [TIERED.slice(0, TIERED.indexOf('| Stage |')), TIERED.replace(/^\| Build \|.*\n/m, '')]) {
    assert.match(rulesOf(tiered(owns(key), rules), 'mine'), /\| a spec \| planning model, medium \| executor model, low \|/);
  }
});

// PACT-111 C6.
test('a known tier key that finds nothing warns, and Codex renders its rules without it', () => {
  const unchanged = rules => assert.match(rulesOf(tiered(known('codex'), rules), 'codex'), /\| a spec \| planning model, medium \| executor model, high \|/);
  const renamed = TIERED.replaceAll('Standard', 'Usual');
  unchanged(renamed);
  assert.deepEqual(tiered(known('codex'), renamed).warnings.filter(w => w.includes('tierEfforts')), ['codex: its known tierEfforts key standard finds no row of that tier in a tiers table, so the rules are rendered without it']);
  // One cell it can't read leaves the whole key out, so the two tables agree.
  unchanged(TIERED.replace('| Build | executor model, low | executor model, high |', '| Build | executor model, low | skipped |'));
});

const SLOTTED = { models: { planning: 'neon-<effort>', executor: 'hydro-<effort>', light: 'tiny' }, efforts: ['low', 'medium', 'high', 'xhigh'] };

// PACT-111 C8.
test('an agent whose role maps to a model holding <effort> takes its file’s effort, and one it does not take, or none, refuses', () => {
  const slot = h('slot', SLOTTED);
  const r = render([slot]);
  assert.match(file(r, 'rendered/slot/agents/data-lens.md'), /^model: neon-high$/m);
  assert.match(file(r, 'rendered/slot/agents/scout.md'), /^model: tiny$/m);
  const lens = to => ({ agents: new Map([['data-lens', LENS.replace('effort: high\n', to)]]) });
  refuses(() => render([slot], lens('effort: max\n')), 'agent-effort');
  refuses(() => render([slot], lens('')), 'agent-effort');
  // With no efforts named, the harness takes all five.
  assert.match(file(render([h('slot', { ...SLOTTED, efforts: null })], lens('effort: "max"\n')), 'rendered/slot/agents/data-lens.md'), /^model: neon-max$/m);
});

// PACT-111 C8.
test('a table cell at an effort the harness does not take warns, naming the tier, stage and effort and never the model', () => {
  const rules = TIERED.replace('| a spec | planning model, medium |', '| a spec | planning model, max |')
    .replace('| Build | executor model, low |', '| Build | light model, max |')
    .replace('| Test | executor model, low |', '| Test | executor model, max |');
  assert.deepEqual(tiered(h('slot', SLOTTED), rules).warnings.filter(l => l.includes('effort')), [
    'slot: its tables give Standard Plan the effort max, which it does not take',
    'slot: its tables give Quick Test the effort max, which it does not take',
  ]);
  // With no efforts named, the harness takes all five.
  assert.deepEqual(tiered(h('slot', { ...SLOTTED, efforts: null }), rules).warnings.filter(l => l.includes('effort')), []);
});

// PACT-111 C1.
test('an agentModels key naming no pact agent warns', () => {
  const w = render([h('mine', { agentModels: { '*': 'a', scout: 'b', 'data-lense': 'c' } })]).warnings.filter(l => l.includes('agentModels'));
  assert.deepEqual(w, ['mine: agentModels names data-lense, which is no agent of the pact']);
});

// PACT-111 C5.
test('Codex’s agent files, rendered from its known description, keep their bytes', () => {
  const r = render([known('codex')]);
  const off = '\n\n[features]\napps = false\nplugins = false\nmemories = false\nrequest_permissions_tool = false\n';
  assert.equal(file(r, 'rendered/codex/agents/data-lens.toml'), `name = "data-lens"\ndescription = "Reads for leaks. Not for \\"style\\"."\nmodel = "gpt-6.2-sol"\nmodel_reasoning_effort = "high"\ndeveloper_instructions = '''\n${SHELL_READS}\n\n# data-lens\n\nRead.\n'''${off}`);
  assert.equal(file(r, 'rendered/codex/agents/scout.toml'), `name = "scout"\ndescription = "Searches."\nmodel = "gpt-6.2-sol"\nmodel_reasoning_effort = "medium"\ndeveloper_instructions = '''\n${SHELL_READS}\n\n# scout\n'''${off}`);
});
