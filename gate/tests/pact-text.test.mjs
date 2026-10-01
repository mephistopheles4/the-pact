// Seam A's pact-text checks (#33): routing (C3), the shared risk-floor block
// (C4), and the required clauses, word for word. Each planted bad case
// asserts the rule it must fail on, on a fixture copy of the pact.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  GATE,
  READ_ONLY,
  REPO,
  failRules,
  lastLine,
  plainAgent,
  read,
  realPayload,
  runSeamA,
  sealedFamiliar,
  stage,
  tempDir,
  writeTree,
} from './helpers.mjs';

const MD = 'claude/CLAUDE.md';
const AG = 'AGENTS.md';
const PR = 'claude/agents/plan-reviewer.md';
const PROBE = 'claude/agents/probe.md';

const CLAUSES = {
  'risk-floor': MD,
  'no-skill-overrides': MD,
  'security-route': MD,
  'never-substitute': MD,
  'move-4': MD,
  'stop-and-escalate': MD,
  'install-go-ahead': AG,
};

// One weakening per clause: text inside its block, and what it becomes.
const WEAKEN = {
  'risk-floor': ['secrets, ', ''],
  'no-skill-overrides': [', the security route in move 3, or', ', or'],
  'security-route': ['however small', 'when it is large'],
  'never-substitute': ['stop and report', 'carry on'],
  'move-4': ['Then run `result-checker`,', 'Then,'],
  'stop-and-escalate': ['Tell me, and wait, when:', 'Tell me when:'],
  'install-go-ahead': ['only after they say so in chat', 'when ready'],
};

function file(root, rel) {
  return join(root, ...rel.split('/'));
}

function edit(root, rel, fn) {
  const p = file(root, rel);
  writeFileSync(p, fn(readFileSync(p, 'utf8')));
}

/** The [begin, end] line indices of a block's marker lines in text. */
function blockLines(text, name) {
  const lines = text.split('\n');
  const b = lines.findIndex(l => l.trim() === `<!-- pact:begin ${name} -->`);
  const e = lines.findIndex(l => l.trim() === `<!-- pact:end ${name} -->`);
  assert.ok(b >= 0 && e > b, `fixture has no ${name} block`);
  return [b, e];
}

/** Replace `from` with `to` inside a block only. */
function inBlock(text, name, from, to) {
  const lines = text.split('\n');
  const [b, e] = blockLines(text, name);
  const inner = lines.slice(b + 1, e).join('\n');
  assert.ok(inner.includes(from), `${name} block lacks ${JSON.stringify(from)}`);
  return [...lines.slice(0, b + 1), ...inner.replace(from, to).split('\n'), ...lines.slice(e)].join('\n');
}

/** Remove a block, its markers included; returns { text, block } with the removed lines. */
function cutBlock(text, name) {
  const lines = text.split('\n');
  const [b, e] = blockLines(text, name);
  return { text: [...lines.slice(0, b), ...lines.slice(e + 1)].join('\n'), block: lines.slice(b, e + 1) };
}

function run(t, { files = {}, route = true, prep } = {}) {
  const root = stage(t, files, { route });
  if (prep) prep(root);
  return { root, r: runSeamA(root) };
}

function expectFail(t, rule, opts) {
  const { r } = run(t, opts);
  assert.equal(lastLine(r.stdout), 'RESULT: fail', r.out);
  assert.notEqual(r.code, 0, r.out);
  assert.ok(failRules(r.stdout).includes(rule), `expected rule "${rule}" in:\n${r.out}`);
  return r;
}

function expectPass(t, opts) {
  const { r } = run(t, opts);
  assert.equal(r.code, 0, r.out);
  assert.equal(lastLine(r.stdout), 'RESULT: pass', r.out);
  return r;
}

/** The files named on FAIL lines for one rule. */
function failFiles(stdout, rule) {
  return stdout
    .split('\n')
    .filter(l => l.startsWith(`FAIL ${rule}: `))
    .map(l => l.slice(`FAIL ${rule}: `.length).split(':')[0].replace(/ line \d+$/, ''));
}

// ------------------------------------------------------------ the real pact

test('the real tree passes, with AGENTS.md staged', t => {
  const root = tempDir(t);
  realPayload(root);
  const r = runSeamA(root);
  assert.equal(r.code, 0, r.out);
  assert.equal(lastLine(r.stdout), 'RESULT: pass', r.out);
});

