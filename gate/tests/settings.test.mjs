// The settings guard (#34): seam A holds the settings overlay to an exact
// allow-list. The install's side, the merge and its warnings, is in
// settings-install.test.mjs; the rule lists both use are in settings-rules.mjs.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import * as core from '../install-core.mjs';
import { moduleFiles, moduleMatch } from './gate-files.mjs';
import { runSeamA } from './gate-run.mjs';
import { realOverlay, stage } from './payload.mjs';
import { GATE, REPO, failRules, lastLine } from './text.mjs';
import { tempDir } from './tree.mjs';
import { APPLY_ASK, APPLY_COMMANDS, BACKUP_ASK, BROAD_INSTALL_ASK, CROSS_ASK, DASHES, MENTION_COMMANDS, OVERLAY, PACT_ASK, RETIRED_OLD_INSTALL_ASK, RETIRED_OLD_INSTALL_NAME, asks, overlayWith, shown } from './settings-rules.mjs';
import { moduleResult, table } from './tables.mjs';

const ALLOWLIST = 'gate/settings-allowlist.json';

// Command-running settings, refused by name in seam A's own code.
const BANNED = [
  'hooks',
  'mcpServers',
  'statusLine',
  'fileSuggestion',
  'apiKeyHelper',
  'awsAuthRefresh',
  'awsCredentialExport',
  'otelHeadersHelper',
  'enabledPlugins',
  'extraKnownMarketplaces',
  'enableAllProjectMcpServers',
  'enabledMcpjsonServers',
];

function checkOverlay(t, text, prep) {
  const root = stage(t, { [OVERLAY]: text });
  if (prep) prep(root);
  return runSeamA(root);
}

function expectSettingsFail(t, text, rule, script) {
  const root = stage(t, { [OVERLAY]: text });
  const r = runSeamA(root, script);
  assert.equal(lastLine(r.stdout), 'RESULT: fail', r.out);
  assert.notEqual(r.code, 0, r.out);
  assert.ok(failRules(r.stdout).includes(rule), `expected rule "${rule}" in:\n${r.out}`);
  assert.doesNotMatch(r.stdout, /^SETTINGS /m, r.out);
  return r;
}

