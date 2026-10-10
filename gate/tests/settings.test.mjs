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
import { APPLY_ASK, APPLY_COMMANDS, BACKUP_ASK, BROAD_INSTALL_ASK, CROSS_ASK, DASHES, MENTION_COMMANDS, OLD_INSTALL_ASK, OVERLAY, PACT_ASK, asks, overlayWith, shown } from './settings-rules.mjs';
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

/** The rules among `rules` holding a character outside printable ASCII, other than the three dashes. */
function nonAsciiRules(rules) {
  return rules.filter(r => [...r].some(c => (c < ' ' || c > '~') && !DASHES.includes(c)));
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

for (const k of BANNED) {
  test(`bad case: an overlay with ${k} fails, by name`, t => {
    const r = expectSettingsFail(t, overlayWith(o => (o[k] = k === 'hooks' ? { PreToolUse: [] } : 'x')), 'settings-banned');
    assert.match(r.stdout, new RegExp(`\\(${k}\\)`), r.out);
  });
}

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
// fails it as missing, so no near miss stands in for a required rule. A hyphen
// for a dash rule's dash; a splat with a space for the no-space splat (a space
// is the narrower rule); and a retired broad rule, which seam A no longer asks
// for, in place of the rule that replaced it.
const dashRule = (tool, i) => OLD_INSTALL_ASK.find(r => r.startsWith(`${tool}(`) && r.includes(DASHES[i]));
const splatRule = tool => OLD_INSTALL_ASK.find(r => r.startsWith(`${tool}(`) && r.endsWith('@*)'));
const hyphened = rule => [...rule].map(c => (DASHES.includes(c) ? '-' : c)).join('');
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
for (const c of table('near misses of the required rules', {
  module: 'gate/seam-a.mjs',
  base: () => ({ [OVERLAY]: realOverlay(), [ALLOWLIST]: readFileSync(join(GATE, 'settings-allowlist.json'), 'utf8') }),
  run: (tree, t) => {
    const script = gateCopy(t, g => writeFileSync(join(g, 'settings-allowlist.json'), tree[ALLOWLIST]));
    const r = runSeamA(stage(t, { [OVERLAY]: tree[OVERLAY] }), script);
    return moduleResult(r.code, r.stdout);
  },
  rows: [
    { id: 'hyphen-for-powershell-en-dash', plant: swapIn(dashRule('PowerShell', 0), hyphened(dashRule('PowerShell', 0))), fails: ['settings-required'], why: 'a hyphen in place of the en dash' },
    { id: 'hyphen-for-powershell-em-dash', plant: swapIn(dashRule('PowerShell', 1), hyphened(dashRule('PowerShell', 1))), fails: ['settings-required'], why: 'a hyphen in place of the em dash' },
    { id: 'hyphen-for-powershell-horizontal-bar', plant: swapIn(dashRule('PowerShell', 2), hyphened(dashRule('PowerShell', 2))), fails: ['settings-required'], why: 'a hyphen in place of the horizontal bar' },
    { id: 'hyphen-for-bash-en-dash', plant: swapIn(dashRule('Bash', 0), hyphened(dashRule('Bash', 0))), fails: ['settings-required'], why: 'a hyphen in place of the en dash, under Bash' },
    { id: 'hyphen-for-bash-em-dash', plant: swapIn(dashRule('Bash', 1), hyphened(dashRule('Bash', 1))), fails: ['settings-required'], why: 'a hyphen in place of the em dash, under Bash' },
    { id: 'hyphen-for-bash-horizontal-bar', plant: swapIn(dashRule('Bash', 2), hyphened(dashRule('Bash', 2))), fails: ['settings-required'], why: 'a hyphen in place of the horizontal bar, under Bash' },
    { id: 'splat-with-space-powershell', plant: swapIn(splatRule('PowerShell'), splatRule('PowerShell').replace('*@', '* @')), fails: ['settings-required'], why: 'a splat that needs a space before it misses one after another separator (ADR 0020, miss d)' },
    { id: 'splat-with-space-bash', plant: swapIn(splatRule('Bash'), splatRule('Bash').replace('*@', '* @')), fails: ['settings-required'], why: 'the same, under Bash' },
    { id: 'broad-for-name-free-flag', plant: swapIn('PowerShell(*--apply*)', BROAD_INSTALL_ASK[2]), fails: ['settings-required'], why: 'a retired broad rule does not stand in for the name-free flag rule' },
  ],
})) test(c.name, c.fn);

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

test('every pact ask rule is printable ASCII, but for the three dashes', () => {
  const allow = JSON.parse(readFileSync(join(GATE, 'settings-allowlist.json'), 'utf8'))['permissions.ask'];
  const overlay = JSON.parse(realOverlay()).permissions.ask;
  assert.deepEqual(nonAsciiRules(allow), []);
  assert.deepEqual(nonAsciiRules(overlay), []);
  assert.deepEqual(nonAsciiRules(PACT_ASK), []);
});

test('bad case: an ask rule with another dash-like or invisible character is caught', () => {
  for (const c of ['\u2010', '\u2212', '\u00ad', '\u200b', '\t']) {
    assert.deepEqual(nonAsciiRules([`Bash(*nstall.ps1*${c}*)`]), [`Bash(*nstall.ps1*${c}*)`], shown(c));
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