test('the pact before #33 fails routing for exactly test-reviewer, scout and Explore', t => {
  const root = tempDir(t);
  realPayload(root);
  writeFileSync(file(root, MD), read(join(GATE, 'tests', 'fixtures', 'CLAUDE.pre-33.md')));
  const r = runSeamA(root);
  assert.equal(lastLine(r.stdout), 'RESULT: fail', r.out);
  assert.deepEqual(failFiles(r.stdout, 'routing').sort(), [
    'claude/agents/Explore.md',
    'claude/agents/scout.md',
    'claude/agents/test-reviewer.md',
  ]);
});

test('every canonical text equals its block in the real pact', () => {
  for (const [name, rel] of Object.entries(CLAUSES)) {
    const text = read(join(REPO, ...rel.split('/')));
    const lines = text.split('\n');
    const [b, e] = blockLines(text, name);
    assert.equal(`${lines.slice(b + 1, e).join('\n')}\n`, read(join(GATE, 'clauses', `${name}.md`)), name);
  }
});

// ------------------------------------------------------------ C3 routing

test('bad case: an unrouted agent', t => {
  const r = expectFail(t, 'routing', { files: { [PROBE]: plainAgent('probe') }, route: false });
  assert.deepEqual(failFiles(r.stdout, 'routing'), [PROBE]);
});

test('the fixture router is what routes a test agent: the same stage passes with it', t => {
  expectPass(t, { files: { [PROBE]: plainAgent('probe') }, route: true });
});

test('bad case: an unrouted familiar', t => {
  const r = expectFail(t, 'routing', { route: false, prep: root => sealedFamiliar(root, 'probe') });
  assert.deepEqual(failFiles(r.stdout, 'routing'), ['familiars/probe.md']);
});

test('bad case: a name routed only in another case (explore for Explore)', t => {
  const r = expectFail(t, 'routing', {
    route: false,
    files: { 'claude/agents/Explore.md': read(join(REPO, 'claude', 'agents', 'Explore.md')) },
    prep: root => edit(root, MD, s => s.replace('use `Explore`.', 'use `explore`.')),
  });
  assert.deepEqual(failFiles(r.stdout, 'routing'), ['claude/agents/Explore.md']);
});

test('bad case: a name only inside a longer code span does not route', t => {
  const r = expectFail(t, 'routing', {
    route: false,
    files: { [PROBE]: plainAgent('probe') },
    prep: root => edit(root, MD, s => s.replace('use `scout`.', 'use `scout`. Also `probe-x` and `use probe`.')),
  });
  assert.deepEqual(failFiles(r.stdout, 'routing'), [PROBE]);
});

test('bad case: a name only in a paragraph that is not a listed role line does not route', t => {
  const r = expectFail(t, 'routing', {
    route: false,
    files: { [PROBE]: plainAgent('probe') },
    prep: root => edit(root, MD, s => s.replace('**Reading agents.** `plan-reviewer`,', '**Reading agents.** `probe`, `plan-reviewer`,')),
  });
  assert.deepEqual(failFiles(r.stdout, 'routing'), [PROBE]);
});

test('bad case: a name only in an added move 5 does not route', t => {
  const r = expectFail(t, 'routing', {
    route: false,
    files: { [PROBE]: plainAgent('probe') },
    prep: root => edit(root, MD, s => s.replace('   <!-- pact:end move-4 -->\n', '   <!-- pact:end move-4 -->\n5. **Extra.** Use `probe`.\n')),
  });
  assert.deepEqual(failFiles(r.stdout, 'routing'), [PROBE]);
});

test('bad case: a name only in fenced text inside a move does not route', t => {
  const r = expectFail(t, 'routing', {
    route: false,
    files: { [PROBE]: plainAgent('probe') },
    prep: root => edit(root, MD, s => s.replace('   <!-- pact:end move-4 -->\n', '   <!-- pact:end move-4 -->\n   ```\n   `probe`\n   ```\n')),
  });
  assert.deepEqual(failFiles(r.stdout, 'routing'), [PROBE]);
});

test('bad case: a name hidden in a comment fails the marker rule, and does not route', t => {
  const r = expectFail(t, 'marker', {
    route: false,
    files: { [PROBE]: plainAgent('probe') },
    prep: root => edit(root, MD, s => s.replace('   <!-- pact:end move-4 -->\n', '   <!-- pact:end move-4 -->\n   <!-- `probe` -->\n')),
  });
  assert.ok(failRules(r.stdout).includes('routing'), r.out);
});

test('bad case: a move number used twice', t => {
  expectFail(t, 'moves', { prep: root => edit(root, MD, s => s.replace('4. **I stay the owner.**', '3. **I stay the owner.**')) });
});

