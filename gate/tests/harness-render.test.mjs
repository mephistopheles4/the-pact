// What each harness receives (spec 0007 S6, S7): C5-C9 and C29, over the pure
// render in gate/harness-render.mjs. neutral-home.test.mjs runs it in a real
// install.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderHarnesses } from '../harness-render.mjs';
import { agent } from './text.mjs';

const h = (id, over = {}) => ({
  id,
  name: id,
  rules: { path: `.${id}/RULES.md`, cap: null, sharedCap: null },
  agents: { dir: `.${id}/agents`, format: 'claude-md' },
  skills: null,
  commands: null,
  models: { planning: `${id}-plan`, executor: `${id}-exec`, light: `${id}-light` },
  capabilities: ['subagents'],
  ...over,
});
const CLAUDE = h('claude', { name: 'Claude Code', commands: { dir: '.claude/commands' }, models: { planning: 'opus', executor: 'sonnet', light: 'haiku' }, capabilities: ['subagents', 'cleaner', 'archive'] });
const CODEX = h('codex', { agents: { dir: '.codex/agents', format: 'codex-toml' }, skills: { dir: '.agents/skills' }, models: { planning: 'sol', executor: 'astra', light: null }, capabilities: ['subagents', 'explicit-skills'] });
const ANTI = h('antigravity', { agents: { dir: '.gemini/config/agents', format: 'antigravity-md' }, skills: { dir: '.gemini/config/skills' }, models: { planning: 'pro', executor: 'flash', light: 'flash' } });

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

test('a conditional block that does not close, or names no capability the pact knows, refuses', () => {
  refuses(() => render([CLAUDE], { rules: '<!-- pact:if cleaner -->\nx\n' }), 'render-block');
  refuses(() => render([CLAUDE], { rules: '<!-- pact:end -->\n' }), 'render-block');
  refuses(() => render([CLAUDE], { rules: '<!-- pact:if cleener -->\nx\n<!-- pact:end -->\n' }), 'render-block');
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

test('C5: a codex-toml agent maps role and effort, drops tools, and a lens turns off what it may not use', () => {
  const r = render([CODEX]);
  assert.equal(
    file(r, 'rendered/codex/agents/data-lens.toml'),
    `name = "data-lens"\ndescription = "Reads for leaks. Not for \\"style\\"."\nmodel = "sol"\nmodel_reasoning_effort = "high"\ndeveloper_instructions = '''\n# data-lens\n\nRead.\n'''\n\n[features]\napps = false\nplugins = false\nmemories = false\nrequest_permissions_tool = false\n`,
  );
  const scout = file(r, 'rendered/codex/agents/scout.toml');
  assert.match(scout, /^model = "astra"$/m);
  assert.doesNotMatch(scout, /\[features\]|tools/);
  refuses(() => render([CODEX], { agents: new Map([['scout', SCOUT.replace('# scout', "a ''' b")]]) }), 'agent-toml');
});

test('C5: an antigravity-md agent maps its tools, drops effort, and warns on each tool it has no name for', () => {
  const r = render([ANTI]);
  assert.equal(file(r, 'rendered/antigravity/agents/data-lens.md'), agent(['name: data-lens', 'description: Reads for leaks. Not for "style".', 'model: pro', 'tools: [view_file, find_by_name, grep_search]'], '# data-lens\n\nRead.\n'));
  assert.match(r.warnings.join('\n'), /^antigravity: data-lens loses the tool WebFetch/m);
});

test('C5: an antigravity agent whose tools come out empty or lose a read tool refuses', () => {
  const only = table => render([ANTI], { tables: { 'antigravity-md': table } });
  refuses(() => only({ Bash: 'run_command' }), 'agent-tools');
  for (const gone of ['Read', 'Glob', 'Grep']) refuses(() => only(Object.fromEntries(Object.entries(TABLE).filter(([k]) => k !== gone))), 'agent-tools');
  // No tools line may mean every tool.
  refuses(() => render([ANTI], { agents: new Map([['data-lens', LENS.replace('tools: [Read, Glob, Grep, WebFetch]\n', '')]]) }), 'agent-tools');
});

test('an antigravity harness takes no agents while the pact has no tool names for it', () => {
  const r = render([ANTI], { tables: undefined });
  assert.deepEqual([...r.files.keys()].filter(k => k.startsWith('rendered/antigravity/agents/')), []);
});

test('C9: commands stay commands where there is a commands folder, with the blocks resolved', () => {
  const r = render([CLAUDE]);
  assert.equal(file(r, 'rendered/claude/commands/finis.md'), command('finis', 'Check.\nArchive it.\n'));
  assert.deepEqual([...r.files.keys()].filter(k => k.startsWith('rendered/skills/')), []);
});

test('C9: every command becomes a skill where there is a skills folder, kept from the model where a harness allows', () => {
  const r = render([CODEX, ANTI]);
  assert.equal(file(r, 'rendered/skills/finis/SKILL.md'), '---\nname: finis\ndescription: The finis answer.\n---\n\n# /finis\n\nCheck.\nNothing is outstanding; close this session.\n');
  for (const name of COMMANDS.keys()) assert.equal(file(r, `rendered/skills/${name}/agents/openai.yaml`), 'policy:\n  allow_implicit_invocation: false\n');
  assert.deepEqual([...render([ANTI]).files.keys()].filter(k => k.endsWith('openai.yaml')), []);
  assert.deepEqual([...r.files.keys()].filter(k => k.includes('/commands/')), []);
});

test('C7: the one shared skill folder holds a capability block only when every harness that reads it has the capability', () => {
  const some = h('other', { skills: { dir: '.other/skills' }, capabilities: ['archive'] });
  assert.match(file(render([some]), 'rendered/skills/finis/SKILL.md'), /Archive it\./);
  const mixed = file(render([some, CODEX]), 'rendered/skills/finis/SKILL.md');
  assert.doesNotMatch(mixed, /Archive it\.|Nothing is outstanding/);
});

test('C8: a model named outright warns in each harness but Claude Code, unless it is that harness’s own', () => {
  const named = { rules: `${RULES}Plan on Opus, build on Sonnet.\n`, agents: new Map([['scout', SCOUT.replace('model: light', 'model: my-model')]]) };
  const w = render([CLAUDE, CODEX, h('own', { models: { planning: 'opus', executor: 'my-model', light: null } })], named).warnings.filter(l => l.includes('names model'));
  assert.deepEqual(w.sort(), [
    '`.codex/RULES.md` names model `Opus`, which codex may not have',
    '`.codex/RULES.md` names model `Sonnet`, which codex may not have',
    '`.codex/agents/scout.toml` names model `my-model`, which codex may not have',
    '`.own/RULES.md` names model `Sonnet`, which own may not have',
  ].map(l => l.replace('.codex/RULES.md', CODEX.rules.path)).sort());
  assert.match(file(render([CODEX], named), 'rendered/codex/agents/scout.toml'), /^model = "my-model"$/m);
});
