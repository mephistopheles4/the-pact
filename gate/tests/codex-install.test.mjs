import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { codexFixture } from './codex-fixture.mjs';
import { snapshot } from '../../codex/source.mjs';
import { digest } from '../../codex/transaction.mjs';

test('Codex source fixture retains full skills and reports missing source resources; managed drift refuses', t => {
  const f = codexFixture(t), s = snapshot(f.home, f.code, process.execPath);
  assert.equal(s.files.filter(r => /^\.agents\/skills\/[^/]+\/SKILL\.md$/.test(r.path)).length, 7);
  assert.equal(s.skillCount, 2); assert.equal(s.supportingSkills, 1);
  assert.equal(s.files.filter(r => r.path.startsWith('.codex/agents/')).length, 9);
  const hooks = JSON.parse(s.files.find(r => r.path === '.codex/hooks.json').text);
  assert.equal(hooks.hooks.PreToolUse.flatMap(g => g.hooks).filter(h => h.command.includes('athanor-hook.mjs')).length, 1);
  assert.ok(s.files.find(r => r.path === '.codex/pact/hooks/athanor-guard.source.mjs'));
  assert.match(s.files.find(r => r.path === '.codex/pact/hooks/athanor-hook.mjs').text, /from '\.\/athanor-guard.source\.mjs'/);
  assert.equal(s.files.find(r => r.path === '.agents/references/definition-of-done.md').bytes.toString(), 'Fixture shared requirement.\n');
  unlinkSync(join(f.source, 'references/definition-of-done.md'));
  assert.equal(snapshot(f.home, f.code, process.execPath).warnings.length, 1);
  writeFileSync(join(f.source, 'CLAUDE.md'), 'drift');
  assert.throws(() => snapshot(f.home, f.code, process.execPath), /source drift/);
});

test('Codex actual CLI dry run makes zero live writes; stale source refuses; approved fixture apply rolls back', t => {
  const f = codexFixture(t), review = join(f.home, '.codex/visualizations/review');
  const dry = f.cli(['--review-dir', review]);
  assert.equal(dry.status, 0, dry.stdout + dry.stderr);
  assert.match(dry.stdout, /Live writes: 0/);
  assert.equal(existsSync(join(f.home, '.codex/workflows/scriptorium/workflow.md')), false);
  const reviewed = JSON.parse(readFileSync(join(review, 'plan.json'))), id = digest(reviewed);
  const original = readFileSync(join(f.source, 'pact/config.json'));
  writeFileSync(join(f.source, 'pact/config.json'), JSON.stringify({ schema: 1, tools: ['poster', 'cleaner'], settings: { 'usage-pause': 80 } }));
  const stale = f.cli(['apply', '--review-dir', review, '--digest', id]);
  assert.equal(stale.status, 2); assert.equal(existsSync(join(f.home, '.codex/config.toml')), false);
  writeFileSync(join(f.source, 'pact/config.json'), original);
  const applied = f.cli(['apply', '--review-dir', review, '--digest', id]);
  assert.equal(applied.status, 0, applied.stdout + applied.stderr);
  assert.match(readFileSync(join(f.home, '.codex/workflows/scriptorium/workflow.md'), 'utf8'), /Keep every guard/);
  const backup = readFileSync(join(review, 'backup.json'));
  const reverted = f.cli(['rollback', '--review-dir', review, '--digest', digest(backup)]);
  assert.equal(reverted.status, 0, reverted.stdout + reverted.stderr);
  assert.equal(existsSync(join(f.home, '.codex/config.toml')), false);
});