test('bad case: no "Implementing a change" section', t => {
  expectFail(t, 'routing', { prep: root => edit(root, MD, s => s.replace('## Implementing a change', '## Implementing changes')) });
});

// ------------------------------------------------------------ required clauses

for (const [name, rel] of Object.entries(CLAUSES)) {
  test(`bad case: a weakened required clause (${name}), on a fixture copy`, t => {
    const r = expectFail(t, 'required-clause', { prep: root => edit(root, rel, s => inBlock(s, name, ...WEAKEN[name])) });
    assert.match(r.stdout, new RegExp(`^FAIL required-clause: ${rel.replace('.', '\\.')}: ${name} `, 'm'), r.out);
  });

  test(`bad case: a removed required clause (${name})`, t => {
    expectFail(t, 'required-clause', { prep: root => edit(root, rel, s => cutBlock(s, name).text) });
  });
}

test('bad case: a missing AGENTS.md', t => {
  expectFail(t, 'pact-file', { prep: root => rmSync(file(root, AG)) });
});

test('bad case: an AGENTS.md that is not a regular file', t => {
  expectFail(t, 'pact-file', {
    prep: root => {
      rmSync(file(root, AG));
      mkdirSync(file(root, AG));
    },
  });
});

test('bad case: a missing CLAUDE.md', t => {
  expectFail(t, 'pact-file', { prep: root => rmSync(file(root, MD)) });
});

// ------------------------------------------------------------ anchors and framing

test('bad case: the security route moved out of move 3', t => {
  expectFail(t, 'anchor', {
    prep: root =>
      edit(root, MD, s => {
        const { text, block } = cutBlock(s, 'security-route');
        return `${text}\n## Superseded rules\n\n${block.join('\n')}\n`;
      }),
  });
});

test('bad case: move 4 moved into move 3', t => {
  expectFail(t, 'anchor', {
    prep: root =>
      edit(root, MD, s => {
        const { text, block } = cutBlock(s, 'move-4');
        return text.replace('   <!-- pact:end never-substitute -->\n', `   <!-- pact:end never-substitute -->\n${block.join('\n')}\n`);
      }),
  });
});

test('bad case: the risk floor moved to another section', t => {
  expectFail(t, 'anchor', {
    prep: root =>
      edit(root, MD, s => {
        const { text, block } = cutBlock(s, 'risk-floor');
        return text.replace('## Watching usage\n', `## Watching usage\n\n${block.join('\n')}\n`);
      }),
  });
});

test('bad case: the install go-ahead moved to another section of AGENTS.md', t => {
  expectFail(t, 'anchor', {
    prep: root =>
      edit(root, AG, s => {
        const { text, block } = cutBlock(s, 'install-go-ahead');
        return text.replace('## Where work lives\n', `## Where work lives\n\n${block.join('\n')}\n`);
      }),
  });
});

test('bad case: a required clause inside a fenced code block', t => {
  expectFail(t, 'marker', {
    prep: root =>
      edit(root, MD, s =>
        s.replace('<!-- pact:begin risk-floor -->', '```\n<!-- pact:begin risk-floor -->').replace('<!-- pact:end risk-floor -->', '<!-- pact:end risk-floor -->\n```'),
      ),
  });
});

// ------------------------------------------------------------ the marker grammar

test('bad case: a marker sharing its line with text', t => {
  expectFail(t, 'marker', {
    prep: root => edit(root, MD, s => s.replace('   <!-- pact:begin security-route -->\n   Anything', '   <!-- pact:begin security-route -->Anything')),
  });
});

for (const look of ['<!--pact:begin risk-floor -->', '<!-- PACT:begin risk-floor -->', '<!--  pact:begin risk-floor -->', '<!-- pact:begin risk-floor-->', '<!-- note -->']) {
  test(`bad case: a comment that is not an exact marker (${look})`, t => {
    expectFail(t, 'marker', { prep: root => edit(root, MD, s => s.replace('## Watching usage\n', `## Watching usage\n\n${look}\n`)) });
  });
}

test('bad case: an unknown block name', t => {
  expectFail(t, 'marker', {
    prep: root => edit(root, MD, s => s.replace('## Watching usage\n', '## Watching usage\n\n<!-- pact:begin zzz -->\nx\n<!-- pact:end zzz -->\n')),
  });
});

test('bad case: a block name used twice in one file', t => {
  expectFail(t, 'marker', {
    prep: root =>
      edit(root, MD, s => {
        const { block } = cutBlock(s, 'risk-floor');
        return s.replace('## Watching usage\n', `## Watching usage\n\n${block.join('\n')}\n`);
      }),
  });
});

