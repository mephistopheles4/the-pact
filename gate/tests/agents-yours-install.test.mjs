// #262: the pact manages only the agent files it wrote and still holds as it
// wrote them. An agent file it didn't write, or one changed since the install,
// is the person's: never overwritten, deleted or recorded. Driven end to end,
// against a throwaway repo and --claude-home; never touches ~/.claude.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { applyBound, home, install, makeRepo } from './install-harness.mjs';

const MINE = '---\nname: scout\ndescription: My own scout.\nmodel: haiku\n---\n\nFind things, briefly.\n';
const recorded = h => JSON.parse(readFileSync(join(h, '.pact-install.json'), 'utf8')).files.map(f => f.path);
const apply = (repo, h) => {
  const r = applyBound(repo, h);
  assert.equal(r.code, 0, r.out);
  return r;
};

// #262: a pact agent edited in place is the person's from then on, and stays theirs until they delete it.
test('a pact agent edited in place is yours: no drift, left as is, dropped from the record, and the pact\'s comes back once you delete it', t => {
  const repo = makeRepo(t);
  const h = home(t);
  apply(repo, h);
  writeFileSync(join(h, 'agents', 'scout.md'), MINE);
  const dry = install(repo, h);
  assert.equal(dry.code, 0, dry.out);
  assert.match(dry.stdout, /^Drift: 0\r?$/m, dry.out);
  assert.match(dry.stdout, /^Yours, left as is: 1\r?$/m, dry.out);
  assert.match(dry.stdout, /^ {2}agents\/scout\.md\r?$/m, dry.out);
  apply(repo, h);
  assert.equal(readFileSync(join(h, 'agents', 'scout.md'), 'utf8'), MINE);
  assert.ok(!recorded(h).includes('agents/scout.md'), 'the record still lists your agent');
  // The next install leaves it too, though the record no longer lists it.
  apply(repo, h);
  assert.equal(readFileSync(join(h, 'agents', 'scout.md'), 'utf8'), MINE);
  // Deleted: the pact's comes back, recorded again.
  rmSync(join(h, 'agents', 'scout.md'));
  apply(repo, h);
  assert.deepEqual(readFileSync(join(h, 'agents', 'scout.md')), readFileSync(join(repo, 'claude', 'agents', 'scout.md')));
  assert.ok(recorded(h).includes('agents/scout.md'));
});

// #262: a first install never lays a pact agent over one of the person's with the same name.
test('a first install leaves your agent that shares a pact agent\'s name, and does not record it', t => {
  const repo = makeRepo(t);
  const h = home(t);
  mkdirSync(join(h, 'agents'), { recursive: true });
  writeFileSync(join(h, 'agents', 'scout.md'), MINE);
  apply(repo, h);
  assert.equal(readFileSync(join(h, 'agents', 'scout.md'), 'utf8'), MINE);
  assert.ok(!recorded(h).includes('agents/scout.md'));
  assert.ok(existsSync(join(h, 'agents', 'data-lens.md')), 'the other pact agents install');
});
