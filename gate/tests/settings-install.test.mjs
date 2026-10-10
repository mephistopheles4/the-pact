// The settings guard (#34), the install's side: the install merges the
// overlay without losing the owner's rules, warns about the live file, binds
// the overlay seam A checked, and never prints a live value. Seam A's checks,
// which never install, are in settings.test.mjs.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { plantModule } from './gate-files.mjs';
import { commitAll, home, install, listTree, makeRepo, refused } from './install-harness.mjs';
import { OVERLAY, PACT_ASK, overlayWith } from './settings-rules.mjs';

// ------------------------------------------------------------ install: the merge

/** The live settings file, owner-only as Claude Code writes it, so the dry run's warning about a widened file stays out of these cases. */
function writeLive(h, doc) {
  writeFileSync(join(h, 'settings.json'), typeof doc === 'string' ? doc : JSON.stringify(doc, null, 2), { mode: 0o600 });
}

function readLive(h) {
  return JSON.parse(readFileSync(join(h, 'settings.json'), 'utf8'));
}

test("-Apply installs the pact's ask rules and auto mode, verifies them, and the next dry run is quiet", t => {
  const repo = makeRepo(t);
  const h = home(t);
  const dry = install(repo, h);
  assert.equal(dry.code, 0, dry.out);
  assert.match(dry.stdout, /^ {2}\+ permissions\.ask: PowerShell\(\*install\.ps1\*\)$/m, dry.out);
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

test("live settings missing the pact's ask rules draw a warning", t => {
  const repo = makeRepo(t);
  const h = home(t);
  writeLive(h, { permissions: { defaultMode: 'auto' } });
  const r = install(repo, h);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, new RegExp(`^WARN: settings\\.json lacks ${PACT_ASK.length} of the pact's ask rules`, 'm'), r.out);
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

test('canary: the install never prints a live value, a live env name, a live permission entry or a live key value', t => {
  const C = 'CANARYlive';
  const repo = makeRepo(t);
  const h = home(t);
  writeLive(h, {
    // A live env name is counted, never printed (#210, move 4): one name carries the canary too.
    env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: `${C}env`, OTHER: `${C}other`, [`${C}NAME`]: 'x' },
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
  // The merge writes what settingsText returns (#153, S8); planted to write an empty object.
  const repo = makeRepo(t, root => {
    const p = join(root, 'gate', 'install-core.mjs');
    const s = readFileSync(p, 'utf8');
    const from = 'export const settingsText = m => `${JSON.stringify(toJsonValue(m), null, 2)}\\n`;';
    assert.equal(s.split(from).length, 2);
    writeFileSync(p, s.replace(from, () => "export const settingsText = () => '{}\\n';"));
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