test('bad case: an unclosed block', t => {
  expectFail(t, 'marker', { prep: root => edit(root, MD, s => s.replace('<!-- pact:end stop-and-escalate -->\n', '')) });
});

test('bad case: an end marker with no begin', t => {
  expectFail(t, 'marker', { prep: root => edit(root, MD, s => s.replace('<!-- pact:begin risk-floor -->\n', '')) });
});

test('bad case: nested blocks', t => {
  expectFail(t, 'marker', {
    prep: root =>
      edit(root, MD, s =>
        s.replace(
          '   <!-- pact:end security-route -->\n   <!-- pact:begin never-substitute -->\n',
          '   <!-- pact:begin never-substitute -->\n   <!-- pact:end security-route -->\n',
        ),
      ),
  });
});

test('bad case: a known block in a file not listed for it', t => {
  expectFail(t, 'marker', {
    prep: root => {
      const block = cutBlock(read(file(root, AG)), 'install-go-ahead').block;
      edit(root, MD, s => s.replace('## Watching usage\n', `## Watching usage\n\n${block.join('\n')}\n`));
    },
  });
});

test('bad case: the risk floor in AGENTS.md', t => {
  expectFail(t, 'marker', {
    prep: root => {
      const block = cutBlock(read(file(root, MD)), 'risk-floor').block;
      edit(root, AG, s => `${s}\n${block.join('\n')}\n`);
    },
  });
});

test('bad case: a marker in an agent that holds no block', t => {
  expectFail(t, 'marker', {
    files: { [PROBE]: plainAgent('probe', [], READ_ONLY).replace('Body.\n', 'Body.\n<!-- pact:begin risk-floor -->\nx\n<!-- pact:end risk-floor -->\n') },
  });
});

test('bad case: another comment in the holder agent', t => {
  expectFail(t, 'marker', { prep: root => edit(root, PR, s => `${s}\n<!-- note -->\n`) });
});

// ------------------------------------------------------------ C4 shared block

test('bad case: a drifted shared block in plan-reviewer', t => {
  expectFail(t, 'shared-block', { prep: root => edit(root, PR, s => inBlock(s, 'risk-floor', 'secrets, ', '')) });
});

test('bad case: plan-reviewer without the shared block', t => {
  expectFail(t, 'shared-block', { prep: root => edit(root, PR, s => cutBlock(s, 'risk-floor').text) });
});

test('bad case: no plan-reviewer to hold the shared block', t => {
  expectFail(t, 'shared-block', { prep: root => rmSync(file(root, PR)) });
});

/** The real plan-reviewer's body, after its frontmatter. */
function reviewerBody() {
  const s = read(join(REPO, ...PR.split('/')));
  return s.slice(s.indexOf('\n---\n') + 5);
}

test('the shared block is found in a plan-reviewer familiar, by name', t => {
  expectPass(t, {
    prep: root => {
      rmSync(file(root, PR));
      sealedFamiliar(root, 'plan-reviewer', { body: reviewerBody() });
    },
  });
});

test('bad case: a drifted shared block in a plan-reviewer familiar', t => {
  expectFail(t, 'shared-block', {
    prep: root => {
      rmSync(file(root, PR));
      sealedFamiliar(root, 'plan-reviewer', { body: inBlock(reviewerBody(), 'risk-floor', 'secrets, ', '') });
    },
  });
});

// ------------------------------------------------------------ the pact files' characters

test('bad case: an invisible character in CLAUDE.md', t => {
  expectFail(t, 'invisible', { prep: root => edit(root, MD, s => s.replace('## Watching usage', '## Watching​ usage')) });
});

test('bad case: a byte-order mark on AGENTS.md', t => {
  expectFail(t, 'bom', { prep: root => edit(root, AG, s => `﻿${s}`) });
});

test('bad case: a carriage return in CLAUDE.md', t => {
  expectFail(t, 'characters', { prep: root => edit(root, MD, s => s.replace('\n', '\r\n')) });
});

// ------------------------------------------------------------ the canonical texts

function gateCopy(t, editGate) {
  const g = tempDir(t);
  for (const f of ['seam-a.mjs', 'pact-text.mjs', 'tool-allowlist.json', 'grimoire', 'clauses']) cpSync(join(GATE, f), join(g, f), { recursive: true });
  editGate(g);
  return join(g, 'seam-a.mjs');
}

for (const [label, change] of [
  ['a carriage return', s => s.replace('\n', '\r\n')],
  ['no final newline', s => s.slice(0, -1)],
  ['two final newlines', s => `${s}\n`],
]) {
  test(`bad case: a canonical text with ${label}`, t => {
    const script = gateCopy(t, g => edit(g, 'clauses/security-route.md', change));
    const r = runSeamA(stage(t, {}), script);
    assert.equal(lastLine(r.stdout), 'RESULT: fail', r.out);
    assert.ok(failRules(r.stdout).includes('clause-text'), r.out);
  });
}

