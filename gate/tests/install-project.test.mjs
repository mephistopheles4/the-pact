// The project install (#53, slice 5), end to end: the install script against
// a throwaway repo, a throwaway Claude home folder and throwaway projects.
// The throwaway home is <tmp>/home with -ClaudeHome <tmp>/home/.claude, so a
// project under <tmp>/home sits beside the Claude folder, as a real one does.
// Cases that would reach the real home folder run as dry runs only.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import { test } from 'node:test';
import { WIN, git, install, makeRepo, refused } from './install-harness.mjs';
import { tempDir } from './helpers.mjs';

const sha256 = b => createHash('sha256').update(b).digest('hex');
const RULES = ['.claude', 'rules', 'pact-project.md'];
const RECORD = ['.claude', 'rules', 'pact-project.record.json'];
const FOLD = WIN || process.platform === 'darwin';
const under = (inner, outer) => {
  const f = s => (FOLD ? s.toLowerCase() : s);
  const a = f(inner).split(sep).filter(Boolean);
  const b = f(outer).split(sep).filter(Boolean);
  return b.length <= a.length && b.every((s, i) => s === a[i]);
};

/** A throwaway <tmp>/home holding the Claude home folder .claude. */
function layout(t) {
  const root = tempDir(t, 'pact-proj-');
  const homeDir = join(root, 'home');
  const ch = join(homeDir, '.claude');
  mkdirSync(ch, { recursive: true });
  return { root, homeDir, ch };
}

const projectJson = n => `{"schema": 1, "settings": {"usage-pause": ${n}}}\n`;

/** A project folder at `p` whose configuration sets the usage pause to `n`. */
function projectAt(p, n = 60) {
  mkdirSync(join(p, '.claude'), { recursive: true });
  writeFileSync(join(p, '.claude', 'pact-config.json'), projectJson(n));
  return p;
}

function userFile(ch, n) {
  mkdirSync(join(ch, 'pact'), { recursive: true });
  writeFileSync(join(ch, 'pact', 'config.json'), `{"schema": 1, "settings": {"usage-pause": ${n}}}\n`);
}

const projInstall = (repo, ch, proj, { apply = false, extra = [], ...rest } = {}) => install(repo, ch, { apply, extra: ['-ProjectFolder', proj, ...extra], ...rest });

function projectHash(r) {
  const m = /^ {2}rendered project rules file: sha256 ([0-9a-f]{64})\r?$/m.exec(r.stdout);
  assert.ok(m, r.out);
  return m[1];
}

/** Every entry under `dir`, by kind, with each file's hash; links are recorded, never followed. */
function snapshot(dir) {
  const out = [];
  const walk = d => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      const st = lstatSync(p);
      const rel = p.slice(dir.length);
      if (st.isSymbolicLink()) out.push(`link ${rel}`);
      else if (st.isDirectory()) {
        out.push(`dir ${rel}`);
        walk(p);
      } else out.push(`file ${rel} ${sha256(readFileSync(p))}`);
    }
  };
  if (existsSync(dir)) walk(dir);
  return out.sort();
}

/** The project rules file the tests expect, for the usage pause at `n`. */
function expectedRules(n) {
  return [
    '# Pact settings for this project',
    '',
    "The pact's installer wrote this file from this project's pact configuration. Each line can only make the pact stricter here.",
    '',
    `- **Usage pause.** In this project, wait for my go-ahead when the weekly limit is above ${n}% or above the line in my user rules, whichever is lower.`,
    '',
  ].join('\n');
}

/** Plant a file link, or skip when this system can't make one. */
function fileLink(t, target, at) {
  try {
    symlinkSync(target, at, 'file');
    return true;
  } catch {
    t.skip('cannot create a file link here (not run)');
    return false;
  }
}

// ------------------------------------------------------------ projects that install

