// The settings guard (#34): seam A holds the settings overlay to an exact
// allow-list. The install's side, the merge and its warnings, is in
// settings-install.test.mjs; the data both use is in settings-rules.mjs.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import * as core from '../install-core.mjs';
import { moduleMatch } from './gate-files.mjs';
import { runSeamA } from './gate-run.mjs';
import { realOverlay, stage } from './payload.mjs';
import { GATE, assertFails, assertPasses, failRules, lastLine, moduleResult } from './text.mjs';
import { tempDir } from './tree.mjs';
import { OVERLAY, RETIRED_RULES, overlayWith, shown } from './settings-rules.mjs';

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

// #265 C1, C2
test("today's overlay sets auto mode and no ask rules, and passes", t => {
  const o = JSON.parse(realOverlay());
  assert.equal(Object.hasOwn(o.permissions, 'ask'), false);
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
{
  const base = () => ({ [OVERLAY]: realOverlay() });
  const run = (tree, t) => {
    const r = runSeamA(stage(t, { [OVERLAY]: tree[OVERLAY] }));
    return moduleResult(r.code, r.stdout);
  };
  const everyRow = r => assert.doesNotMatch(r.out, /^SETTINGS /m, r.out);
  const rows = [
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
  ];
  test('banned settings in the overlay: base passes', async t => assertPasses(await run(base(), t)));
  for (const r of rows) {
    test(`banned settings in the overlay: ${r.id}`, async t => {
      const res = await run(r.plant(base()), t);
      assertFails(res, r.fails, r.says);
      await everyRow(res, t);
    });
  }
  test('banned settings in the overlay: base passes after the rows', async t => assertPasses(await run(base(), t)));
}

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

// ------------------------------------------------------------ seam A: no ask rules (#265)

// #265 C1: the allow-list holds no ask list, so an overlay that sets one is a
// key path outside it, whatever the rules in it.
test('bad case: an overlay that sets an ask list fails as unlisted', t => {
  expectSettingsFail(t, overlayWith(o => (o.permissions.ask = ['PowerShell(*--apply*)'])), 'settings-unlisted');
  expectSettingsFail(t, overlayWith(o => (o.permissions.ask = [])), 'settings-unlisted');
});

// settings-value: a rule list is a set. Moved from the ask list to the allow
// list, so the last bad case for a repeated rule stays.
test('bad case: an allow list with a repeated rule fails, even when the allow-list holds the rule', t => {
  const script = gateCopy(t, g => editSettingsAllowlist(g, doc => (doc['permissions.allow'] = ['Bash(ls *)'])));
  expectSettingsFail(t, overlayWith(o => (o.permissions.allow = ['Bash(ls *)', 'Bash(ls *)'])), 'settings-value', script);
  const once = runSeamA(stage(t, { [OVERLAY]: overlayWith(o => (o.permissions.allow = ['Bash(ls *)'])) }), script);
  assert.equal(once.code, 0, `control: the rule once passes\n${once.out}`);
});

// settings-required: the mode is the one path the overlay must set.
test('bad case: an overlay with no defaultMode fails', t => {
  expectSettingsFail(t, overlayWith(o => delete o.permissions.defaultMode), 'settings-required');
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
{
  const base = () => ({ in: JSON.stringify(['--claude-home', 'C:\\h']) });
  const run = t => decided(() => core.parseArgs(JSON.parse(t.in), 'win32'));
  const rows = [
    { id: 'powershell-apply-switch', plant: t => ({ in: JSON.stringify([...JSON.parse(t.in), '-Apply']) }), fails: ['args-unread'], why: "the PowerShell installer's switch is a word the script does not read" },
    { id: 'apply-with-a-value', plant: t => ({ in: JSON.stringify([...JSON.parse(t.in), '--apply=true']) }), fails: ['args-unread'], why: 'nothing but the bare word turns on --apply' },
  ];
  test('apply only as typed: base passes', async t => assertPasses(await run(base(), t)));
  for (const r of rows) test(`apply only as typed: ${r.id}`, async t => assertFails(await run(r.plant(base()), t), r.fails, r.says));
  test('apply only as typed: base passes after the rows', async t => assertPasses(await run(base(), t)));
}

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


// #265 C5: the install's retired list is the frozen one, rule for rule, so no
// rule the pact once set is left behind in a live file.
test("the install's retired ask rules are the pact's old rules, exactly", () => {
  assert.equal(RETIRED_RULES.length, 56);
  assert.deepEqual([...core.RETIRED_ASK].map(shown), RETIRED_RULES.map(shown));
});
