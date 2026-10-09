// The settings guard (#34), the install's side: the install merges the
// overlay without losing the owner's rules, warns about the live file, binds
// the overlay seam A checked, and never prints a live value. Seam A's checks,
// which never install, are in settings.test.mjs.
import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { plantModule } from './helpers.mjs';
import { commitAll, home, install, listTree, makeRepo, refused } from './install-harness.mjs';
import { DASHES, OVERLAY, PACT_ASK, overlayWith, shown } from './settings-rules.mjs';

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

function plantSeamA(root, from, to) {
  plantModule(join(root, 'gate'), 'seam-a', from, to);
}

test('bad case: a seam A that reports another overlay hash refuses', t => {
  const repo = makeRepo(t, root => plantSeamA(root, '// @@TEST-SETTINGS-HOOK@@', "settingsHash = '0'.repeat(64);"));
  const h = home(t);
  const r = install(repo, h, { apply: true });
  refused(r);
  assert.match(r.stdout, /^REFUSED: the settings overlay's hash does not match the one the check passed\./m, r.out);
});

test('bad case: a missing or doubled SETTINGS line refuses', t => {
  const none = makeRepo(t, root => plantSeamA(root, '// @@TEST-SETTINGS-HOOK@@', 'return;'));
  const rn = install(none, home(t));
  refused(rn);
  assert.match(rn.stdout, /^REFUSED: the check did not report exactly one settings overlay hash\./m, rn.out);
  const two = makeRepo(t, root =>
    plantSeamA(root, '// @@TEST-SETTINGS-HOOK@@', 'report.lines.push(`SETTINGS ${settingsHash} claude/settings.overlay.json`);'),
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
