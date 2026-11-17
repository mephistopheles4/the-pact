import assert from 'node:assert/strict';
import { test } from 'node:test';
import { win32, posix, delimiter, join } from 'node:path';
import { mkdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tempDir } from './tree.mjs';
import * as installer from '../../codex/install.mjs';

test('Codex executable lookup excludes the checkout but accepts sibling and other-drive tools', () => {
  const root = 'H:\\work\\the-pact';
  assert.equal(installer.repositoryPath(root, 'C:\\tools\\git.exe', win32), false);
  assert.equal(installer.repositoryPath(root, 'h:\\WORK\\THE-PACT\\bin\\git.exe', win32), true);
  assert.equal(installer.repositoryPath(root, 'H:\\work\\the-pact-other\\git.exe', win32), false);
  assert.equal(installer.repositoryPath('/work/repo', '/work/repo/bin/git', posix), true);
  assert.equal(installer.repositoryPath('/work/repo', '/work/Repo/bin/git', posix), false);
});

test('Codex executable lookup resolves checkout and PATH aliases before exclusion', t => {
  const root = tempDir(t), repository = join(root, 'checkout'), outside = join(root, 'tools');
  mkdirSync(join(repository, 'bin'), { recursive: true }); mkdirSync(outside);
  const filename = process.platform === 'win32' ? 'fixture.exe' : 'fixture';
  writeFileSync(join(repository, 'bin', filename), 'checkout program');
  writeFileSync(join(outside, filename), 'external program');
  const alias = join(root, 'checkout-alias'), externalAlias = join(root, 'external-alias');
  const kind = process.platform === 'win32' ? 'junction' : 'dir';
  symlinkSync(repository, alias, kind); symlinkSync(outside, externalAlias, kind);
  assert.equal(installer.tool('fixture', { repository, searchPath: [join(alias, 'bin'), outside].join(delimiter) }), realpathSync(join(outside, filename)));
  assert.throws(() => installer.tool('fixture', { repository: alias, searchPath: join(repository, 'bin') }), /unavailable/);
  assert.equal(installer.tool('fixture', { repository, searchPath: externalAlias }), join(externalAlias, filename));
  if (process.platform !== 'win32') {
    const shim = join(outside, 'dispatch-fixture');
    symlinkSync(process.execPath, shim);
    const selected = installer.tool('dispatch-fixture', { repository, searchPath: outside });
    assert.equal(selected, shim);
    const invoked = spawnSync(selected, ['-e', 'process.stdout.write(process.argv0)'], { encoding: 'utf8' });
    assert.equal(invoked.status, 0, invoked.stderr);
    assert.equal(invoked.stdout, shim);
  }
  if (process.platform === 'win32') assert.throws(() => installer.tool('fixture', { repository: repository.toUpperCase(), searchPath: join(alias, 'bin') }), /unavailable/);
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
