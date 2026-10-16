// #127, moved by #262: the "Matt Pocock's skills" set. The moves are upheld at
// all times, so the set binds no skill to a move: it is one example block for
// the workflow part, with a Skills column binding each skill to a stage, as the
// builder's skill nodes compile it. Applied through the renderer, the result
// must pass seam A, and each skill must appear in its intended form: a command
// (`/name`), offered, for a skill only the owner starts; a code span (`name`),
// used, for a skill the agent uses.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { renderStage } from './gate-run.mjs';
import { stage } from './payload.mjs';
import { REPO, SEAM_A, lastLine } from './text.mjs';
import { tempDir } from './tree.mjs';

const BLOCKS = join(REPO, 'examples', 'pact-config', 'blocks');
// The shipped configuration that binds the set: the file a person copies.
const CONFIG = join(REPO, 'examples', 'pact-config', 'config-matt-pocock-skills.json');
const SET = JSON.parse(readFileSync(CONFIG, 'utf8')).edits;

test('the shipped set configuration replaces the workflow part with the one block', () => {
  assert.deepEqual(SET, [{ mark: 'workflow', op: 'replace', file: 'workflow-matt-pocock-skills.md' }]);
});
const COMMANDS = ['triage', 'to-spec', 'to-tickets', 'wayfinder'];
const SPANS = ['diagnosing-bugs', 'grilling', 'domain-modeling', 'codebase-design', 'prototype', 'tdd'];

/** A Claude home folder that binds the set, as the owner's configuration would. */
function homeWithSet(t, set = SET) {
  const h = tempDir(t, 'pact-preset-home-');
  mkdirSync(join(h, 'pact', 'blocks'), { recursive: true });
  writeFileSync(join(h, 'pact', 'config.json'), readFileSync(CONFIG));
  for (const e of set) writeFileSync(join(h, 'pact', 'blocks', e.file), readFileSync(join(BLOCKS, e.file)));
  return h;
}

/** The pact's rules file rendered with `home`, in a staged tree. Returns { root, md }. */
function renderedWith(t, home) {
  const root = stage(t);
  renderStage(root, home);
  return { root, md: readFileSync(join(root, 'claude', 'CLAUDE.md'), 'utf8') };
}

test('the set renders with seam A passing', t => {
  const { root } = renderedWith(t, homeWithSet(t));
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  const r = spawnSync(process.execPath, [SEAM_A, root, '--commands', 'none', '--tools', 'none'], { encoding: 'utf8', env });
  assert.equal(lastLine(r.stdout), 'RESULT: pass', r.stdout + r.stderr);
});

const BLOCK = readFileSync(join(BLOCKS, 'workflow-matt-pocock-skills.md'), 'utf8');
/** The Skills cell of the stage row `stage` in the block's table. */
const skillsAt = stage => {
  const head = BLOCK.split('\n')[0].split('|').map(c => c.trim());
  const row = BLOCK.split('\n').find(l => l.startsWith(`| ${stage} |`));
  return row.split('|').map(c => c.trim())[head.indexOf('Skills, and when')];
};

test('each skill appears in its intended form, at its stage: a command offered, a code span used', () => {
  const cells = ['Plan', 'Design', 'Build'].map(skillsAt).join('; ');
  for (const n of COMMANDS) assert.match(cells, new RegExp(`\`/${n}\`: offered`), n);
  for (const n of SPANS) assert.match(cells, new RegExp(`(?<!/)\`${n}\`: used`), n);
  assert.match(skillsAt('Build'), /`tdd`: used, every build/);
  assert.equal(skillsAt('Test'), 'none');
});

test('the render carries the block as the workflow part', t => {
  const { md } = renderedWith(t, homeWithSet(t));
  assert.ok(md.includes(BLOCK), 'the block is not in the render');
});
