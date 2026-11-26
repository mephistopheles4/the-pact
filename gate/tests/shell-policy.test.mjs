// Codex's shell environment policy (spec 0007 S13, C33): one line in
// ~/.codex/config.toml that keeps secret-named variables out of the shells
// Codex starts. Codex's known description is the harness, in a throwaway home.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { applyBound, home, install, makeRepo, passed, refused } from './install-harness.mjs';

const at = (h, rel) => join(h, ...rel.split('/'));
const read = (h, rel) => readFileSync(at(h, rel), 'utf8');
const put = (h, rel, text) => {
  mkdirSync(dirname(at(h, rel)), { recursive: true });
  writeFileSync(at(h, rel), text);
};
const CONFIG = '.codex/config.toml';
const LINE = 'shell_environment_policy.ignore_default_excludes = false # the pact: secret-named variables stay out of the shells Codex starts';
const record = h => JSON.parse(read(h, '.pact/install.json'));
const takes = (h, list) => put(h, '.pact/config.json', `${JSON.stringify({ schema: 1, harnesses: { install: list } })}\n`);
const codexHome = t => {
  const h = home(t);
  mkdirSync(at(h, '.codex'));
  takes(h, ['codex']);
  return h;
};
const backedUp = h => readdirSync(at(h, '.pact/backups')).sort().map(b => JSON.parse(read(h, `.pact/backups/${b}/manifest.json`)).entries.find(e => e.path === CONFIG)).filter(Boolean);

test('C33: the apply puts the policy line first in the Codex config, keeps the rest, backs the file up and records it; taking Codex out removes only the line', t => {
  const repo = makeRepo(t);
  const h = codexHome(t);
  const mine = '# mine\r\nmodel = "m"\r\n\r\n[history]\r\npersistence = "none"\r\n';
  put(h, CONFIG, mine);
  const dry = install(repo, h);
  passed(dry);
  assert.match(dry.stdout, /^Codex shell policy: would be added to \.codex\/config\.toml/m, dry.out);
  assert.equal(read(h, CONFIG), mine, 'a dry run writes nothing');
  const applied = applyBound(repo, h);
  passed(applied);
  assert.match(applied.stdout, /^OK {7}\.codex\/config\.toml \(shell policy\)\r?$/m, applied.out);
  assert.equal(read(h, CONFIG), `${LINE}\r\n${mine}`);
  assert.equal(record(h).shellPolicy, true);
  assert.deepEqual(backedUp(h).map(e => e.was), ['file']);
  const again = install(repo, h);
  passed(again);
  assert.match(again.stdout, /^Nothing to do\.\r?$/m, again.out);

  takes(h, []);
  const out = applyBound(repo, h);
  passed(out);
  assert.equal(read(h, CONFIG), mine);
  assert.equal(record(h).shellPolicy, undefined);
});

test('C33: a home with no Codex config gets one holding only the line, and a byte order mark stays first', t => {
  const repo = makeRepo(t);
  const h = codexHome(t);
  passed(applyBound(repo, h));
  assert.equal(read(h, CONFIG), `${LINE}\n`);

  const marked = codexHome(t);
  put(marked, CONFIG, '﻿model = "m"\n');
  passed(applyBound(repo, marked));
  assert.equal(read(marked, CONFIG), `﻿${LINE}\nmodel = "m"\n`);
});

test('bad case: a config with its own shell environment policy is left as is, with a warning, and is not recorded', t => {
  const repo = makeRepo(t);
  for (const mine of ['[shell_environment_policy]\nignore_default_excludes = true\n', 'shell_environment_policy = { inherit = "all" }\n', '[profiles.p.shell_environment_policy]\ninherit = "core"\n']) {
    const h = codexHome(t);
    put(h, CONFIG, mine);
    const r = applyBound(repo, h);
    passed(r);
    assert.match(r.stdout, /^WARN: Codex shell policy: \.codex\/config\.toml sets shell_environment_policy itself/m, r.out);
    assert.equal(read(h, CONFIG), mine);
    assert.equal(record(h).shellPolicy, undefined);
  }
});

