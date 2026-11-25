// The harness descriptions (spec 0007 S5): which harnesses a person's machine
// has, which the install takes, and the checks on a person's own entries
// (C2, C4). Pure decisions, in-process; nothing here installs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import * as h from '../harnesses.mjs';
import { Refusal } from '../install-core.mjs';
import { REPO } from './text.mjs';

const KNOWN_TEXT = readFileSync(join(REPO, 'harnesses', 'known.json'), 'utf8');
const HOME = '/home/user';
const resolve = (own = [], opts = {}) => h.resolveHarnesses({ known: h.parseKnown(KNOWN_TEXT), own, home: HOME, platform: 'linux', inWorkTree: () => false, ...opts });
const byId = (list, id) => list.find(x => x.id === id);
/** The rule id `fn` refuses with. */
function rule(fn) {
  try {
    fn();
  } catch (e) {
    if (e instanceof Refusal) return e.rule;
    throw e;
  }
  return null;
}
const OWN = Object.freeze({ id: 'mine', name: 'Mine', detect: '~/.mine', rules: { path: '~/.mine/RULES.md' }, agents: { dir: '~/.mine/agents', format: 'claude-md' } });

test('known.json describes claude, codex and antigravity as spec 0007 S5 tables them', () => {
  const list = resolve();
  assert.deepEqual(list.map(x => x.id), ['claude', 'codex', 'antigravity']);
  const claude = byId(list, 'claude');
  assert.equal(claude.detect, '.claude');
  assert.deepEqual(claude.rules, { path: '.claude/CLAUDE.md', cap: null, sharedCap: null });
  assert.deepEqual(claude.agents, { dir: '.claude/agents', format: 'claude-md' });
  assert.deepEqual(claude.commands, { dir: '.claude/commands' });
  assert.equal(claude.skills, null);
  assert.deepEqual(claude.hooks, { file: '.claude/settings.json', format: 'claude' });
  assert.deepEqual(claude.models, { planning: 'opus', executor: 'sonnet', light: 'haiku' });
  assert.deepEqual(claude.capabilities, ['subagents', 'tool-limits', 'cleaner', 'archive', 'native-rules']);
  assert.equal(claude.defaultInstall, true);
  const codex = byId(list, 'codex');
  assert.deepEqual([codex.detect, codex.rules, codex.agents, codex.skills, codex.hooks], ['.codex', { path: '.codex/AGENTS.md', cap: null, sharedCap: 32768 }, { dir: '.codex/agents', format: 'codex-toml' }, { dir: '.agents/skills' }, { file: '.codex/hooks.json', format: 'codex' }]);
  assert.deepEqual(codex.models, { planning: 'gpt-6.2-sol', executor: 'gpt-6.2-astra', light: null });
  assert.deepEqual(codex.capabilities, ['subagents', 'hook-trust', 'explicit-skills']);
  assert.equal(codex.commands, null);
  const anti = byId(list, 'antigravity');
  assert.deepEqual([anti.detect, anti.rules, anti.agents, anti.skills, anti.hooks], ['.gemini/config', { path: '.gemini/AGENTS.md', cap: 24000, sharedCap: null }, { dir: '.gemini/config/agents', format: 'antigravity-md' }, { dir: '.gemini/config/skills' }, { file: '.gemini/config/hooks.json', format: 'antigravity' }]);
  assert.deepEqual(anti.models, { planning: 'pro', executor: 'flash', light: 'flash' });
  assert.deepEqual(anti.capabilities, ['subagents', 'tool-limits', 'hook-ask']);
});

test('an own harness is described from the pact\'s formats, its paths turned home-relative', () => {
  const mine = byId(resolve([{ ...OWN, rules: { path: '/home/user/.mine/RULES.md', cap: 100 } }]), 'mine');
  assert.equal(mine.own, true);
  assert.deepEqual(mine.rules, { path: '.mine/RULES.md', cap: 100, sharedCap: null });
  assert.deepEqual(mine.agents, { dir: '.mine/agents', format: 'claude-md' });
  assert.equal(mine.hooks, null);
});

test('an own entry with a known id overrides it field by field and names each field', () => {
  const claude = byId(resolve([{ id: 'claude', rules: { path: '~/dot/CLAUDE.md' } }]), 'claude');
  assert.deepEqual(claude.overrides, ['rules']);
  assert.equal(claude.rules.path, 'dot/CLAUDE.md');
  assert.deepEqual(claude.agents, { dir: '.claude/agents', format: 'claude-md' });
});

