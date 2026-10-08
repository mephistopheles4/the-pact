// The canonical path relations (gate/paths.mjs): whole segments, never a
// string prefix, and case folded only where the system folds case.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { test } from 'node:test';
import { FOLD_CASE, isClaudeSegment, within } from '../paths.mjs';
import { REPO } from './helpers.mjs';

const P = (...segs) => (sep === '\\' ? `C:\\${segs.join('\\')}` : `/${segs.join('/')}`);

test('within matches whole segments: a sibling sharing a prefix is not inside', () => {
  assert.equal(within(P('Users', 'me'), P('Users', 'me')), true);
  assert.equal(within(P('Users', 'me', 'proj'), P('Users', 'me')), true);
  assert.equal(within(P('Users', 'me2'), P('Users', 'me')), false);
  assert.equal(within(P('Users', 'me', '.claude2'), P('Users', 'me', '.claude')), false);
  assert.equal(within(P('Users'), P('Users', 'me')), false);
});

test('within ignores a trailing separator', () => {
  assert.equal(within(`${P('Users', 'me')}${sep}`, P('Users', 'me')), true);
  assert.equal(within(P('Users', 'me'), `${P('Users', 'me')}${sep}`), true);
});

test('within folds case exactly where the system does', () => {
  assert.equal(within(P('USERS', 'ME'), P('users', 'me')), FOLD_CASE);
});

test('isClaudeSegment reads .claude however it is cased or padded', () => {
  for (const s of ['.claude', '.CLAUDE', '.claude.', '.claude ']) assert.equal(isClaudeSegment(s), true, s);
  for (const s of ['.claude2', 'claude', '.claudex']) assert.equal(isClaudeSegment(s), false, s);
});

test('the notice and the fit check never mention a project or its files', () => {
  const render = readFileSync(join(REPO, 'gate', 'render.mjs'), 'utf8');
  const notice = /const NOTICE_TEMPLATE = [\s\S]*?\n\];\n/.exec(render);
  assert.ok(notice, 'the notice template is in the renderer');
  assert.doesNotMatch(notice[0], /project/i);
  const rules = readFileSync(join(REPO, 'claude', 'CLAUDE.md'), 'utf8');
  const fit = /When a configuration notice follows[\s\S]*?\n\n/.exec(rules);
  assert.ok(fit, 'the fit check names the configuration digest');
  assert.doesNotMatch(fit[0], /project/i);
});