test('C33: a deleted line is added again; one replaced by your own policy is yours; the line changed, moved under a table, or beside a policy of your own is drift', t => {
  const repo = makeRepo(t);
  const h = codexHome(t);
  passed(applyBound(repo, h));

  put(h, CONFIG, 'model = "m"\n');
  passed(applyBound(repo, h));
  assert.equal(read(h, CONFIG), `${LINE}\nmodel = "m"\n`);

  for (const changed of [`${LINE.replace('= false', '= true')}\n`, `[history]\n${LINE}\n`, `${LINE}\n[shell_environment_policy]\ninherit = "all"\n`]) {
    put(h, CONFIG, changed);
    const r = install(repo, h);
    passed(r);
    assert.match(r.stdout, /^ {2}\.codex\/config\.toml \(the pact's shell policy line changed since the install\)\r?$/m, r.out);
  }
  refused(applyBound(repo, h), /installed files or settings entries changed/);
  assert.equal(read(h, CONFIG), `${LINE}\n[shell_environment_policy]\ninherit = "all"\n`);
  // A changed line is drift while Codex is being taken out too, and stays.
  put(h, CONFIG, `${LINE.replace('= false', '= true')}\n`);
  takes(h, []);
  const leaving = applyBound(repo, h);
  refused(leaving, /installed files or settings entries changed/);
  assert.match(leaving.stdout, /^ {2}\.codex\/config\.toml \(the pact's shell policy line changed since the install\)\r?$/m, leaving.out);
  assert.equal(read(h, CONFIG), `${LINE.replace('= false', '= true')}\n`);
  takes(h, ['codex']);

  const theirs = '[shell_environment_policy]\ninherit = "all"\n';
  put(h, CONFIG, theirs);
  passed(applyBound(repo, h));
  assert.equal(read(h, CONFIG), theirs);
  assert.equal(record(h).shellPolicy, undefined);
});

test('bad case: a Codex config that is not UTF-8, or not a plain file, refuses; so does a record whose shell policy mark is neither true nor false', t => {
  const repo = makeRepo(t);
  const binary = codexHome(t);
  writeFileSync(at(binary, CONFIG), Buffer.from([0x6d, 0x3d, 0xff, 0xfe, 0x0a]));
  refused(install(repo, binary), /is not a UTF-8 text file/);
  assert.ok(!existsSync(at(binary, '.pact/install.json')));

  const folder = codexHome(t);
  mkdirSync(at(folder, CONFIG));
  refused(install(repo, folder), /is not a UTF-8 text file/);

  const linked = codexHome(t);
  mkdirSync(at(linked, '.codex/elsewhere'));
  symlinkSync(at(linked, '.codex/elsewhere'), at(linked, CONFIG), 'junction');
  refused(install(repo, linked), /\.codex\/config\.toml is behind a link/);

  const h = codexHome(t);
  passed(applyBound(repo, h));
  put(h, '.pact/install.json', JSON.stringify({ ...record(h), shellPolicy: 'yes' }));
  refused(install(repo, h), /shell policy mark is neither true nor false/);
});

test('bad case: an apply that leaves the line out of the Codex config reports a mismatch', t => {
  const repo = makeRepo(t, root => {
    const p = join(root, 'gate', 'install-run.mjs');
    const s = readFileSync(p, 'utf8');
    const head = 'io.writeReplacing(policyFile, policy.next';
    assert.equal(s.split(head).length, 2);
    writeFileSync(p, s.replace(head, "io.writeReplacing(policyFile, '' && policy.next"));
  });
  const h = codexHome(t);
  const r = applyBound(repo, h);
  assert.notEqual(r.status, 0, r.out);
  assert.match(r.stdout, /^MISMATCH \.codex\/config\.toml \(the shell policy is not there\)\r?$/m, r.out);
});
