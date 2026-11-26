// What each harness receives (spec 0007 S6, S7): C5-C9 and C29, over the pure
// render in gate/harness-render.mjs. neutral-home.test.mjs runs it in a real
// install.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderHarnesses } from '../harness-render.mjs';
import { realAgents } from './payload.mjs';
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
    `name = "data-lens"\ndescription = "Reads for leaks. Not for \\"style\\"."\nmodel = "sol"\nmodel_reasoning_effort = "high"\ndeveloper_instructions = '''\n# data-lens\n\nRead.\n'''\n\n[features]\napps = false\nplugins = false\nmemories = false\nrequest_permissions_tool = false\n`,
  );
  const scout = file(r, 'rendered/codex/agents/scout.toml');
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
