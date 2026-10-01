// The settings guard (#34): seam A holds the settings overlay to an exact
// allow-list, and the install merges it without losing the owner's rules,
// warns about the live file, and never prints a live value.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { GATE, failRules, lastLine, realOverlay, runSeamA, stage, tempDir, writeTree } from './helpers.mjs';
import { commitAll, home, install, makeRepo, refused } from './install-harness.mjs';

const OVERLAY = 'claude/settings.overlay.json';

// The pact's "ask" rules, as #34 and its pre-build review settled them.
const PACT_ASK = [
  'PowerShell(./scripts/install.ps1 -Apply)',
  'PowerShell(*install.ps1*-A*)',
  'Bash(*install.ps1*-A*)',
  'Edit(~/.claude/agents/**)',
  'Edit(~/.claude/settings.json)',
  'Edit(~/.claude/CLAUDE.md)',
  'Edit(~/.claude/.pact-install.json)',
  'Edit(~/.claude.json)',
  'Edit(~/.claude/skills/**)',
];

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

/** Today's overlay as an object, changed by `edit`, as JSON text. */
function overlayWith(edit) {
  const o = JSON.parse(realOverlay());
  edit(o);
  return `${JSON.stringify(o, null, 2)}\n`;
}

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

/** A copy of the gate, with `edit` applied, so a test can tamper with an allow-list. */
function gateCopy(t, edit) {
  const g = tempDir(t);
  const files = ['seam-a.mjs', 'tool-allowlist.json', 'settings-allowlist.json', 'grimoire/check.mjs', 'grimoire/check.mjs.pin'];
  writeTree(g, Object.fromEntries(files.map(f => [f, readFileSync(join(GATE, ...f.split('/')), 'utf8')])));
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

test('bad case: a banned name stays banned when the allow-list lists it', t => {
  const script = gateCopy(t, g => editSettingsAllowlist(g, doc => (doc.hooks = {})));
  expectSettingsFail(t, overlayWith(o => (o.hooks = {})), 'settings-banned', script);
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
  const seam = readFileSync(join(GATE, 'seam-a.mjs'), 'utf8').match(/const BANNED_SETTINGS = Object\.freeze\(\[([^\]]*)\]\)/);
  const inst = readFileSync(join(GATE, '..', 'scripts', 'install.ps1'), 'utf8').match(/\$bannedSettings = @\(([^)]*)\)/);
  assert.ok(seam && inst);
  assert.deepEqual(names(inst[1]), names(seam[1]));
  assert.deepEqual(names(seam[1]), BANNED);
});

// ------------------------------------------------------------ install: the merge

function writeLive(h, doc) {
  writeFileSync(join(h, 'settings.json'), typeof doc === 'string' ? doc : JSON.stringify(doc, null, 2));
}

function readLive(h) {
  return JSON.parse(readFileSync(join(h, 'settings.json'), 'utf8'));
}

test("-Apply installs the pact's ask rules and auto mode, verifies them, and the next dry run is quiet", t => {
  const repo = makeRepo(t);
  const h = home(t);
  const dry = install(repo, h);
  assert.equal(dry.code, 0, dry.out);
  assert.match(dry.stdout, /^ {2}\+ permissions\.ask: PowerShell\(\.\/scripts\/install\.ps1 -Apply\)$/m, dry.out);
  const r = install(repo, h, { apply: true });
  assert.equal(r.code, 0, r.out);
  const live = readLive(h);
  for (const rule of PACT_ASK) assert.ok(live.permissions.ask.includes(rule), rule);
  assert.equal(live.permissions.defaultMode, 'auto');
  assert.match(r.stdout, /^OK {7}settings\.json/m, r.out);
  const again = install(repo, h);
  assert.equal(again.code, 0, again.out);
  assert.match(again.stdout, /^settings\.json: unchanged$/m, again.out);
  assert.doesNotMatch(again.stdout, /^WARN: /m, again.out);
});

test("an owner's own ask rule survives the merge", t => {
  const repo = makeRepo(t);
  const h = home(t);
  writeLive(h, { permissions: { ask: ['Bash(rm *)'], defaultMode: 'auto' } });
  const r = install(repo, h, { apply: true });
  assert.equal(r.code, 0, r.out);
  const ask = readLive(h).permissions.ask;
  assert.ok(ask.includes('Bash(rm *)'), JSON.stringify(ask));
  for (const rule of PACT_ASK) assert.ok(ask.includes(rule), rule);
});

test("live settings missing the pact's ask rules draw a warning", t => {
  const repo = makeRepo(t);
  const h = home(t);
  writeLive(h, { permissions: { defaultMode: 'auto' } });
  const r = install(repo, h);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^WARN: settings\.json lacks 9 of the pact's ask rules/m, r.out);
});

test('a live hooks key draws a warning, even beside keys that differ only in case', t => {
  const repo = makeRepo(t);
  const h = home(t);
  writeLive(h, '{"hooks": {"PreToolUse": []}, "theme": "dark", "Theme": "light"}\n');
  const r = install(repo, h);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^WARN: settings\.json holds hooks/m, r.out);
});

