// The settings guard (#34): seam A holds the settings overlay to an exact
// allow-list, and the install merges it without losing the owner's rules,
// warns about the live file, and never prints a live value.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { GATE, failRules, lastLine, realOverlay, runSeamA, stage, tempDir } from './helpers.mjs';
import { PWSH, commitAll, home, install, listTree, makeRepo, refused } from './install-harness.mjs';

const OVERLAY = 'claude/settings.overlay.json';

// The three characters PowerShell reads as a parameter's hyphen (#89): en
// dash, em dash and horizontal bar. Always written as escapes, never typed.
const DASHES = ['\u2013', '\u2014', '\u2015'];

// The pact's "ask" rules, as #34 and its pre-build review settled them.
const PACT_ASK = [
  'PowerShell(./scripts/install.ps1 -Apply)',
  'PowerShell(*install.ps1*-A*)',
  'Bash(*nstall.ps1*-A*)',
  'Bash(*nstall.ps1*-a*)',
  // #89: a splat, and each dash PowerShell takes in place of the hyphen.
  'PowerShell(*install.ps1* @*)',
  'PowerShell(*install.ps1*\u2013*)',
  'PowerShell(*install.ps1*\u2014*)',
  'PowerShell(*install.ps1*\u2015*)',
  'Bash(*nstall.ps1* @*)',
  'Bash(*nstall.ps1*\u2013*)',
  'Bash(*nstall.ps1*\u2014*)',
  'Bash(*nstall.ps1*\u2015*)',
  'Edit(~/.claude/agents/**)',
  'Edit(~/.claude/settings.json)',
  'Edit(~/.claude/CLAUDE.md)',
  'Edit(~/.claude/.pact-install.json)',
  'Edit(~/.claude.json)',
  'Edit(~/.claude/skills/**)',
  'Edit(~/.claude/plugins/**)',
  'Edit(~/.claude/output-styles/**)',
  'Edit(~/.claude/commands/**)',
  // The installed cross script (#45).
  'Edit(~/.claude/pact/**)',
];

// The apply-step rules, hard-coded in seam A as the permission mode is. Named
// one by one, so a rule added to the pact's list can't push one out.
const APPLY_ASK = [
  'PowerShell(./scripts/install.ps1 -Apply)',
  'PowerShell(*install.ps1*-A*)',
  'Bash(*nstall.ps1*-A*)',
  'Bash(*nstall.ps1*-a*)',
  'PowerShell(*install.ps1* @*)',
  'PowerShell(*install.ps1*\u2013*)',
  'PowerShell(*install.ps1*\u2014*)',
  'PowerShell(*install.ps1*\u2015*)',
  'Bash(*nstall.ps1* @*)',
  'Bash(*nstall.ps1*\u2013*)',
  'Bash(*nstall.ps1*\u2014*)',
  'Bash(*nstall.ps1*\u2015*)',
];
// The cross script's rule, hard-coded in seam A beside them.
const CROSS_ASK = 'Edit(~/.claude/pact/**)';

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

