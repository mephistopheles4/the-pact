// #127: the "Matt Pocock's skills" preset set. Three example blocks, one each for
// moves 1 to 3, added after the default text. Applied through the renderer, the
// result must pass seam A, the skill-flag check must report no mismatch on it,
// and each skill must appear in its intended form: a command (`/name`) for a
// skill only the owner starts, a code span (`name`) for a skill the agent uses.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { REPO, SEAM_A, lastLine, renderStage, routeTree, stage, tempDir } from './helpers.mjs';

const BLOCKS = join(REPO, 'examples', 'pact-config', 'blocks');
const SET = [
  { mark: 'move-1', file: 'move-1-matt-pocock.md' },
  { mark: 'move-2', file: 'move-2-matt-pocock.md' },
  { mark: 'move-3', file: 'move-3-matt-pocock.md' },
];
const COMMANDS = ['triage', 'to-spec', 'to-tickets', 'wayfinder', 'implement'];
const SPANS = ['diagnosing-bugs', 'grilling', 'domain-modeling', 'codebase-design', 'prototype', 'tdd'];

/** A Claude home folder that binds the set, as the owner's configuration would. */
function homeWithSet(t, set = SET) {
  const h = tempDir(t, 'pact-preset-home-');
  mkdirSync(join(h, 'pact', 'blocks'), { recursive: true });
  const edits = set.map(e => ({ mark: e.mark, op: 'add-after', file: e.file }));
  writeFileSync(join(h, 'pact', 'config.json'), JSON.stringify({ schema: 1, edits }));
  for (const e of set) writeFileSync(join(h, 'pact', 'blocks', e.file), readFileSync(join(BLOCKS, e.file)));
  return h;
}

/** The pact's rules file rendered with `home`, in a staged tree. Returns { root, md }. */
function renderedWith(t, home) {
  const root = stage(t, {}, { route: false });
  routeTree(root);
  renderStage(root, home);
  return { root, md: readFileSync(join(root, 'claude', 'CLAUDE.md'), 'utf8') };
}

test('the set renders with seam A passing', t => {
  const { root } = renderedWith(t, homeWithSet(t));
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  const r = spawnSync(process.execPath, [SEAM_A, root], { encoding: 'utf8', env });
  assert.equal(lastLine(r.stdout), 'RESULT: pass', r.stdout + r.stderr);
});

test('each block is added after the default text, in its own move', t => {
  const { md } = renderedWith(t, homeWithSet(t));
  const m1 = md.indexOf('I triage it:');
  const b1 = md.indexOf('Skills I bind to this move. Triage');
  const m2 = md.indexOf('You question me until');
  const b2 = md.indexOf('Skills I bind to this move. Questioning');
  const m3 = md.indexOf('On the thorough tier, I cut the approved spec');
  const b3 = md.indexOf('Skills I bind to this move. Cutting');
  assert.ok(m1 >= 0 && b1 > m1 && b1 < m2, 'move 1 block follows the move 1 text');
  assert.ok(m2 > b1 && b2 > m2 && b2 < m3, 'move 2 block follows the move 2 text');
  assert.ok(m3 > b2 && b3 > m3, 'move 3 block follows the move 3 text');
});

test('each skill appears in its intended form', t => {
  const { md } = renderedWith(t, homeWithSet(t));
  for (const n of COMMANDS) assert.ok(md.includes(`\`/${n}\``), `${n} is not written as a command`);
  for (const n of SPANS) assert.ok(md.includes(`\`${n}\``), `${n} is not written as a code span`);
  for (const n of COMMANDS) assert.ok(!md.includes(`\`${n}\``), `${n} is also written as a code span`);
  for (const n of SPANS) assert.ok(!md.includes(`\`/${n}\``), `${n} is also written as a command`);
});

/** Run the skill-flag check on `md` with the 11 skills installed, the owner's five flagged. */
function skillFlags(t, md, flagged = COMMANDS) {
  const which = spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', ['pwsh'], { encoding: 'utf8' });
  const pwsh = which.stdout.split(/\r?\n/)[0].trim();
  const root = tempDir(t, 'pact-preset-skills-');
  for (const n of [...COMMANDS, ...SPANS]) {
    mkdirSync(join(root, 'skills', n), { recursive: true });
    const flag = flagged.includes(n) ? 'disable-model-invocation: true\n' : '';
    writeFileSync(join(root, 'skills', n, 'SKILL.md'), `---\nname: ${n}\n${flag}---\n`);
  }
  writeFileSync(join(root, 'rules.md'), md);
  return spawnSync(
    pwsh,
    ['-NoProfile', '-NonInteractive', '-File', join(REPO, 'scripts', 'check-skill-flags.ps1'), '-SkillsDir', join(root, 'skills'), '-RulesFile', join(root, 'rules.md')],
    { encoding: 'utf8' },
  );
}

test('the skill-flag check reports no mismatch on the render', t => {
  const { md } = renderedWith(t, homeWithSet(t));
  const r = skillFlags(t, md);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /^WARN:/m, r.stdout);
  assert.match(r.stdout, /^named skills: 11; commands: 5; OK\s*$/m, r.stdout + r.stderr);
});

test('bad case: the same render warns when an owner-only skill lacks its flag', t => {
  const { md } = renderedWith(t, homeWithSet(t));
  const r = skillFlags(t, md, COMMANDS.filter(n => n !== 'to-spec'));
  assert.match(r.stdout, /^WARN: to-spec is written as a command /m, r.stdout);
  assert.doesNotMatch(r.stdout, /OK/, r.stdout);
});

test('bad case: the render warns when the agent\'s skill carries the flag', t => {
  const { md } = renderedWith(t, homeWithSet(t));
  const r = skillFlags(t, md, [...COMMANDS, 'tdd']);
  assert.match(r.stdout, /^WARN: tdd is written as a code span /m, r.stdout);
});

test('the default render, with no set bound, still names no skill', t => {
  const empty = tempDir(t, 'pact-preset-empty-');
  const { md } = renderedWith(t, empty);
  const r = skillFlags(t, md);
  assert.match(r.stdout, /^named skills: 0; commands: 0; OK\s*$/m, r.stdout + r.stderr);
});