test('bad case: a missing canonical text', t => {
  const script = gateCopy(t, g => rmSync(join(g, 'clauses', 'move-4.md')));
  const r = runSeamA(stage(t, {}), script);
  assert.equal(lastLine(r.stdout), 'RESULT: fail', r.out);
  assert.ok(failRules(r.stdout).includes('clause-text'), r.out);
});

// ------------------------------------------------------------ never echoes content

test('canary: no drifted text, unknown block name or comment text is echoed', t => {
  const C = 'canaryzq';
  const { r } = run(t, {
    prep: root => {
      edit(root, MD, s => inBlock(s, 'move-4', 'Then run', `Then ${C} run`));
      edit(root, MD, s => s.replace('## Watching usage\n', `## Watching usage\n\n<!-- pact:begin ${C} -->\nx\n<!-- pact:end ${C} -->\n<!-- ${C} -->\n<!-- pact:begin ${C}-${C}-->\n`));
      edit(root, PR, s => inBlock(s, 'risk-floor', 'secrets', `${C} secrets`));
    },
  });
  assert.equal(lastLine(r.stdout), 'RESULT: fail', r.out);
  assert.ok(!r.out.toLowerCase().includes(C), r.out);
});

// ------------------------------------------------------------ the user-only-skill check

test('the user-only-skill check still passes on the marked pact', t => {
  const which = spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', ['pwsh'], { encoding: 'utf8' });
  const pwsh = which.stdout.split(/\r?\n/)[0].trim();
  const skills = tempDir(t, 'pact-skills-');
  const flagged = '---\nname: x\ndisable-model-invocation: true\n---\n';
  for (const s of ['triage', 'to-spec', 'to-tickets', 'wayfinder', 'implement']) writeTree(skills, { [`${s}/SKILL.md`]: flagged });
  writeTree(skills, { 'tdd/SKILL.md': '---\nname: tdd\n---\n' });
  const r = spawnSync(
    pwsh,
    ['-NoProfile', '-NonInteractive', '-File', join(REPO, 'scripts', 'check-skill-flags.ps1'), '-SkillsDir', skills, '-ClaudeMd', join(REPO, 'claude', 'CLAUDE.md')],
    { encoding: 'utf8' },
  );
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^named skills: 6; user-only: 5; OK\s*$/m, r.stdout + r.stderr);
});

// ------------------------------------------------------------ Markdown structure (diff review N1)

for (const [label, change] of [
  ['mixed fences around a block', s => s.replace('<!-- pact:begin risk-floor -->', '~~~\n```\n<!-- pact:begin risk-floor -->').replace('<!-- pact:end risk-floor -->', '<!-- pact:end risk-floor -->\n```\n~~~')],
  ['a fence indented four spaces', s => s.replace('## Watching usage\n', '    ```\n## Watching usage\n')],
  ['a setext heading', s => s.replace('**Risk floor.**\n', 'Retired rules\n=============\n\n**Risk floor.**\n')],
  ['an indented heading', s => s.replace('**Risk floor.**\n', '   ## Retired rules\n\n**Risk floor.**\n')],
  ['a heading after a tab', s => s.replace('**Risk floor.**\n', '##\tRetired rules\n\n**Risk floor.**\n')],
  ['a section title used twice, under a new top heading', s => `${s}\n# Retired\n\n## Implementing a change\n`],
]) {
  test(`bad case: ${label} in CLAUDE.md`, t => {
    expectFail(t, 'structure', { prep: root => edit(root, MD, change) });
  });
}

test('bad case: a top-level heading in AGENTS.md after its first line', t => {
  expectFail(t, 'structure', { prep: root => edit(root, AG, s => s.replace('## Changes here reach every project\n', '# Retired\n\n## Changes here reach every project\n')) });
});

test('bad case: a required clause under a subheading in its section', t => {
  expectFail(t, 'anchor', { prep: root => edit(root, MD, s => s.replace('**Risk floor.**\n', '### Retired rules\n\n**Risk floor.**\n')) });
});

test('bad case: the shared block after a fenced code block in plan-reviewer', t => {
  expectFail(t, 'shared-block', {
    prep: root =>
      edit(root, PR, s => {
        const { text, block } = cutBlock(s, 'risk-floor');
        return `${text}\n${block.join('\n')}\n`;
      }),
  });
});