test('a project nested under the throwaway home installs: only its rules file and record, the home untouched', t => {
  const repo = makeRepo(t);
  const { homeDir, ch } = layout(t);
  userFile(ch, 90);
  const proj = projectAt(join(homeDir, 'proj'), 80);
  const homeBefore = snapshot(homeDir).filter(e => !e.includes(`${sep}proj`));
  const projBefore = snapshot(proj);

  const dry = projInstall(repo, ch, proj);
  assert.equal(dry.code, 0, dry.out);
  assert.match(dry.stdout, /^ {2}rules file \.claude\/rules\/pact-project\.md: would be written \(new\)\r?$/m, dry.out);
  assert.match(dry.stdout, /^Check: passed on commit /m, dry.out);
  assert.deepEqual(snapshot(proj), projBefore, 'a dry run writes nothing');
  const hash = projectHash(dry);

  const r = projInstall(repo, ch, proj, { apply: true, extra: ['-RenderedHash', hash] });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^Installed commit [0-9a-f]{40} with configuration [0-9a-f]{12} into the project folder; all files verified\.\r?$/m, r.out);
  const rules = readFileSync(join(proj, ...RULES));
  assert.equal(rules.toString('utf8'), expectedRules(80));
  assert.equal(sha256(rules), hash);
  const record = JSON.parse(readFileSync(join(proj, ...RECORD), 'utf8'));
  assert.deepEqual(Object.keys(record), ['file', 'sha256', 'commit', 'digest']);
  assert.equal(record.file, 'pact-project.md');
  assert.equal(record.sha256, hash);
  const added = snapshot(proj).filter(e => !projBefore.includes(e));
  assert.deepEqual(added.map(e => e.split(' ').slice(0, 2).join(' ')), [
    `dir ${sep}.claude${sep}rules`,
    `file ${sep}.claude${sep}rules${sep}pact-project.md`,
    `file ${sep}.claude${sep}rules${sep}pact-project.record.json`,
  ]);
  assert.deepEqual(snapshot(homeDir).filter(e => !e.includes(`${sep}proj`)), homeBefore, 'nothing is installed in the home folder');

  // Again: the recorded file may be replaced, and a same render reads unchanged.
  const again = projInstall(repo, ch, proj);
  assert.equal(again.code, 0, again.out);
  assert.match(again.stdout, /^ {2}rules file \.claude\/rules\/pact-project\.md: unchanged\r?$/m, again.out);
  writeFileSync(join(proj, '.claude', 'pact-config.json'), projectJson(70));
  const next = projInstall(repo, ch, proj);
  assert.match(next.stdout, /would replace the copy the pact recorded/, next.out);
  const r2 = projInstall(repo, ch, proj, { apply: true, extra: ['-RenderedHash', projectHash(next)] });
  assert.equal(r2.code, 0, r2.out);
  assert.equal(readFileSync(join(proj, ...RULES), 'utf8'), expectedRules(70));
});

test('siblings whose names share a prefix with the Claude folder install', t => {
  const repo = makeRepo(t);
  const { root, homeDir, ch } = layout(t);
  const dotClaude2 = projectAt(join(homeDir, '.claude2'));
  const r = projInstall(repo, ch, dotClaude2, { apply: true, extra: ['-RenderedHash', projectHash(projInstall(repo, ch, dotClaude2))] });
  assert.equal(r.code, 0, r.out);
  assert.ok(existsSync(join(dotClaude2, ...RULES)));
  // A Claude home folder <tmp>/kh beside a project <tmp>/kh2.
  const kh = join(root, 'kh');
  mkdirSync(kh);
  const kh2 = projectAt(join(root, 'kh2'));
  const r2 = projInstall(repo, kh, kh2);
  assert.equal(r2.code, 0, r2.out);
});

// ------------------------------------------------------------ refusals with nothing written

test('bad case: a project install with no project file refuses, saying there is no project configuration', t => {
  const repo = makeRepo(t);
  const { homeDir, ch } = layout(t);
  const proj = join(homeDir, 'proj');
  mkdirSync(join(proj, '.claude'), { recursive: true });
  const r = projInstall(repo, ch, proj, { apply: true, extra: ['-RenderedHash', 'a'.repeat(64)] });
  refused(r);
  assert.match(r.stdout, /there is no project configuration/, r.out);
  assert.deepEqual(snapshot(proj), [`dir ${sep}.claude`]);
});

test('bad case: -Apply on a project install with no hash, a wrong hash or a cut-short hash refuses, with nothing written', t => {
  const repo = makeRepo(t);
  const { homeDir, ch } = layout(t);
  const proj = projectAt(join(homeDir, 'proj'));
  const hash = projectHash(projInstall(repo, ch, proj));
  const before = snapshot(proj);
  for (const extra of [[], ['-RenderedHash', 'b'.repeat(64)], ['-RenderedHash', hash.slice(0, 12)]]) {
    const r = projInstall(repo, ch, proj, { apply: true, extra });
    refused(r);
    assert.match(r.stdout, extra.length ? /^REFUSED: the hash given with -RenderedHash/m : /^REFUSED: a project configuration applies, so -Apply needs/m, r.out);
  }
  assert.deepEqual(snapshot(proj), before);
});

