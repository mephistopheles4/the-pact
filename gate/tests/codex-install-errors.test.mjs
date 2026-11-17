import assert from 'node:assert/strict';
import { test } from 'node:test';
import { win32, posix } from 'node:path';
import * as installer from '../../codex/install.mjs';

test('Codex executable lookup excludes the checkout but accepts sibling and other-drive tools', () => {
  const root = 'H:\\work\\the-pact';
  assert.equal(installer.repositoryPath(root, 'C:\\tools\\git.exe', win32), false);
  assert.equal(installer.repositoryPath(root, 'h:\\WORK\\THE-PACT\\bin\\git.exe', win32), true);
  assert.equal(installer.repositoryPath(root, 'H:\\work\\the-pact-other\\git.exe', win32), false);
  assert.equal(installer.repositoryPath('/work/repo', '/work/repo/bin/git', posix), true);
  assert.equal(installer.repositoryPath('/work/repo', '/work/Repo/bin/git', posix), false);
});

test('Codex failure report distinguishes incomplete recovery without exposing raw errors', () => {
  const failure = Object.assign(new AggregateError([Error('private original'), Error('private recovery')]), {
    code: 'ROLLBACK_REQUIRED', backupPath: '/private/review/backup.json', backupDigest: 'a'.repeat(64), diagnosticsPath: '/private/review/recovery-error.json',
  });
  const report = installer.failureReport(failure);
  assert.equal(report.code, 3);
  assert.match(report.lines.join('\n'), /ROLLBACK REQUIRED/);
  assert.ok(report.lines.includes('Backup: /private/review/backup.json'));
  assert.ok(report.lines.includes('Backup digest: ' + 'a'.repeat(64)));
  assert.ok(report.lines.includes('Private diagnostics: /private/review/recovery-error.json'));
  assert.doesNotMatch(report.lines.join('\n'), /private original|private recovery|Nothing may be applied/);
  assert.equal(report.lines.at(-1), 'RESULT: rollback required');
  assert.doesNotMatch(installer.failureReport({ ...failure, diagnosticsPath: undefined }).lines.join('\n'), /Private diagnostics/);
  assert.equal(installer.failureReport(Error('private input')).code, 2);
  assert.doesNotMatch(installer.failureReport(Error('private input')).lines.join('\n'), /private input/);
});