/** A rule as the dry run should print it: anything outside printable ASCII, and the backslash, as a \u-and-four-hex-digits escape. */
function shown(rule) {
  return rule.replace(/[^\x20-\x5b\x5d-\x7e]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

/** The rules among `rules` holding a character outside printable ASCII, other than the three dashes. */
function nonAsciiRules(rules) {
  return rules.filter(r => [...r].some(c => (c < ' ' || c > '~') && !DASHES.includes(c)));
}

/**
 * Whether PowerShell itself reads each script text as an advanced script. Each
 * text becomes a function's body, which defines it without running it, and
 * the function's CmdletBinding flag is the answer. Asking the engine catches
 * every spelling it accepts, namespace-qualified attributes included.
 */
function advanced(t, texts) {
  const dir = tempDir(t);
  const files = texts.map((text, i) => {
    const f = join(dir, `s${i}.ps1`);
    writeFileSync(f, text);
    return f;
  });
  // The paths go in through the environment: anything after -Command would be
  // joined into the command and run.
  const script =
    "foreach ($f in $env:PACT_ADV_FILES -split \"`n\") { Set-Item function:pact_adv ([scriptblock]::Create([IO.File]::ReadAllText($f))); " +
    '[string](Get-Command pact_adv).CmdletBinding }';
  const env = { ...process.env, PACT_ADV_FILES: files.join('\n') };
  delete env.NODE_OPTIONS;
  const r = spawnSync(PWSH, ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', env });
  assert.equal(r.status, 0, r.stderr);
  const out = r.stdout.trim().split(/\r?\n/);
  assert.equal(out.length, texts.length, r.stdout);
  return out.map(l => {
    assert.match(l, /^(True|False)$/, r.stdout);
    return l === 'True';
  });
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

// A hyphen in place of one dash, in both files: seam A must compare the exact
// character, so the dash rule counts as missing. One dash at a time, since two
// swapped rules could collide and fail as a repeat instead.
for (const rule of APPLY_ASK.filter(r => DASHES.some(d => r.includes(d)))) {
  test(`bad case: ${shown(rule)} with a hyphen for its dash, in both files, fails as missing`, t => {
    const swap = r => (r === rule ? [...r].map(c => (DASHES.includes(c) ? '-' : c)).join('') : r);
    const script = gateCopy(t, g => editSettingsAllowlist(g, doc => (doc['permissions.ask'] = doc['permissions.ask'].map(swap))));
    const r = expectSettingsFail(t, overlayWith(o => (o.permissions.ask = o.permissions.ask.map(swap))), 'settings-required', script);
    assert.deepEqual([...new Set(failRules(r.stdout))], ['settings-required'], r.out);
  });
}

// The splat rule without its space, in both files: seam A must compare the
// space exactly, so the splat rule counts as missing.
for (const rule of APPLY_ASK.filter(r => r.includes(' @'))) {
  test(`bad case: ${rule} without the space before its @, in both files, fails as missing`, t => {
    const swap = r => (r === rule ? r.replace(' @', '@') : r);
    const script = gateCopy(t, g => editSettingsAllowlist(g, doc => (doc['permissions.ask'] = doc['permissions.ask'].map(swap))));
    const r = expectSettingsFail(t, overlayWith(o => (o.permissions.ask = o.permissions.ask.map(swap))), 'settings-required', script);
    assert.deepEqual([...new Set(failRules(r.stdout))], ['settings-required'], r.out);
  });
}

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
  const files = ['claude/settings.overlay.json', 'gate/settings-allowlist.json', 'gate/seam-a.mjs', 'gate/tests/settings.test.mjs'];
  for (const f of files) {
    const text = readFileSync(join(GATE, '..', ...f.split('/')), 'utf8');
    for (const d of DASHES) assert.ok(!text.includes(d), `${f} holds ${shown(d)} as a character`);
  }
  const rules = readFileSync(join(GATE, 'settings-allowlist.json'), 'utf8') + realOverlay();
  assert.ok(/^[\x00-\x7f]*$/.test(rules), 'a rule file holds a byte outside ASCII');
});

test("the install script's parameters stay non-advanced: no CmdletBinding, no Parameter attribute", t => {
  const text = readFileSync(join(GATE, '..', 'scripts', 'install.ps1'), 'utf8');
  assert.match(text, /^\s*\[switch\]\$Apply,$/m);
  assert.deepEqual(advanced(t, [text]), [false]);
});

test('bad case: a parameter block made advanced is caught, in every spelling PowerShell accepts', t => {
  const body = attr => `${attr}\nparam(\n  [switch]$Apply\n)\n'x'\n`;
  const param = attr => `param(\n  ${attr}[switch]$Apply\n)\n'x'\n`;
  const plain = [body(''), body('[CmdletBindingAttribute()]'), param('[ParameterAttribute()]')];
  const made = [
    body('[CmdletBinding()]'),
    body('[cmdletbinding( )]'),
    body('[System.Management.Automation.CmdletBinding()]'),
    body('[Management.Automation.CmdletBinding()]'),
    body('[System.Management.Automation.CmdletBindingAttribute()]'),
    param('[Parameter(Mandatory)]'),
    param('[ parameter ()]'),
    param('[System.Management.Automation.Parameter()]'),
  ];
  assert.deepEqual(advanced(t, [...plain, ...made]), [...plain.map(() => false), ...made.map(() => true)]);
});

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

/** The dry run's added "ask" lines. */
function addedAsk(stdout) {
  return stdout.split(/\r?\n/).filter(l => l.startsWith('  + permissions.ask: '));
}

test('the dry run lists every pact rule as an added ask line, each dash printed as an escape', t => {
  const r = install(makeRepo(t), home(t));
  assert.equal(r.code, 0, r.out);
  const added = addedAsk(r.stdout);
  for (const rule of PACT_ASK) assert.ok(added.includes(`  + permissions.ask: ${shown(rule)}`), `${shown(rule)} not listed:\n${r.out}`);
  for (const d of DASHES) assert.ok(added.some(l => l.endsWith(`${shown(d)}*)`)), shown(d));
  for (const l of added) assert.match(l, /^[\x20-\x7e]*$/, shown(l));
});

/** A test repo whose allow-list and overlay both hold `rule` as an extra ask rule. */
function repoWithRule(t, rule) {
  return makeRepo(t, root => {
    const a = join(root, 'gate', 'settings-allowlist.json');
    const doc = JSON.parse(readFileSync(a, 'utf8'));
    doc['permissions.ask'].push(rule);
    writeFileSync(a, JSON.stringify(doc, null, 2));
    const o = join(root, ...OVERLAY.split('/'));
    const ov = JSON.parse(readFileSync(o, 'utf8'));
    ov.permissions.ask.push(rule);
    writeFileSync(o, JSON.stringify(ov, null, 2));
  });
}

test('bad case: a rule with invisible and control characters prints each one as an escape', t => {
  const r = install(repoWithRule(t, 'Bash(echo a\u00adb\u00a0c\td\u200be)'), home(t));
  assert.equal(r.code, 0, r.out);
  // Written out by hand, not built with the pattern the install uses.
  assert.ok(addedAsk(r.stdout).includes(String.raw`  + permissions.ask: Bash(echo a\u00adb\u00a0c\u0009d\u200be)`), r.out);
});

test('bad case: a rule holding a backslash and "u2013" as plain text prints apart from a real dash', t => {
  const fake = String.raw`Bash(echo \u2013)`;
  const r = install(repoWithRule(t, fake), home(t));
  assert.equal(r.code, 0, r.out);
  const added = addedAsk(r.stdout);
  assert.ok(added.includes(String.raw`  + permissions.ask: Bash(echo \u005cu2013)`), r.out);
  assert.ok(!added.includes(`  + permissions.ask: ${shown('Bash(echo \u2013)')}`), r.out);
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

test("the merge keeps the owner's numbers exact, beyond 64-bit integers too", t => {
  const repo = makeRepo(t);
  const h = home(t);
  writeLive(h, '{"big": 12345678901234567890, "small": 7, "frac": 0.1, "permissions": {"defaultMode": "auto"}}\n');
  const r = install(repo, h, { apply: true });
  assert.equal(r.code, 0, r.out);
  const text = readFileSync(join(h, 'settings.json'), 'utf8');
  assert.match(text, /"big": 12345678901234567890\b/, text);
  assert.match(text, /"small": 7\b/, text);
  assert.match(text, /"frac": 0\.1\b/, text);
});

test("live settings missing the pact's ask rules draw a warning", t => {
  const repo = makeRepo(t);
  const h = home(t);
  writeLive(h, { permissions: { defaultMode: 'auto' } });
  const r = install(repo, h);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, new RegExp(`^WARN: settings\\.json lacks ${PACT_ASK.length} of the pact's ask rules`, 'm'), r.out);
});

test('a live hooks key draws a warning, even beside keys that differ only in case', t => {
  const repo = makeRepo(t);
  const h = home(t);
  writeLive(h, '{"hooks": {"PreToolUse": []}, "theme": "dark", "Theme": "light"}\n');
  const r = install(repo, h);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^WARN: settings\.json holds hooks/m, r.out);
});

test('live plugin keys, which the merge keeps from the live file, are named but not warned about', t => {
  const repo = makeRepo(t);
  const h = home(t);
  writeLive(h, { enabledPlugins: { 'x@y': true }, extraKnownMarketplaces: {}, permissions: { ask: PACT_ASK, defaultMode: 'auto' } });
  const r = install(repo, h);
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.stdout, /^WARN: /m, r.out);
  assert.match(r.stdout, /^NOTE: live keys the pact does not set \(yours, not checked\): enabledPlugins, extraKnownMarketplaces$/m, r.out);
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
  assert.match(dry.stdout, new RegExp(`^WARN: settings\\.json lacks ${PACT_ASK.length} of the pact's ask rules`, 'm'), dry.out);
  const r = install(repo, h, { apply: true });
  assert.equal(r.code, 0, r.out);
  const live = readLive(h);
  for (const rule of PACT_ASK) assert.ok(live.permissions.ask.includes(rule), rule);
  assert.equal(live.permissions.defaultMode, 'auto');
});

test('a live file the merge cannot read draws a plain warning, and -Apply refuses before writing anything', t => {
  const repo = makeRepo(t);
  const h = home(t);
  writeLive(h, '[1]\n');
  const dry = install(repo, h);
  assert.match(dry.stdout, /^WARN: settings\.json is not a strict JSON object/m, dry.out);
  const r = install(repo, h, { apply: true });
  refused(r);
  assert.match(r.stdout, /settings\.json/, r.out);
  assert.deepEqual(listTree(h), ['settings.json']);
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
  assert.match(r.stdout, /^REFUSED: the settings overlay's hash does not match the one the check passed\./m, r.out);
});

test('bad case: a missing or doubled SETTINGS line refuses', t => {
  const none = makeRepo(t, root => plantSeamA(root, s => s.replace('// @@TEST-SETTINGS-HOOK@@', 'return;')));
  const rn = install(none, home(t));
  refused(rn);
  assert.match(rn.stdout, /^REFUSED: the check did not report exactly one settings overlay hash\./m, rn.out);
  const two = makeRepo(t, root =>
    plantSeamA(root, s => s.replace('// @@TEST-SETTINGS-HOOK@@', 'report.lines.push(`SETTINGS ${settingsHash} claude/settings.overlay.json`);')),
  );
  const r2 = install(two, home(t));
  refused(r2);
  assert.match(r2.stdout, /^REFUSED: the check did not report exactly one settings overlay hash\./m, r2.out);
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

test('bad case: an -Apply whose written settings lack the guard reports a mismatch and exits non-zero', t => {
  const repo = makeRepo(t, root => {
    const p = join(root, 'scripts', 'install.ps1');
    writeFileSync(p, readFileSync(p, 'utf8').replace('((ConvertTo-Json $merged -Depth 100) + "`n")', "'{}'"));
  });
  const h = home(t);
  writeLive(h, { theme: 'dark' });
  const r = install(repo, h, { apply: true });
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.stdout, /^MISMATCH settings\.json/m, r.out);
});

test('the dry run no longer says the overlay is unchecked', t => {
  const r = install(makeRepo(t), home(t));
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.stdout, /not checked until #34/);
});
