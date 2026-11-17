import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { tempDir } from './tree.mjs';
import { portCleaner } from '../../codex/cleaner-port.mjs';
import { codexSessionCwds } from '../../codex/cleaner-sessions.mjs';

test('Codex cleaner refuses unavailable active-session inventory', t => {
  assert.throws(() => codexSessionCwds(tempDir(t)), /inventory unavailable/);
});

test('Codex cleaner retains active worktrees, then removes a clean archived worktree with a fresh tag', async t => {
  const root = tempDir(t), home = tempDir(t), repo = join(root, 'repo');
  mkdirSync(repo); mkdirSync(join(home, '.codex'), { recursive: true });
  const env = { ...process.env, GIT_CONFIG_GLOBAL: join(root, 'no-global'), GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 't', GIT_COMMITTER_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid', GIT_COMMITTER_EMAIL: 't@example.invalid' };
  for (const k of Object.keys(env)) if (/^GIT_(DIR|WORK_TREE|INDEX_FILE|COMMON_DIR)$/i.test(k)) delete env[k];
  const git = args => {
    const r = spawnSync('git', args, { cwd: repo, env, encoding: 'utf8', windowsHide: true });
    assert.equal(r.status, 0, r.stderr); return r.stdout;
  };
  git(['init', '-q', '-b', 'main']); writeFileSync(join(repo, 'a'), 'a'); git(['add', '.']); git(['commit', '-qm', 'initial']);
  const worktreesRoot = join(root, '.codex/worktrees');
  const worktree = join(worktreesRoot, 'abcd/repo');
  mkdirSync(join(home, '.codex/pact'), { recursive: true });
  writeFileSync(join(home, '.codex/pact/mirror-source.json'), JSON.stringify({ schema: 1, worktreesRoot }));
  git(['worktree', 'add', '-qb', 'codex/test', worktree]);
  const db = new DatabaseSync(join(home, '.codex/state_5.sqlite'));
  try {
  db.exec('CREATE TABLE threads (cwd TEXT, archived INTEGER)');
  db.prepare('INSERT INTO threads VALUES (?, 0)').run(worktree);
  assert.deepEqual(codexSessionCwds(home), [worktree]);
  const source = readFileSync(new URL('../../claude/tools/cleaner.mjs', import.meta.url), 'utf8');
  assert.throws(() => portCleaner(source.replace('const name = basename(path);', 'const name = "changed";')), /source changed/);
  writeFileSync(join(root, 'cleaner.mjs'), portCleaner(source));
  writeFileSync(join(root, 'cleaner-sessions.mjs'), readFileSync(new URL('../../codex/cleaner-sessions.mjs', import.meta.url)));
  const { clean } = await import(pathToFileURL(join(root, 'cleaner.mjs')).href);
  const io = { env, home, cwd: repo };
  const kept = clean(['show'], io);
  assert.equal(kept.code, 0, kept.lines.join('\n'));
  assert.match(kept.lines.join('\n'), /worktree abcd/);
  assert.doesNotMatch(kept.lines.join('\n'), /^  tag /m);
  db.exec('UPDATE threads SET archived = 1');
  const shown = clean(['show'], io);
  const tags = /^RESULT: shown \d+ (\S+)$/m.exec(shown.lines.join('\n'))?.[1];
  assert.ok(tags, shown.lines.join('\n'));
  const removed = clean(['remove', '--yes', tags], io);
  assert.equal(removed.code, 0, removed.lines.join('\n'));
  assert.doesNotMatch(git(['worktree', 'list', '--porcelain']), /abcd/);
  } finally { db.close(); }
});