test('bad case: each wrong own entry refuses under its rule', () => {
  const cases = [
    ['harness-id', [{ ...OWN, id: 'Mine' }]],
    ['harness-id', [{ ...OWN, id: `a${'b'.repeat(32)}` }]],
    ['harness-id', [{ ...OWN, id: 'pact' }]],
    ['harness-id', [OWN, OWN]],
    ['harness-format', [{ ...OWN, agents: { dir: '~/.mine/agents', format: 'yaml' } }]],
    ['harness-format', [{ ...OWN, hooks: { file: '~/.mine/hooks.json', format: 'other' } }]],
    ['harness-format', [{ ...OWN, capabilities: ['flies'] }]],
    ['harness-field', [{ ...OWN, shell: 'sh' }]],
    ['harness-field', [{ ...OWN, rules: { path: '~/.mine/RULES.md', mode: 1 } }]],
    ['harness-shape', ['mine']],
    ['harness-shape', [{ id: 'mine', name: 'Mine', detect: '~/.mine' }]],
    ['harness-shape', [{ ...OWN, rules: '~/.mine/RULES.md' }]],
    ['harness-shape', [{ ...OWN, name: 'two\nlines' }]],
    ['harness-shape', [{ ...OWN, rules: { path: '~/.mine/RULES.md', cap: -1 } }]],
    ['harness-shape', [{ ...OWN, models: { planning: 'two words', executor: 'x' } }]],
    ['harness-path', [{ ...OWN, rules: { path: '.mine/RULES.md' } }]],
    ['harness-path', [{ ...OWN, rules: { path: '/etc/RULES.md' } }]],
    // A neighbour whose name only starts with the home folder's, built so no tracked line holds a home path.
    ['harness-path', [{ ...OWN, rules: { path: `${HOME}name/RULES.md` } }]],
    ['harness-path', [{ ...OWN, rules: { path: '~/.mine/../../other/RULES.md' } }]],
    ['harness-path', [{ ...OWN, rules: { path: '~' } }]],
    ['harness-path', [{ ...OWN, detect: '/home/user' }]],
    ['harness-path', [{ ...OWN, rules: { path: '~/.pact/RULES.md' } }]],
    ['harness-path', [{ ...OWN, agents: { dir: '~/.PACT', format: 'claude-md' } }]],
    ['harness-path', [{ ...OWN, rules: { path: '~/.mine/RU LES.md' } }]],
    ['harness-path', [{ ...OWN, rules: { path: '~/.mine./RULES.md' } }]],
    ['harness-path', [{ ...OWN, rules: { path: '~/.mine/profile' } }]],
    ['harness-path', [{ ...OWN, hooks: { file: '~/.mine/hooks.yml', format: 'claude' } }]],
    ['harness-path', [{ ...OWN, agents: { dir: '~/.ssh', format: 'claude-md' } }]],
    ['harness-path', [{ id: 'claude', hooks: { file: '~/.gemini/oauth_creds.json', format: 'claude' } }]],
    ['harness-path', [{ ...OWN, hooks: { file: '~/.claude.json', format: 'claude' } }]],
    ['harness-path', [{ ...OWN, hooks: { file: '~/.claude/.Credentials.json', format: 'claude' } }]],
  ];
  for (const [want, own] of cases) assert.equal(rule(() => resolve(own)), want, JSON.stringify(own));
});

test('bad case: a known.json that is not a list of descriptions refuses', () => {
  for (const bad of ['nope', '{}', '[1]', '[{"id": "Bad"}]']) assert.equal(rule(() => h.parseKnown(bad)), 'harness-known', bad);
});

test('bad case: an own path inside a git work tree refuses, and so does an overridden known path', () => {
  const inWorkTree = p => p.startsWith('/home/user/repo');
  assert.equal(rule(() => resolve([{ ...OWN, rules: { path: '~/repo/RULES.md' } }], { inWorkTree })), 'harness-path');
  assert.equal(rule(() => resolve([{ id: 'claude', agents: { dir: '~/repo/agents', format: 'claude-md' } }], { inWorkTree })), 'harness-path');
  // The pact's own descriptions are not held to it: a person's ~/.claude may be a dotfiles repo.
  assert.equal(rule(() => resolve([], { inWorkTree: () => true })), null);
});