test('a live defaultMode other than auto draws a warning', t => {
  const repo = makeRepo(t);
  const h = home(t);
  writeLive(h, { permissions: { defaultMode: 'bypassPermissions', ask: PACT_ASK } });
  const r = install(repo, h);
  assert.match(r.stdout, /^WARN: settings\.json: permissions\.defaultMode is not auto/m, r.out);
});

test('a live Permissions key (wrong case) is warned about, and -Apply still writes the lowercase guard', t => {
  const repo = makeRepo(t);
  const h = home(t);
  writeLive(h, { Permissions: { ask: PACT_ASK, defaultMode: 'auto' } });
  const dry = install(repo, h);
  assert.match(dry.stdout, /^WARN: settings\.json lacks 9 of the pact's ask rules/m, dry.out);
  const r = install(repo, h, { apply: true });
  assert.equal(r.code, 0, r.out);
  const live = readLive(h);
  for (const rule of PACT_ASK) assert.ok(live.permissions.ask.includes(rule), rule);
  assert.equal(live.permissions.defaultMode, 'auto');
});

test('a live file the merge cannot read draws a plain warning, and -Apply exits non-zero', t => {
  const repo = makeRepo(t);
  const h = home(t);
  writeLive(h, '[1]\n');
  const dry = install(repo, h);
  assert.match(dry.stdout, /^WARN: settings\.json is not a strict JSON object/m, dry.out);
  const r = install(repo, h, { apply: true });
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.stdout, /^MISMATCH settings\.json/m, r.out);
  assert.equal(readFileSync(join(h, 'settings.json'), 'utf8'), '[1]\n');
});

test('live keys the pact does not set are named on one line; live env names are only counted', t => {
  const repo = makeRepo(t);
  const h = home(t);
  writeLive(h, { theme: 'dark', voiceEnabled: true, env: { MY_SECRET_NAME: 'x' } });
  const r = install(repo, h);
  assert.match(r.stdout, /^NOTE: live keys the pact does not set \(yours, not checked\): theme, voiceEnabled$/m, r.out);
  assert.match(r.stdout, /^NOTE: live env names the pact does not set: 1$/m, r.out);
  assert.doesNotMatch(r.out, /MY_SECRET_NAME/);
});

test('canary: the install never prints a live value, a live permission entry or a live key value', t => {
  const C = 'CANARYlive';
  const repo = makeRepo(t);
  const h = home(t);
  writeLive(h, {
    env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: `${C}env`, OTHER: `${C}other` },
    permissions: { allow: [`Bash(echo ${C}allow)`, 'Bash(a *)'], deny: [`Bash(${C}deny)`], ask: [`Bash(${C}ask)`] },
    outputStyle: `${C}style`,
    theme: `${C}theme`,
  });
  const dry = install(repo, h);
  assert.equal(dry.code, 0, dry.out);
  assert.ok(!dry.out.includes(C), dry.out);
  const r = install(repo, h, { apply: true });
  assert.equal(r.code, 0, r.out);
  assert.ok(!r.out.includes(C), r.out);
});

// ------------------------------------------------------------ install: binding the checked overlay

function plantSeamA(root, transform) {
  const p = join(root, 'gate', 'seam-a.mjs');
  writeFileSync(p, transform(readFileSync(p, 'utf8')));
}

test('bad case: a seam A that reports another overlay hash refuses', t => {
  const repo = makeRepo(t, root => plantSeamA(root, s => s.replace('// @@TEST-SETTINGS-HOOK@@', "settingsHash = '0'.repeat(64);")));
  const h = home(t);
  const r = install(repo, h, { apply: true });
  refused(r);
  assert.match(r.stdout, /settings overlay/);
});

test('bad case: a missing or doubled SETTINGS line refuses', t => {
  const none = makeRepo(t, root => plantSeamA(root, s => s.replace('// @@TEST-SETTINGS-HOOK@@', 'return;')));
  refused(install(none, home(t)));
  const two = makeRepo(t, root =>
    plantSeamA(root, s => s.replace('// @@TEST-SETTINGS-HOOK@@', 'report.lines.push(`SETTINGS ${settingsHash} claude/settings.overlay.json`);')),
  );
  refused(install(two, home(t)));
});

test('bad case: an overlay missing from the commit refuses', t => {
  const repo = makeRepo(t, root => rmSync(join(root, 'claude', 'settings.overlay.json')));
  refused(install(repo, home(t)));
});

test('bad case: a banned key in the committed overlay refuses, and -Apply changes nothing', t => {
  const repo = makeRepo(t);
  writeFileSync(join(repo, OVERLAY), overlayWith(o => (o.statusLine = { type: 'command', command: 'x' })));
  commitAll(repo);
  const h = home(t);
  const r = install(repo, h, { apply: true });
  refused(r);
  assert.match(r.stdout, /^seam-a\| FAIL settings-banned: claude\/settings\.overlay\.json: .*\(statusLine\)$/m, r.out);
  assert.throws(() => readFileSync(join(h, 'settings.json')));
});

test('the dry run no longer says the overlay is unchecked', t => {
  const r = install(makeRepo(t), home(t));
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.stdout, /not checked until #34/);
});