test('bad case: a project configuration changed after the dry run refuses, with nothing written', t => {
  const repo = makeRepo(t);
  const { homeDir, ch } = layout(t);
  const proj = projectAt(join(homeDir, 'proj'), 60);
  const hash = projectHash(projInstall(repo, ch, proj));
  writeFileSync(join(proj, '.claude', 'pact-config.json'), projectJson(50));
  const r = projInstall(repo, ch, proj, { apply: true, extra: ['-RenderedHash', hash] });
  refused(r);
  assert.ok(!existsSync(join(proj, '.claude', 'rules')));
});

test('layering: a project value looser than the user\'s but tighter than the default refuses, and so does a project edit', t => {
  const repo = makeRepo(t);
  const { homeDir, ch } = layout(t);
  userFile(ch, 50);
  const proj = projectAt(join(homeDir, 'proj'), 60);
  const r = projInstall(repo, ch, proj);
  refused(r);
  assert.match(r.stdout, /^render\| FAIL project-looser: /m, r.out);
  writeFileSync(join(proj, '.claude', 'pact-config.json'), '{"schema": 1, "settings": {"usage-pause": 40}, "edits": [{"mark": "move-2", "op": "remove"}]}\n');
  const r2 = projInstall(repo, ch, proj);
  refused(r2);
  assert.match(r2.stdout, /^render\| FAIL project-edit: /m, r2.out);
});

test('bad case: -ProjectFolder with -ReviewFolder, or a relative -ProjectFolder, refuses before anything runs', t => {
  const repo = makeRepo(t);
  const { homeDir, ch } = layout(t);
  const proj = projectAt(join(homeDir, 'proj'));
  const r = projInstall(repo, ch, proj, { extra: ['-ReviewFolder', join(tempDir(t), 'review')] });
  refused(r);
  assert.match(r.stdout, /^REFUSED: -ReviewFolder is for a home install/m, r.out);
  const r2 = projInstall(repo, ch, 'proj');
  refused(r2);
  assert.match(r2.stdout, /^REFUSED: -ProjectFolder must be a full path/m, r2.out);
});

// ------------------------------------------------------------ containment

/** Run a containment case: plant, then -Apply; refused, the project and the outside folder unchanged. */
function containment(t, plant, why) {
  const repo = makeRepo(t);
  const { root, homeDir, ch } = layout(t);
  const proj = projectAt(join(homeDir, 'proj'));
  const outside = join(root, 'outside');
  mkdirSync(outside);
  if (plant(proj, outside) === false) return;
  const before = [snapshot(proj), snapshot(outside)];
  const r = projInstall(repo, ch, proj, { apply: true, extra: ['-RenderedHash', 'a'.repeat(64)] });
  refused(r);
  if (why) assert.match(r.stdout, why, r.out);
  assert.deepEqual([snapshot(proj), snapshot(outside)], before, 'nothing was written');
}