test('on Windows an own path is matched to the home folder without regard to case or slash', () => {
  const list = resolve([{ ...OWN, detect: 'c:\\users\\USER\\.mine', rules: { path: 'C:/Users/user/.mine/RULES.md' }, agents: undefined }], { home: 'C:\\Users\\user', platform: 'win32' });
  assert.equal(byId(list, 'mine').detect, '.mine');
});

test('the configuration\'s harnesses key gives the install list and the own entries; none is no list', () => {
  assert.deepEqual(h.configHarnesses(null), { install: null, own: [] });
  assert.deepEqual(h.configHarnesses('{"schema": 1}'), { install: null, own: [] });
  assert.deepEqual(h.configHarnesses(JSON.stringify({ harnesses: { own: [OWN] } })), { install: null, own: [{ ...OWN }] });
  assert.deepEqual(h.configHarnesses('{"harnesses": {"install": []}}'), { install: [], own: [] });
});

test('bad case: a harnesses key of the wrong shape refuses', () => {
  for (const bad of ['nope', '{"harnesses": []}', '{"harnesses": {"extra": 1}}', '{"harnesses": {"install": "claude"}}', '{"harnesses": {"install": ["claude", "claude"]}}', '{"harnesses": {"install": ["NO"]}}', '{"harnesses": {"own": {}}}']) {
    assert.equal(rule(() => h.configHarnesses(bad)), 'harness-shape', bad);
  }
});

// ------------------------------------------------------------ which harnesses the install takes

const choose = ({ own = [], install = null, detected = [], recorded = [] } = {}) => h.chooseHarnesses({ harnesses: resolve(own), install, detected: new Set(detected), recorded });
const state = r => Object.fromEntries(r.rows.map(x => [x.id, x.in]));

test('with no install list, every detected known harness is in, and a harness that is not detected is not listed', () => {
  const r = choose({ detected: ['claude', 'codex'] });
  assert.deepEqual(state(r), { claude: true, codex: true });
  assert.deepEqual(r.warnings, []);
});

test('a detected harness with defaultInstall false is listed and out, until the list names it', () => {
  const own = [{ id: 'antigravity', defaultInstall: false }];
  assert.deepEqual(state(choose({ own, detected: ['antigravity'] })), { antigravity: false });
  assert.deepEqual(state(choose({ own, detected: ['antigravity'], install: ['antigravity'] })), { antigravity: true });
});

test('with a list, only the listed ids are in; an own harness is always listed and in only when named', () => {
  assert.deepEqual(state(choose({ own: [OWN], detected: ['claude', 'codex'] })), { claude: true, codex: true, mine: false });
  assert.deepEqual(state(choose({ own: [OWN], detected: ['claude', 'codex'], install: ['mine'] })), { claude: false, codex: false, mine: true });
});

test('a listed harness that is not detected is in, with a warning', () => {
  const r = choose({ detected: [], install: ['claude'] });
  assert.deepEqual(state(r), { claude: true });
  assert.match(r.warnings.join('\n'), /claude.*not found/);
});

test('a recorded harness whose detect folder is gone stays in with a warning, and a list that leaves it out takes it out', () => {
  const stays = choose({ recorded: ['codex'], detected: ['claude'] });
  assert.deepEqual(state(stays), { claude: true, codex: true });
  assert.match(stays.warnings.join('\n'), /codex.*gone/);
  const out = choose({ recorded: ['codex'], detected: ['claude'], install: ['claude'] });
  assert.deepEqual(state(out), { claude: true, codex: false });
});

test('an empty install list takes every harness out', () => {
  assert.deepEqual(state(choose({ detected: ['claude'], recorded: ['claude'], install: [] })), { claude: false });
});

test('bad case: a listed id nothing describes refuses; a recorded one nothing describes refuses unless a list leaves it out', () => {
  assert.equal(rule(() => choose({ install: ['nope'] })), 'harness-unknown');
  assert.equal(rule(() => choose({ recorded: ['gone'], detected: ['claude'] })), 'harness-gone');
  const out = choose({ recorded: ['gone'], detected: ['claude'], install: ['claude'] });
  assert.deepEqual(state(out), { claude: true, gone: false });
});
