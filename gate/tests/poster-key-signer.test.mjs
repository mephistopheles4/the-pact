// The poster's pull request signer for work tracked on a keyed item
// (#580, C11). A pull request stays on GitHub, and the pact signs it `pr-<the
// issue it works on>`, so an item `ABCD-12` makes the signer `pr-ABCD-12`. The
// poster takes that one shape and no other upper-case label. Every case runs
// in-process against a fake GitHub behind an injected gh.
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { SCHEMA, post } from '../../claude/tools/poster.mjs';
import { tempDir, writeTree } from './tree.mjs';

const ME = 'tester';
const TARGET = `${ME}/sandbox`;
const MACHINE = { home: '/srv/home/tester', tmp: '/tmp', user: ME, host: 'buildhost' };
const NOW = new Date('2026-11-21T12:00:00Z');
const QUOTE = { text: 'The owner said this plainly.', source: 'chat', when: '2026-11-21' };
const INTENT = { text: 'I read it so.', status: 'pending' };
const PR = { repo: TARGET, kind: 'pull-request', title: 'ABCD-12: a title', head: 'feature/x', base: 'main', signer: 'pr-ABCD-12', quote: [QUOTE], intent: INTENT, body_file: 'body.md' };
const REASON = 'fixed a wrong link';
const noGh = () => assert.fail('a dry run calls no gh');

function run(t, surface, doc, { gh = noGh, dry = true, body = 'A plain body.\n' } = {}) {
  const dir = tempDir(t, 'abcd-poster-key-');
  writeTree(dir, { 'body.md': body, 'post.json': JSON.stringify(doc) });
  return post([surface, '--post', join(dir, 'post.json'), ...(dry ? ['--dry-run'] : [])], { gh, env: {}, now: NOW, ...MACHINE });
}

/** A fake GitHub holding one pull request the login wrote, signed `label`. */
function world(label) {
  const calls = [];
  const item = { number: 7, body: `A plain body.\n\nSigned: ${label}\n`, user: { login: ME } };
  const gh = (args, input) => {
    calls.push({ args: [...args], input });
    const method = args[args.indexOf('--method') + 1];
    const path = args[args.indexOf('--method') + 2];
    const ok = value => ({ ok: true, stdout: JSON.stringify(value), stderr: '' });
    if (method === 'GET' && path === 'user') return ok({ login: ME });
    if (method === 'GET' && path === `repos/${TARGET}`) return ok({ owner: { login: ME } });
    if (path === `repos/${TARGET}/issues/7`) return ok({ ...item, pull_request: { url: `https://api.github.com/repos/${TARGET}/pulls/7` } });
    if (path === `repos/${TARGET}/pulls/7`) {
      if (method === 'PATCH') item.body = JSON.parse(input).body;
      return ok(item);
    }
    return { ok: false, stdout: '', stderr: 'HTTP 404: Not Found' };
  };
  return { gh, calls, item };
}

// #580 C11
test('C11: a pull request titled <KEY>-<n>: and signed pr-<KEY>-<n> passes the poster, and a lower-case label still does', t => {
  const r = run(t, 'pull-request', PR);
  assert.equal(r.code, 0, r.lines.join(' | '));
  assert.equal(r.lines.at(-1), 'RESULT: dry-run pull-request');
  assert.equal(run(t, 'pull-request', { ...PR, signer: 'pr-12' }).code, 0);
  assert.equal(run(t, 'pull-request', { ...PR, signer: 'pr-abcd-12' }).code, 0);
});

// #580 C11: another session edits the pull request through the signer, so the Signed: and reason lines take the shape too
test('C11: another session edits a pull request signed pr-<KEY>-<n> with that signer, and the Signed: and Edited: lines keep it', t => {
  const w = world('pr-ABCD-12');
  const r = run(t, 'pull-request-edit', { repo: TARGET, pr: 7, signer: 'pr-ABCD-12', reason: REASON, body_file: 'body.md' }, { gh: w.gh, dry: false });
  assert.equal(r.lines.at(-1), `RESULT: verified pull-request-edit https://github.com/${TARGET}/pull/7 as ${ME}`, r.lines.join(' | '));
  assert.equal(w.item.body, `A plain body.\n\nSigned: pr-ABCD-12\n\nEdited: ${REASON} (pr-ABCD-12)`);
});

// #580 C11
test('C11: a signer that is not exactly pr-<KEY>-<n>, and status-<KEY>-<n>, are refused post/pattern at the signer', t => {
  const bad = ['pr-ABCD', 'pr-ABCD-', 'pr-ABCD-0', 'pr-ABCD-012', 'pr-P-12', 'pr-ABCDEFGHIJK-12', 'pr-1BCD-12', 'pr-ABCD-12-x', 'pr-Abcd-12', 'pr-ABCd-12', `pr-ABCD-${'1'.repeat(17)}`, 'Pr-ABCD-12', 'abcd-ABCD', 'abcd-ABCD-12', 'status-ABCD-12', 'ABCD-12', 'pr-ABCD-12\n'];
  for (const signer of bad) {
    const r = run(t, 'pull-request', { ...PR, signer });
    assert.equal(r.code, 2, `${JSON.stringify(signer)}: ${r.lines.join(' | ')}`);
    assert.ok(r.lines.includes('REFUSED post/pattern signer'), `${JSON.stringify(signer)}: ${r.lines.join(' | ')}`);
  }
});

// #580 C11: only the signer takes the new shape; a relayed quote's via stays a lower-case label
test('C11: the schema takes pr-<KEY>-<n> for the signer only, and a via of that shape is refused', t => {
  assert.ok(new RegExp(SCHEMA.properties.signer.pattern).test('pr-ABCD-12'));
  assert.ok(!new RegExp(SCHEMA.properties.quote.items.properties.via.pattern).test('pr-ABCD-12'));
  const via = { text: 'A relayed passage.', source: 'relayed', via: 'pr-ABCD-12', when: '2026-11-21' };
  const r = run(t, 'pull-request', { ...PR, quote: [via] });
  assert.equal(r.code, 2, r.lines.join(' | '));
  assert.ok(r.lines.includes('REFUSED post/pattern quote[0].via'), r.lines.join(' | '));
});
