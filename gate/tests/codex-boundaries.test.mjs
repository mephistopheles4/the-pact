import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from './tree.mjs';
import { reviewPath } from '../../codex/review-path.mjs';
import { verifyCI } from '../../codex/ci.mjs';

test('Codex private review rejects repository paths, network roots and directory aliases', t => {
  const home = tempDir(t), repo = tempDir(t), allowed = join(home, '.codex/visualizations');
  mkdirSync(allowed, { recursive: true });
  assert.equal(reviewPath(join(allowed, 'run'), home, repo), join(allowed, 'run'));
  assert.throws(() => reviewPath(join(repo, 'private'), home, repo), /repository/);
  assert.throws(() => reviewPath(join(home, 'ordinary-folder'), home, repo), /private Codex/);
  assert.throws(() => reviewPath('//server/private', home, repo), /local/);
  symlinkSync(repo, join(allowed, 'alias'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => reviewPath(join(allowed, 'alias/run'), home, repo), /linked/);
  if (process.platform === 'win32') assert.throws(() => reviewPath(join(repo.toUpperCase(), 'private'), home, repo), /repository/);
});

test('Codex CI rejects matching names from another app or workflow', () => {
  const head = 'a'.repeat(40), run = { head_sha: head, path: '.github/workflows/gate.yml', head_repository: { full_name: 'mephistopheles4/the-pact' }, status: 'completed', conclusion: 'success' };
  const checks = ['gate', 'gate-windows'].map((name, i) => ({ name, head_sha: head, conclusion: 'success', app: { slug: 'github-actions' }, details_url: `https://github.com/mephistopheles4/the-pact/actions/runs/123/job/${i}` }));
  assert.equal(verifyCI(checks, head, () => run).length, 2);
  assert.throws(() => verifyCI([{ ...checks[0], app: { slug: 'other' } }, checks[1]], head, () => run), /CI jobs/);
  assert.throws(() => verifyCI(checks, head, () => ({ ...run, path: '.github/workflows/other.yml' })), /workflow/);
  for (const patch of [{ head_sha: 'b'.repeat(40) }, { conclusion: 'failure' }, { details_url: 'https://other.invalid/actions/runs/123/job/1' }]) {
    assert.throws(() => verifyCI([{ ...checks[0], ...patch }, checks[1]], head, () => run));
  }
  for (const patch of [{ head_sha: 'b'.repeat(40) }, { head_repository: { full_name: 'other/repo' } }, { status: 'in_progress' }, { conclusion: 'failure' }]) {
    assert.throws(() => verifyCI(checks, head, () => ({ ...run, ...patch })), /workflow/);
  }
});