test('bad case: a linked rules folder refuses, with nothing written outside the project', t => {
  containment(t, (proj, outside) => symlinkSync(outside, join(proj, '.claude', 'rules'), 'junction'), /project\| FAIL project-link: the project's \.claude\/rules folder is a link/);
});

test('bad case: a linked .claude folder refuses', t => {
  containment(t, (proj, outside) => {
    rmSync(join(proj, '.claude'), { recursive: true });
    projectAt(outside);
    symlinkSync(join(outside, '.claude'), join(proj, '.claude'), 'junction');
  }, /FAIL project-link: the project's \.claude folder is a link/);
});

test('bad case: a linked rules file refuses', t => {
  containment(t, (proj, outside) => {
    mkdirSync(join(proj, '.claude', 'rules'));
    writeFileSync(join(outside, 'victim.md'), 'theirs\n');
    return fileLink(t, join(outside, 'victim.md'), join(proj, ...RULES));
  }, /pact-project\.md is a link/);
});

test('bad case: a pre-existing rules file with no record refuses', t => {
  containment(t, proj => {
    mkdirSync(join(proj, '.claude', 'rules'));
    writeFileSync(join(proj, ...RULES), 'the repo\'s own rules\n');
  }, /FAIL project-unrecorded: /);
});

test('bad case: a pre-existing rules file whose record names another file refuses', t => {
  containment(t, proj => {
    mkdirSync(join(proj, '.claude', 'rules'));
    writeFileSync(join(proj, ...RULES), 'x\n');
    writeFileSync(join(proj, ...RECORD), JSON.stringify({ file: '../../CLAUDE.md', sha256: sha256('x\n') }));
  }, /FAIL project-record: /);
});

test('bad case: a linked configuration file refuses', t => {
  containment(t, (proj, outside) => {
    writeFileSync(join(outside, 'pact-config.json'), projectJson(60));
    rmSync(join(proj, '.claude', 'pact-config.json'));
    return fileLink(t, join(outside, 'pact-config.json'), join(proj, '.claude', 'pact-config.json'));
  }, /FAIL project-link: the project configuration file is a link/);
});

test('bad case: a linked record refuses', t => {
  containment(t, (proj, outside) => {
    mkdirSync(join(proj, '.claude', 'rules'));
    writeFileSync(join(outside, 'record.json'), '{}\n');
    return fileLink(t, join(outside, 'record.json'), join(proj, ...RECORD));
  }, /pact-project\.record\.json is a link/);
});

for (const which of ['configuration', 'record']) {
  test(`bad case: a special-file ${which} refuses`, { skip: WIN && 'Windows has no named pipes in the file system to plant (not run)' }, t => {
    containment(t, proj => {
      const at = which === 'record' ? join(proj, ...RECORD) : join(proj, '.claude', 'pact-config.json');
      if (which === 'record') mkdirSync(join(proj, '.claude', 'rules'));
      else rmSync(at);
      const r = spawnSync('mkfifo', [at]);
      if (r.status !== 0) {
        t.skip('mkfifo is not available (not run)');
        return false;
      }
    });
  });
}

// ------------------------------------------------------------ home-folder relations

/** -Apply on the project `proj` (and its trailing-separator spelling); each refuses with the home-folder rule and nothing written under `watch`. */
function relation(t, repo, ch, proj, watch, why) {
  for (const spelled of [proj, `${proj}${sep}`]) {
    const before = snapshot(watch);
    const r = projInstall(repo, ch, spelled, { apply: true, extra: ['-RenderedHash', 'a'.repeat(64)] });
    refused(r);
    assert.match(r.stdout, why, r.out);
    assert.deepEqual(snapshot(watch), before, 'nothing was written');
  }
}

const CLAUDE_REL = /FAIL project-home: the project folder is the Claude home folder named for this install, holds it, or is inside it/;

test('bad case: a project equal to the Claude folder refuses', t => {
  const repo = makeRepo(t);
  const { root, ch } = layout(t);
  projectAt(ch);
  relation(t, repo, ch, ch, root, CLAUDE_REL);
});

test('bad case: a project holding the Claude folder refuses', t => {
  const repo = makeRepo(t);
  const { root, homeDir, ch } = layout(t);
  projectAt(homeDir);
  relation(t, repo, ch, homeDir, root, CLAUDE_REL);
});

test('bad case: a project inside the Claude folder refuses', t => {
  const repo = makeRepo(t);
  const { root, ch } = layout(t);
  const proj = projectAt(join(ch, 'proj'));
  relation(t, repo, ch, proj, root, CLAUDE_REL);
});

test('bad case: a project holding the Claude folder but not the home folder, with -ClaudeHome outside the home folder, refuses', { skip: under(tmpdir(), homedir()) && 'the temp folder is inside the home folder here, so no -ClaudeHome outside it can be planted (not run)' }, t => {
  const repo = makeRepo(t);
  const { root, homeDir, ch } = layout(t);
  projectAt(homeDir);
  relation(t, repo, ch, homeDir, root, CLAUDE_REL);
});

/** A dry run on a real-home project: refused by the home-folder rule, and nothing written there. Never -Apply. */
function realHomeCase(t, proj, why) {
  const repo = makeRepo(t);
  const { ch } = layout(t);
  const configAt = join(proj, '.claude', 'pact-config.json');
  const rulesAt = join(proj, ...RULES);
  if (existsSync(configAt) || existsSync(rulesAt)) {
    t.skip('this folder already holds a project configuration or rules file, so the case is not planted (not run)');
    return;
  }
  for (const spelled of [proj, `${proj}${sep}`]) {
    const r = projInstall(repo, ch, spelled);
    refused(r);
    assert.match(r.stdout, why, r.out);
    assert.ok(!existsSync(rulesAt) && !existsSync(configAt));
  }
}

test('bad case: a project equal to the real home folder refuses, before any write (dry run only)', t => {
  realHomeCase(t, homedir(), /FAIL project-home: the project folder is your home folder, or holds it/);
});

test('bad case: a project holding the real home folder refuses, before any write (dry run only)', t => {
  realHomeCase(t, dirname(homedir()), /FAIL project-home: the project folder is your home folder, or holds it/);
});

test('bad case: a project equal to the real Claude folder refuses, before any write (dry run only)', { skip: !existsSync(join(homedir(), '.claude')) && 'there is no real Claude folder here (not run)' }, t => {
  realHomeCase(t, join(homedir(), '.claude'), /FAIL project-home: the project folder is the Claude folder in your home folder/);
});

// ------------------------------------------------------------ git and Node stay out of the project

test('git is never pointed at the project folder', t => {
  const repo = makeRepo(t);
  const { root, homeDir, ch } = layout(t);
  const proj = projectAt(join(homeDir, 'proj'));
  const marker = join(root, 'fsmonitor-ran');
  const hook = join(root, 'mark.cjs');
  writeFileSync(hook, `require('fs').writeFileSync(${JSON.stringify(marker)}, 'x');\n`);
  git(proj, 'init', '-q');
  git(proj, 'config', 'core.fsmonitor', `node "${hook.replace(/\\/g, '/')}"`);
  // Control: git pointed at the folder runs the hook.
  spawnSync('git', ['-C', proj, 'status'], { encoding: 'utf8' });
  assert.ok(existsSync(marker), 'control: the fsmonitor hook runs when git is pointed at the project');
  rmSync(marker);
  const r = projInstall(repo, ch, proj, { apply: true, extra: ['-RenderedHash', projectHash(projInstall(repo, ch, proj))] });
  assert.equal(r.code, 0, r.out);
  assert.ok(!existsSync(marker), 'git ran against the project folder');
});

test('Node never runs with the project folder as its working folder', t => {
  const { root, homeDir, ch } = layout(t);
  const log = join(root, 'cwd.log');
  const plant = `import { appendFileSync as __cwdLog } from 'node:fs';\n__cwdLog(${JSON.stringify(log)}, process.cwd() + '\\n');\n`;
  const repo = makeRepo(t, r => {
    for (const f of ['render.mjs', 'project.mjs', 'seam-a.mjs']) {
      const p = join(r, 'gate', f);
      const s = readFileSync(p, 'utf8');
      const nl = s.indexOf('\n') + 1; // after the shebang line
      writeFileSync(p, s.slice(0, nl) + plant + s.slice(nl));
    }
  });
  const proj = projectAt(join(homeDir, 'proj'));
  const r = projInstall(repo, ch, proj, { apply: true, extra: ['-RenderedHash', projectHash(projInstall(repo, ch, proj))] });
  assert.equal(r.code, 0, r.out);
  const cwds = readFileSync(log, 'utf8').trim().split('\n');
  assert.ok(cwds.length >= 8, `each Node run logged its folder: ${cwds.length}`);
  for (const c of cwds) assert.ok(!under(c, proj), `a Node run had the project as its working folder: ${c}`);
});

// ------------------------------------------------------------ the second render's stage hash

test('bad case: a renderer that changes the stage on its project run refuses', t => {
  const repo = makeRepo(t, r => {
    const p = join(r, 'gate', 'render.mjs');
    const s = readFileSync(p, 'utf8');
    const from = 'function runProject(out, home, projectFolder, report) {\n';
    assert.equal(s.split(from).length, 2);
    writeFileSync(p, s.replace(from, `${from}  writeFileSync('planted.md', 'x\\n');\n`));
  });
  const { homeDir, ch } = layout(t);
  const proj = projectAt(join(homeDir, 'proj'));
  const r = projInstall(repo, ch, proj);
  refused(r);
  assert.match(r.stdout, /^REFUSED: the renderer changed the stage\./m, r.out);
});
