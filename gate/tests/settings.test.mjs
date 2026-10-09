// The settings guard (#34): seam A holds the settings overlay to an exact
// allow-list. The install's side, the merge and its warnings, is in
// settings-install.test.mjs; the rule lists both use are in settings-rules.mjs.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { GATE, REPO, failRules, installScriptText, lastLine, moduleFiles, moduleMatch, realOverlay, runSeamA, stage, tempDir } from './helpers.mjs';
import { APPLY_ASK, CROSS_ASK, DASHES, OVERLAY, PACT_ASK, overlayWith, shown } from './settings-rules.mjs';

// pwsh, for advanced(); a missing one fails the file, as the install harness's lookup does.
const where = spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', ['pwsh'], { encoding: 'utf8' });
if (where.status !== 0) throw new Error('pwsh not found on PATH');
const PWSH = where.stdout.split(/\r?\n/)[0].trim();

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
  const seam = moduleFiles(GATE, 'seam-a').map(p => `gate/${p.slice(GATE.length + 1)}`);
  const files = ['claude/settings.overlay.json', 'gate/settings-allowlist.json', ...seam, 'gate/tests/settings.test.mjs', 'gate/tests/settings-rules.mjs', 'gate/tests/settings-install.test.mjs'];
  for (const f of files) {
    const text = readFileSync(join(GATE, '..', ...f.split('/')), 'utf8');
    for (const d of DASHES) assert.ok(!text.includes(d), `${f} holds ${shown(d)} as a character`);
  }
  const rules = readFileSync(join(GATE, 'settings-allowlist.json'), 'utf8') + realOverlay();
  assert.ok(/^[\x00-\x7f]*$/.test(rules), 'a rule file holds a byte outside ASCII');
});

test("the install script's parameters stay non-advanced: no CmdletBinding, no Parameter attribute", t => {
  const text = installScriptText();
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
  const seam = moduleMatch(GATE, 'seam-a', /const BANNED_SETTINGS = Object\.freeze\(\[([^\]]*)\]\)/);
  const inst = installScriptText().match(/\$bannedSettings = @\(([^)]*)\)/);
  assert.ok(seam && inst);
  assert.deepEqual(names(inst[1]), names(seam[1]));
  assert.deepEqual(names(seam[1]), BANNED);
});

test('the settings overlay asks before any edit to the user file or its blocks folder', () => {
  const overlay = JSON.parse(readFileSync(join(REPO, 'claude', 'settings.overlay.json'), 'utf8'));
  assert.ok(overlay.permissions.ask.includes('Edit(~/.claude/pact/**)'), overlay.permissions.ask.join('\n'));
});