/** The rules among `rules` holding a character outside printable ASCII. */
function nonAsciiRules(rules) {
  return rules.filter(r => [...r].some(c => c < ' ' || c > '~'));
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

/** A copy of the gate (all but its tests), with `edit` applied, so a test can tamper with an allow-list. */
function gateCopy(t, edit) {
  const g = tempDir(t);
  const tests = join(GATE, 'tests');
  cpSync(GATE, g, { recursive: true, filter: src => src !== tests });
  edit(g);
  return join(g, 'seam-a.mjs');
}

function editSettingsAllowlist(g, edit) {
  const p = join(g, 'settings-allowlist.json');
  const doc = JSON.parse(readFileSync(p, 'utf8'));
  edit(doc);
  writeFileSync(p, JSON.stringify(doc));
}

// ------------------------------------------------------------ seam A: today's overlay

test("today's overlay holds the pact's ask rules and auto mode, and passes", t => {
  const o = JSON.parse(realOverlay());
  assert.deepEqual([...o.permissions.ask].sort(), [...PACT_ASK].sort());
  assert.equal(o.permissions.defaultMode, 'auto');
  const r = runSeamA(stage(t));
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^PASS settings: claude\/settings\.overlay\.json$/m);
  assert.doesNotMatch(r.stdout, /not checked until #34/);
});

test('a passing check prints exactly one SETTINGS line, with the hash of the overlay it checked', t => {
  const r = runSeamA(stage(t));
  const lines = r.stdout.split('\n').filter(l => l.startsWith('SETTINGS '));
  assert.deepEqual(lines, [`SETTINGS ${sha256(realOverlay())} claude/settings.overlay.json`]);
  const all = r.stdout.split('\n');
  assert.ok(all.indexOf(lines[0]) < all.indexOf('RESULT: pass'), r.out);
});

// ------------------------------------------------------------ seam A: banned names

/** A plant setting the banned top-level key `k` in the overlay. */
const banned = k => tree => {
  const o = JSON.parse(tree[OVERLAY]);
  o[k] = k === 'hooks' ? { PreToolUse: [] } : 'x';
  return { [OVERLAY]: `${JSON.stringify(o, null, 2)}\n` };
};
for (const c of table('banned settings in the overlay', {
  module: 'gate/seam-a.mjs',
  base: () => ({ [OVERLAY]: realOverlay() }),
  run: (tree, t) => {
    const r = runSeamA(stage(t, { [OVERLAY]: tree[OVERLAY] }));
    return moduleResult(r.code, r.stdout);
  },
  everyRow: r => assert.doesNotMatch(r.out, /^SETTINGS /m, r.out),
  rows: [
    { id: 'hooks', plant: banned('hooks'), fails: ['settings-banned'], says: /\(hooks\)/, why: 'hooks run commands' },
    { id: 'mcp-servers', plant: banned('mcpServers'), fails: ['settings-banned'], says: /\(mcpServers\)/, why: 'an MCP server runs a command' },
    { id: 'status-line', plant: banned('statusLine'), fails: ['settings-banned'], says: /\(statusLine\)/, why: 'a status line runs a command' },
    { id: 'file-suggestion', plant: banned('fileSuggestion'), fails: ['settings-banned'], says: /\(fileSuggestion\)/, why: 'file suggestion runs a command' },
    { id: 'api-key-helper', plant: banned('apiKeyHelper'), fails: ['settings-banned'], says: /\(apiKeyHelper\)/, why: 'a key helper runs a command' },
    { id: 'aws-auth-refresh', plant: banned('awsAuthRefresh'), fails: ['settings-banned'], says: /\(awsAuthRefresh\)/, why: 'an auth refresh runs a command' },
    { id: 'aws-credential-export', plant: banned('awsCredentialExport'), fails: ['settings-banned'], says: /\(awsCredentialExport\)/, why: 'a credential export runs a command' },
    { id: 'otel-headers-helper', plant: banned('otelHeadersHelper'), fails: ['settings-banned'], says: /\(otelHeadersHelper\)/, why: 'a headers helper runs a command' },
    { id: 'enabled-plugins', plant: banned('enabledPlugins'), fails: ['settings-banned'], says: /\(enabledPlugins\)/, why: 'a plugin can carry hooks' },
    { id: 'extra-known-marketplaces', plant: banned('extraKnownMarketplaces'), fails: ['settings-banned'], says: /\(extraKnownMarketplaces\)/, why: 'a marketplace supplies plugins' },
    { id: 'enable-all-project-mcp-servers', plant: banned('enableAllProjectMcpServers'), fails: ['settings-banned'], says: /\(enableAllProjectMcpServers\)/, why: "a project's MCP servers run commands" },
    { id: 'enabled-mcpjson-servers', plant: banned('enabledMcpjsonServers'), fails: ['settings-banned'], says: /\(enabledMcpjsonServers\)/, why: "an .mcp.json server runs a command" },
  ],
})) test(c.name, c.fn);

test('the banned-settings table has a row for each banned name', () => {
  const src = readFileSync(join(GATE, 'tests', 'settings.test.mjs'), 'utf8');
  for (const k of BANNED) assert.ok(src.includes(`banned('${k}')`), k);
});

test('bad case: a banned name nested inside an allowed key fails', t => {
  expectSettingsFail(t, overlayWith(o => (o.permissions.hooks = {})), 'settings-banned');
});

test('bad case: a banned name spelled with an escape fails', t => {
  const text = realOverlay().replace('{', '{\n  "hook\\u0073": {},');
  expectSettingsFail(t, text, 'settings-banned');
});

test('a banned name inside a string value is not a banned key', t => {
  const r = expectSettingsFail(t, overlayWith(o => (o.outputStyle = 'hooks')), 'settings-value');
  assert.ok(!failRules(r.stdout).includes('settings-banned'), r.out);
});

test('bad case: an allow-list that lists a banned name is refused, and the name stays banned', t => {
  const script = gateCopy(t, g => editSettingsAllowlist(g, doc => (doc.hooks = {})));
  const r = expectSettingsFail(t, overlayWith(o => (o.hooks = {})), 'settings-banned', script);
  assert.ok(failRules(r.stdout).includes('settings-allowlist'), r.out);
});

// ------------------------------------------------------------ seam A: the mode

test('bad case: defaultMode bypassPermissions fails', t => {
  expectSettingsFail(t, overlayWith(o => (o.permissions.defaultMode = 'bypassPermissions')), 'settings-mode');
});

test('bad case: defaultMode bypassPermissions fails even when the allow-list permits it', t => {
  const script = gateCopy(t, g => editSettingsAllowlist(g, doc => (doc['permissions.defaultMode'] = 'bypassPermissions')));
  expectSettingsFail(t, overlayWith(o => (o.permissions.defaultMode = 'bypassPermissions')), 'settings-mode', script);
});

test('bad case: defaultMode spelled Auto, or as a list, fails', t => {
  expectSettingsFail(t, overlayWith(o => (o.permissions.defaultMode = 'Auto')), 'settings-mode');
  expectSettingsFail(t, overlayWith(o => (o.permissions.defaultMode = ['auto'])), 'settings-mode');
});

// ------------------------------------------------------------ seam A: default-deny

test('bad case: an unlisted env name fails', t => {
  expectSettingsFail(t, overlayWith(o => (o.env.NODE_OPTIONS = '--require=x')), 'settings-unlisted');
});

test('bad case: a listed env name with another value fails', t => {
  expectSettingsFail(t, overlayWith(o => (o.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = '0')), 'settings-value');
});

test('bad case: an unlisted nested path fails', t => {
  expectSettingsFail(t, overlayWith(o => (o.permissions.additionalDirectories = ['C:/'])), 'settings-unlisted');
});

test('bad case: an unknown top-level key fails', t => {
  expectSettingsFail(t, overlayWith(o => (o.someNewSetting = true)), 'settings-unlisted');
});

test('bad case: __proto__ and constructor keys fail', t => {
  expectSettingsFail(t, realOverlay().replace('{', '{\n  "__proto__": {"outputStyle": "x"},'), 'settings-unlisted');
  expectSettingsFail(t, overlayWith(o => (o.constructor = 'x')), 'settings-unlisted');
});

test('bad case: a key outside letters, digits and _ fails', t => {
  expectSettingsFail(t, overlayWith(o => (o.env['A-B'] = '1')), 'settings-key');
});

test('bad case: a value of the wrong type fails', t => {
  expectSettingsFail(t, overlayWith(o => (o.showThinkingSummaries = 'true')), 'settings-value');
});

test('bad case: fallbackModel in another order fails', t => {
  expectSettingsFail(t, overlayWith(o => o.fallbackModel.reverse()), 'settings-value');
});

test('bad case: an allow entry the allow-list does not hold fails', t => {
  expectSettingsFail(t, overlayWith(o => (o.permissions.allow = ['PowerShell(*)'])), 'settings-value');
});

// ------------------------------------------------------------ seam A: the ask rules

test("bad case: an ask list missing one of the pact's rules fails", t => {
  expectSettingsFail(t, overlayWith(o => o.permissions.ask.pop()), 'settings-required');
});

// The install's rules are the same spreads in both lists, so this guards the
// lists' shape; the per-rule cases below and the overlay comparison above
// cover each rule.
test("the apply-step rules are all among the pact's rules", () => {
  for (const rule of APPLY_ASK) assert.ok(PACT_ASK.includes(rule), shown(rule));
});

// One test per rule, so a red run shows every rule that seam A doesn't hold.
for (const rule of APPLY_ASK) {
  test(`bad case: the apply-step rule ${shown(rule)} stays required when both the allow-list and the overlay drop it`, t => {
    const script = gateCopy(t, g => editSettingsAllowlist(g, doc => (doc['permissions.ask'] = doc['permissions.ask'].filter(x => x !== rule))));
    expectSettingsFail(t, overlayWith(o => (o.permissions.ask = o.permissions.ask.filter(x => x !== rule))), 'settings-required', script);
  });
}

// Near misses of the required rules (#34, #89, #210): each put in place of the
// rule it resembles, in both the allow-list and the overlay, and seam A still
// fails it as missing, so no near miss stands in for a required rule. A splat
// with a space for the no-space splat (a space is the narrower rule), on each
// of the Node installer's names (Bash has no splat rule); and a retired broad
// rule, which seam A no longer asks for, in place of the rule that replaced it.
const SPLAT_RULES = ['PowerShell(*install.mjs*@*)', 'PowerShell(*install-run.mjs*@*)'];
const spaced = rule => rule.replace('*@', '* @');
/** A plant putting `to` in place of the required rule `from`, in both files. */
const swapIn = (from, to) => tree => {
  const put = text => {
    const doc = JSON.parse(text);
    const list = doc.permissions?.ask ?? doc['permissions.ask'];
    const i = list.indexOf(from);
    assert.ok(i >= 0, shown(from));
    list[i] = to;
    return `${JSON.stringify(doc, null, 2)}\n`;
  };
  return { [OVERLAY]: put(tree[OVERLAY]), [ALLOWLIST]: put(tree[ALLOWLIST]) };
};
/** Today's overlay and allow-list, as a table's base. */
const bothFiles = () => ({ [OVERLAY]: realOverlay(), [ALLOWLIST]: readFileSync(join(GATE, 'settings-allowlist.json'), 'utf8') });
/** Seam A run on a tree's overlay, with the tree's allow-list in a copy of the gate. */
const runBoth = (tree, t) => {
  const script = gateCopy(t, g => writeFileSync(join(g, 'settings-allowlist.json'), tree[ALLOWLIST]));
  const r = runSeamA(stage(t, { [OVERLAY]: tree[OVERLAY] }), script);
  return moduleResult(r.code, r.stdout);
};
for (const c of table('near misses of the required rules', {
  module: 'gate/seam-a.mjs',
  base: bothFiles,
  run: runBoth,
  rows: [
    { id: 'splat-with-space-install-mjs', plant: swapIn(SPLAT_RULES[0], spaced(SPLAT_RULES[0])), fails: ['settings-required'], why: 'a splat that needs a space before it misses one after another separator (ADR 0020, miss d)' },
    { id: 'splat-with-space-install-run-mjs', plant: swapIn(SPLAT_RULES[1], spaced(SPLAT_RULES[1])), fails: ['settings-required'], why: 'the same, after the runner' },
    { id: 'broad-for-name-free-flag', plant: swapIn('PowerShell(*--apply*)', BROAD_INSTALL_ASK[2]), fails: ['settings-required'], why: 'a retired broad rule does not stand in for the name-free flag rule' },
  ],
})) test(c.name, c.fn);

// ------------------------------------------------------------ seam A: the old installer's rules stay out (#217)

test("no ask rule in the overlay or the allow-list names the old installer", () => {
  const allow = JSON.parse(readFileSync(join(GATE, 'settings-allowlist.json'), 'utf8'))['permissions.ask'];
  const overlay = JSON.parse(realOverlay()).permissions.ask;
  const named = rules => rules.filter(r => r.toLowerCase().includes(RETIRED_OLD_INSTALL_NAME));
  assert.deepEqual(named(overlay), []);
  assert.deepEqual(named(allow), []);
  assert.deepEqual(named(PACT_ASK), []);
});

// Seam A passes today's overlay, which holds none of the old rules (the first
// test of this file, and this table's base). The rows show that check can
// fail: a seam A that still required an old rule refuses today's overlay.
const SEAM_CORE = 'gate/seam-a-core.mjs';
const APPLY_LIST = 'const SETTINGS_APPLY_ASK = Object.freeze([';
/** A plant putting `rule` back at the head of seam A's required list. */
const requireAgain = rule => tree => {
  assert.ok(tree[SEAM_CORE].includes(APPLY_LIST));
  return { [SEAM_CORE]: tree[SEAM_CORE].replace(APPLY_LIST, `${APPLY_LIST}\n  ${JSON.stringify(rule)},`) };
};
for (const c of table('seam a still requiring an old installer rule', {
  module: 'gate/seam-a.mjs',
  base: () => ({ [SEAM_CORE]: readFileSync(join(GATE, 'seam-a-core.mjs'), 'utf8') }),
  run: (tree, t) => {
    const script = gateCopy(t, g => writeFileSync(join(g, 'seam-a-core.mjs'), tree[SEAM_CORE]));
    const r = runSeamA(stage(t), script);
    return moduleResult(r.code, r.stdout);
  },
  rows: [
    { id: 'requires-powershell-rule', plant: requireAgain(RETIRED_OLD_INSTALL_ASK[0]), fails: ['settings-required'], says: /the apply step's ask rules/, why: 'an old PowerShell rule the overlay no longer holds' },
    { id: 'requires-bash-rule', plant: requireAgain(RETIRED_OLD_INSTALL_ASK[1]), fails: ['settings-required'], says: /the apply step's ask rules/, why: 'an old Bash rule the overlay no longer holds' },
  ],
})) test(c.name, c.fn);

// An old rule put back into the overlay alone is a rule outside the
// allow-list. Seam A uses the same id, settings-value, for other faults in a
// rule list, such as a rule listed twice. The control below shows this id
// comes from the allow-list: with the rule on both, it passes.
const addAsk = (rule, ...files) => tree => {
  const out = { ...tree };
  for (const f of files) {
    const doc = JSON.parse(tree[f]);
    const list = doc.permissions?.ask ?? doc['permissions.ask'];
    assert.ok(!list.includes(rule), `${f} already holds ${shown(rule)}`);
    list.push(rule);
    out[f] = `${JSON.stringify(doc, null, 2)}\n`;
  }
  return out;
};
for (const c of table('old installer rules put back', {
  module: 'gate/seam-a.mjs',
  base: bothFiles,
  run: runBoth,
  rows: [
    { id: 'powershell-rule-in-overlay-alone', plant: addAsk(RETIRED_OLD_INSTALL_ASK[0], OVERLAY), fails: ['settings-value'], why: 'an old PowerShell rule the allow-list no longer holds' },
    { id: 'bash-rule-in-overlay-alone', plant: addAsk(RETIRED_OLD_INSTALL_ASK[1], OVERLAY), fails: ['settings-value'], why: 'an old Bash rule the allow-list no longer holds' },
  ],
})) test(c.name, c.fn);

test('control: an old rule put back into both the overlay and the allow-list passes, so the rows above fail for the allow-list', t => {
  for (const rule of RETIRED_OLD_INSTALL_ASK) {
    const r = runBoth(addAsk(rule, OVERLAY, ALLOWLIST)(bothFiles()), t);
    assert.equal(r.code, 0, r.out);
    assert.equal(r.last, 'RESULT: pass', r.out);
  }
});

// ------------------------------------------------------------ the rules against a model of the matcher (#210, S6)

// The model reads Claude Code's documented matching (settings-rules.mjs); it
// can't show what the live matcher does with escapes or wrapped lines.
test('every apply form in the fixtures asks under the overlay\'s rules', () => {
  const rules = JSON.parse(realOverlay()).permissions.ask;
  assert.deepEqual(APPLY_COMMANDS.filter(([tool, cmd]) => !asks(rules, tool, cmd)).map(([, , why]) => why), []);
});

test('every mention, read, search and dry run in the fixtures runs under the overlay\'s rules', () => {
  const rules = JSON.parse(realOverlay()).permissions.ask;
  assert.deepEqual(MENTION_COMMANDS.filter(([tool, cmd]) => asks(rules, tool, cmd)).map(([, , why]) => why), []);
});

test('control: the retired broad rules ask on every mention, so the mention rows can fail', () => {
  assert.deepEqual(MENTION_COMMANDS.filter(([tool, cmd]) => !asks(BROAD_INSTALL_ASK, tool, cmd)).map(([, , why]) => why), []);
});

test('control: an apply split across two statements runs under the per-name rules alone, so the name-free rule is what catches it', () => {
  const split = APPLY_COMMANDS.find(([, , why]) => why === 'the name in one statement and the flag in another');
  const perName = APPLY_ASK.filter(r => !r.endsWith('(*--apply*)'));
  assert.equal(asks(perName, split[0], split[1]), false);
  assert.equal(asks(APPLY_ASK, split[0], split[1]), true);
});

// A rule the same in every copy can still match nothing it should: so each
// rule but the named backups is the one rule some apply row needs (#210,
// round 2). A rule that matched nothing would leave that row running.
test('each install rule but the named backups is the only rule that makes some apply row ask', () => {
  const needed = rule => APPLY_COMMANDS.some(([tool, cmd]) => asks(APPLY_ASK, tool, cmd) && !asks(APPLY_ASK.filter(r => r !== rule), tool, cmd));
  assert.deepEqual(APPLY_ASK.filter(r => !BACKUP_ASK.includes(r) && !needed(r)).map(shown), []);
  for (const rule of BACKUP_ASK) assert.ok(APPLY_ASK.includes(rule), shown(rule));
});

test('control: a rule that matches nothing is caught as needed by no row', () => {
  const broken = APPLY_ASK.map(r => (r === 'PowerShell(*install-run.mjs*@*)' ? 'PowerShell(*install-run.mjs*@@nothing*)' : r));
  const needed = rule => APPLY_COMMANDS.some(([tool, cmd]) => asks(broken, tool, cmd) && !asks(broken.filter(r => r !== rule), tool, cmd));
  assert.equal(needed('PowerShell(*install-run.mjs*@@nothing*)'), false);
  assert.equal(APPLY_COMMANDS.every(([tool, cmd]) => asks(broken, tool, cmd)), false, 'the splat row then runs');
});

test('the model splits on each documented separator, and matches PowerShell without regard to case and Bash exactly', () => {
  for (const sep of ['&&', '||', ';', '|', '&', '\n']) assert.ok(asks(['PowerShell(echo x)'], 'PowerShell', `cd a ${sep} echo x`), JSON.stringify(sep));
  assert.ok(asks(['PowerShell(*abc*)'], 'PowerShell', 'echo ABC'));
  assert.ok(!asks(['Bash(*abc*)'], 'Bash', 'echo ABC'));
  assert.ok(!asks(['Bash(*abc*)'], 'PowerShell', 'echo abc'), 'a rule matches only its own tool');
});

test('every pact ask rule is printable ASCII', () => {
  const allow = JSON.parse(readFileSync(join(GATE, 'settings-allowlist.json'), 'utf8'))['permissions.ask'];
  const overlay = JSON.parse(realOverlay()).permissions.ask;
  assert.deepEqual(nonAsciiRules(allow), []);
  assert.deepEqual(nonAsciiRules(overlay), []);
  assert.deepEqual(nonAsciiRules(PACT_ASK), []);
});

test('bad case: an ask rule with a dash-like or invisible character is caught', () => {
  for (const c of [...DASHES,'\u2010', '\u2212', '\u00ad', '\u200b', '\t']) {
    assert.deepEqual(nonAsciiRules([`Bash(*nstall.mjs*${c}*)`]), [`Bash(*nstall.mjs*${c}*)`], shown(c));
  }
});

test('each dash is written as an escape: the rule files and their code hold no dash character', () => {
  const seam = moduleFiles(GATE, 'seam-a').map(p => `gate/${p.slice(GATE.length + 1)}`);
  const files = ['claude/settings.overlay.json', 'gate/settings-allowlist.json', ...seam, 'gate/tests/settings.test.mjs', 'gate/tests/settings-rules.mjs', 'gate/tests/settings-install.test.mjs'];
  for (const f of files) {
    const text = readFileSync(join(GATE, '..', ...f.split('/')), 'utf8');
    for (const d of DASHES) assert.ok(!text.includes(d), `${f} holds ${shown(d)} as a character`);
  }
  const rules = readFileSync(join(GATE, 'settings-allowlist.json'), 'utf8') + realOverlay();
  assert.ok(/^[\x00-\x7f]*$/.test(rules), 'a rule file holds a byte outside ASCII');
});

// The PowerShell installer had no [CmdletBinding()], so
// $PSDefaultParameterValues could not turn on -Apply (ADR 0020). The Node
// install has no such mechanism: its parser reads the typed words alone, so
// only --apply, spelled exactly, turns it on (#153, S6 rows A2 and A3).
const decided = fn => {
  try {
    fn();
    return { code: 0, fails: [], last: 'RESULT: pass', out: '' };
  } catch (e) {
    if (e instanceof core.Refusal) return { code: 1, fails: [e.rule], last: 'RESULT: fail', out: e.why };
    throw e;
  }
};
for (const c of table('apply only as typed', {
  module: 'gate/install-core.mjs',
  base: () => ({ in: JSON.stringify(['--claude-home', 'C:\\h']) }),
  run: t => decided(() => core.parseArgs(JSON.parse(t.in), 'win32')),
  rows: [
    { id: 'powershell-apply-switch', plant: t => ({ in: JSON.stringify([...JSON.parse(t.in), '-Apply']) }), fails: ['args-unread'], why: "the PowerShell installer's switch is a word the script does not read" },
    { id: 'apply-with-a-value', plant: t => ({ in: JSON.stringify([...JSON.parse(t.in), '--apply=true']) }), fails: ['args-unread'], why: 'nothing but the bare word turns on --apply' },
  ],
})) test(c.name, c.fn);

test("bad case: the cross script's ask rule stays required when both the allow-list and the overlay drop it", t => {
  const script = gateCopy(t, g => editSettingsAllowlist(g, doc => (doc['permissions.ask'] = doc['permissions.ask'].filter(x => x !== CROSS_ASK))));
  const r = expectSettingsFail(t, overlayWith(o => (o.permissions.ask = o.permissions.ask.filter(x => x !== CROSS_ASK))), 'settings-required', script);
  assert.match(r.stdout, /the cross script's ask rule/, r.out);
});

test('bad case: an overlay with no ask list fails', t => {
  expectSettingsFail(t, overlayWith(o => delete o.permissions.ask), 'settings-required');
});

test('bad case: an ask list with an extra or a repeated rule fails', t => {
  expectSettingsFail(t, overlayWith(o => o.permissions.ask.push('Bash(ls *)')), 'settings-value');
  expectSettingsFail(t, overlayWith(o => o.permissions.ask.push(o.permissions.ask[0])), 'settings-value');
});

// ------------------------------------------------------------ seam A: strict reading

test('bad case: a duplicate key fails, exactly or by case', t => {
  expectSettingsFail(t, realOverlay().replace('{', '{\n  "outputStyle": "x",'), 'settings-duplicate');
  expectSettingsFail(t, realOverlay().replace('{', '{\n  "OutputStyle": "Concise",'), 'settings-duplicate');
  expectSettingsFail(t, realOverlay().replace('{', '{\n  "output\\u0053tyle": "Concise",'), 'settings-duplicate');
});

test('bad case: a byte-order mark, a non-object root, or invalid JSON fails', t => {
  expectSettingsFail(t, `\ufeff${realOverlay()}`, 'settings-read');
  expectSettingsFail(t, '[]\n', 'settings-read');
  expectSettingsFail(t, realOverlay().replace(/\n}\s*$/, ',\n}\n'), 'settings-read');
});

test('bad case: a missing overlay fails', t => {
  const r = checkOverlay(t, realOverlay(), root => rmSync(join(root, ...OVERLAY.split('/'))));
  assert.equal(lastLine(r.stdout), 'RESULT: fail', r.out);
  assert.ok(failRules(r.stdout).includes('settings-read'), r.out);
});

test('bad case: a settings allow-list with a duplicate key or a byte-order mark fails', t => {
  const dup = gateCopy(t, g => writeFileSync(join(g, 'settings-allowlist.json'), '{"outputStyle": "Concise", "outputStyle": "x"}\n'));
  assert.ok(failRules(runSeamA(stage(t), dup).stdout).includes('settings-allowlist'));
  const bom = gateCopy(t, g => {
    const p = join(g, 'settings-allowlist.json');
    writeFileSync(p, `\ufeff${readFileSync(p, 'utf8')}`);
  });
  assert.ok(failRules(runSeamA(stage(t), bom).stdout).includes('settings-allowlist'));
});

test('canary: seam A never echoes an overlay key or value', t => {
  const C = 'CANARYset';
  const r = checkOverlay(
    t,
    overlayWith(o => {
      o[`${C}key`] = `${C}value`;
      o.env[`${C}ENV`] = `${C}envvalue`;
      o.outputStyle = `${C}style`;
    }),
  );
  assert.equal(lastLine(r.stdout), 'RESULT: fail', r.out);
  assert.ok(!r.out.includes(C), r.out);
});

test("the install's banned names are seam A's", () => {
  const names = text => [...text.matchAll(/'([A-Za-z]+)'/g)].map(m => m[1]);
  const seam = moduleMatch(GATE, 'seam-a', /const BANNED_SETTINGS = Object\.freeze\(\[([^\]]*)\]\)/);
  assert.ok(seam);
  assert.deepEqual([...core.BANNED_SETTINGS], names(seam[1]));
  assert.deepEqual(names(seam[1]), BANNED);
});

test('the settings overlay asks before any edit to the user file or its blocks folder', () => {
  const overlay = JSON.parse(readFileSync(join(REPO, 'claude', 'settings.overlay.json'), 'utf8'));
  assert.ok(overlay.permissions.ask.includes('Edit(~/.claude/pact/**)'), overlay.permissions.ask.join('\n'));
});
