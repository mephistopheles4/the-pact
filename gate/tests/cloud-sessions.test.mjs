// The cloud-session copy (#179, #181): cloud-sessions/gen.mjs generates
// CLAUDE.cloud.md and the two setup scripts through the render and seam A.
// These tests fail when a committed output is stale, and hold the generator
// to its refusals. They never install. The full pipeline runs four times at
// most; every other case calls one step directly.
//
// Every change to cloud-sessions/ and to this file takes the security route
// (AGENTS.md).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import {
  CONFIG_DELIM,
  CloudRefusal,
  EDITS,
  OUTPUTS,
  SETUP_DELIM,
  TEMPLATES,
  applyEdits,
  assemble,
  editsDigest,
  gatedClauses,
  generate,
  listPayload,
  readCopySet,
  renderNoConfig,
} from '../../cloud-sessions/gen.mjs';
import { OLD_REVIEWERS } from '../pact-text.mjs';
import { REPO, withoutOpenMarks } from './text.mjs';
import { tempDir, writeTree } from './tree.mjs';

// The pinned edit list: its ids, and the sha256 of its anchors and
// replacements. A change to either is a change to what the cloud copy says,
// so it is made here by hand, on the security route.
const EDIT_IDS = ['E1', 'E2'];
const EDITS_DIGEST = 'b0ef1c4aef55795d9852745bf6fd8d8331e42bf8d54e5b9fcd11efdbb5ed2f6f';

const PAYLOAD = ['claude', 'familiars', 'cross/cross.mjs', 'AGENTS.md'];
// The retired agents: the gate's own list of old reviewers, and the old builder.
const RETIRED = [...OLD_REVIEWERS, 'builder'];
const RLO = '‮';

const sha256 = s => createHash('sha256').update(s).digest('hex');
const repoText = rel => readFileSync(join(REPO, ...rel.split('/')), 'utf8');

/** The environment for a child: this one's, minus Node options and the test runner's context. */
function childEnv() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!/^(?:NODE_OPTIONS|NODE_TEST_CONTEXT|GIT_.*)$/i.test(k)) env[k] = v;
  return env;
}

function git(cwd, args, input) {
  const r = spawnSync('git', ['-c', 'core.fsmonitor=false', '-c', 'core.autocrlf=false', ...args], { cwd, env: childEnv(), encoding: 'utf8', input });
  assert.equal(r.status, 0, `git ${args[0]} failed: ${r.stderr}`);
  return r.stdout;
}

/** A message holds no absolute path: no temp folder, no repo folder, no drive or root path. */
function assertNoAbsolutePath(text) {
  assert.ok(!text.includes(tmpdir()), `a temp path in: ${text}`);
  assert.ok(!text.includes(REPO), `the repo path in: ${text}`);
  assert.doesNotMatch(text, /[A-Za-z]:[\\/]|(?:^|[\s(])\/(?:tmp|home|Users|var|root|private)\//, text);
}

/** `fn` throws a CloudRefusal with `rule` (and a message matching `why`, when given), holding no absolute path. */
function refuses(fn, rule, why) {
  assert.throws(fn, e => {
    assert.ok(e instanceof CloudRefusal, `not a refusal: ${e}`);
    assert.equal(e.rule, rule, e.message);
    if (why) assert.match(e.message, why);
    assertNoAbsolutePath(e.message);
    return true;
  });
}

/**
 * The base root: a new git repo holding a copy of REPO's tracked payload files,
 * added to the index. `plant` changes it before the add.
 */
function baseRoot(t, plant = () => {}) {
  const root = tempDir(t, 'pact-cloud-root-');
  git(root, ['init', '-q']);
  for (const rel of git(REPO, ['ls-files', '-z', '--', ...PAYLOAD]).split('\0').filter(Boolean)) {
    const to = join(root, ...rel.split('/'));
    mkdirSync(dirname(to), { recursive: true });
    cpSync(join(REPO, ...rel.split('/')), to);
  }
  writeFileSync(join(root, '.gitignore'), '*.private.md\nprivate/\n');
  plant(root);
  git(root, ['add', '-A']);
  return root;
}

// The no-configuration render, computed apart from the renderer, and the
// committed outputs.
const RENDER = withoutOpenMarks(repoText('claude/CLAUDE.md'));
const committed = () => Object.fromEntries(Object.values(OUTPUTS).map(rel => [rel, repoText(rel)]));

let generated = null;
/** generate(REPO), run once for every case that reads it. */
function repoGenerate() {
  generated ??= generate(REPO);
  return generated;
}

// ---------------------------------------------------------------- full runs

test('cloud copy: the committed outputs equal what the generator builds', () => {
  const g = repoGenerate();
  const now = committed();
  for (const rel of Object.values(OUTPUTS)) assert.ok(g.files[rel] === now[rel], `out of date: run node cloud-sessions/gen.mjs (${rel})`);
});

test('cloud copy: --check names only the stale output, and untracked or ignored files change nothing', t => {
  // A copy of the generator's own repo, so its command line runs on a tree of
  // our making: the payload, the gate, the templates and the outputs.
  const root = baseRoot(t, r => {
    writeTree(r, {
      'familiars/planted-lens.md': '---\nname: planted-lens\ndescription: Untracked.\n---\n\nBody.\n',
      'claude/agents/x.private.md': '---\nname: x\ndescription: Ignored.\n---\n\nBody.\n',
    });
  });
  cpSync(join(REPO, 'gate'), join(root, 'gate'), { recursive: true, filter: src => !src.includes(`${join('gate', 'tests')}`) });
  cpSync(join(REPO, 'cloud-sessions'), join(root, 'cloud-sessions'), { recursive: true });
  // Only the planted files stay out of the index.
  git(root, ['rm', '-q', '--cached', 'familiars/planted-lens.md']);
  git(root, ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'base']);
  writeFileSync(join(root, ...OUTPUTS.rules.split('/')), `${repoText(OUTPUTS.rules)}stale\n`);

  const r = spawnSync(process.execPath, [join(root, 'cloud-sessions', 'gen.mjs'), '--check'], { cwd: root, env: childEnv(), encoding: 'utf8' });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, new RegExp(`^stale: ${OUTPUTS.rules}$`, 'm'));
  assert.doesNotMatch(r.stdout, new RegExp(`stale: (?:${OUTPUTS.setup}|${OUTPUTS.wrapper})`));
  assert.match(r.stdout, /out of date: run node cloud-sessions\/gen\.mjs/);
  assertNoAbsolutePath(r.stdout + r.stderr);
});

test('cloud copy: an overlay seam A refuses fails the generator with seam A\'s refusal', t => {
  const root = baseRoot(t, r => {
    const p = join(r, 'claude', 'settings.overlay.json');
    const overlay = JSON.parse(readFileSync(p, 'utf8'));
    overlay.hooks = {};
    writeFileSync(p, `${JSON.stringify(overlay, null, 2)}\n`);
  });
  refuses(() => generate(root), 'cloud/seam-a');
});

test('cloud copy: a link-mode entry in the index is refused', t => {
  const root = baseRoot(t);
  const blob = git(root, ['hash-object', '-w', '--stdin'], 'cross.mjs').trim();
  git(root, ['update-index', '--cacheinfo', `120000,${blob},cross/cross.mjs`]);
  refuses(() => generate(root), 'cloud/not-plain');
});

test('cloud copy: NODE_OPTIONS set is refused before anything runs', t => {
  const saved = process.env.NODE_OPTIONS;
  t.after(() => {
    if (saved === undefined) delete process.env.NODE_OPTIONS;
    else process.env.NODE_OPTIONS = saved;
  });
  process.env.NODE_OPTIONS = '--no-warnings';
  refuses(() => generate(REPO), 'cloud/env');
});

// ---------------------------------------------------------------- the listing step

test('cloud copy: a force-added private file is refused at the listing step', t => {
  const root = baseRoot(t);
  writeTree(root, { 'claude/agents/x.private.md': 'private\n' });
  git(root, ['add', '-f', 'claude/agents/x.private.md']);
  refuses(() => listPayload(root), 'cloud/private');
});

test('cloud copy: a force-added file in a private folder is refused at the listing step', t => {
  const root = baseRoot(t);
  writeTree(root, { 'claude/private/notes.md': 'private\n' });
  git(root, ['add', '-f', 'claude/private/notes.md']);
  refuses(() => listPayload(root), 'cloud/private');
});

test('cloud copy: a payload path that is not a regular file on disk is refused', t => {
  const root = baseRoot(t);
  // A folder where the index has a plain file: the same branch a link takes,
  // and no link privilege is needed to plant it.
  rmSync(join(root, 'cross', 'cross.mjs'));
  mkdirSync(join(root, 'cross', 'cross.mjs'));
  refuses(() => listPayload(root), 'cloud/not-plain', /link or not a regular file/);
});

test('cloud copy: two payload paths that differ only in case are refused', t => {
  const root = baseRoot(t);
  const blob = git(root, ['hash-object', '-w', '--stdin'], 'x\n').trim();
  git(root, ['update-index', '--add', '--cacheinfo', `100644,${blob},claude/agents/Adversarial-lens.md`]);
  // The message names the case rule, so a missing-file refusal can't stand in for it.
  refuses(() => listPayload(root), 'cloud/not-plain', /differs only in case/);
});

// ---------------------------------------------------------------- renderNoConfig

test('cloud copy: a render home holding a configuration is refused', t => {
  const home = tempDir(t, 'pact-cloud-home-');
  writeTree(home, { 'pact/config.json': '{\n  "schema": 1,\n  "settings": {\n    "usage-pause": 90\n  }\n}\n' });
  refuses(() => renderNoConfig(join(REPO, 'claude', 'CLAUDE.md'), { home }), 'cloud/render', /applied a configuration/);
});

// ---------------------------------------------------------------- the copy set

const RULES_BUF = Buffer.from('# Rules\n');
const OVERLAY_BUF = Buffer.from('{}\n');
const staged = () =>
  new Map([
    ['claude/CLAUDE.md', RULES_BUF],
    ['claude/settings.overlay.json', OVERLAY_BUF],
  ]);
const seamLines = (rules = RULES_BUF, overlay = OVERLAY_BUF) => [
  `INSTALL ${sha256(rules)} claude/CLAUDE.md CLAUDE.md`,
  `SETTINGS ${sha256(overlay)} claude/settings.overlay.json`,
  'RESULT: pass',
];

test('cloud copy: the copy set is read from seam A\'s lines when every hash matches', () => {
  const { copy, overlay } = readCopySet(seamLines(), staged());
  assert.deepEqual(
    copy.map(c => c.dest),
    ['CLAUDE.md'],
  );
  assert.equal(overlay, OVERLAY_BUF);
});

test('cloud copy: a staged file that does not match its INSTALL hash is refused', () => {
  refuses(() => readCopySet(seamLines(Buffer.from('other\n')), staged()), 'cloud/seam-a', /INSTALL hash/);
});

test('cloud copy: an overlay that does not match the SETTINGS hash is refused', () => {
  refuses(() => readCopySet(seamLines(RULES_BUF, Buffer.from('{"a":1}\n')), staged()), 'cloud/seam-a', /SETTINGS hash/);
});

test('cloud copy: an edit seam A refuses on its second run fails the generator', () => {
  // The anchors match and the edit stays in its section, so only the second
  // seam A run, on the edited rules file, can refuse the hidden character.
  const edits = [{ ...EDITS[0], replacement: `${EDITS[0].replacement.slice(0, -1)}${RLO}\n` }, EDITS[1]];
  refuses(() => generate(REPO, { edits }), 'cloud/seam-a', /invisible/);
});

// ---------------------------------------------------------------- applyEdits

test('cloud copy: an edit whose anchor is missing is refused', () => {
  refuses(() => applyEdits(RENDER, [{ id: 'X', anchor: 'no such paragraph anywhere\n', replacement: 'x\n' }]), 'cloud/anchor-missing');
});

test('cloud copy: an edit whose anchor is outside its section is refused', () => {
  const anchor = '## Watching usage\n';
  assert.equal(RENDER.split(anchor).length, 2);
  refuses(() => applyEdits(RENDER, [{ id: 'X', anchor, replacement: '## Watching usage\n' }]), 'cloud/anchor-section');
});

test('cloud copy: an edit whose anchor is inside the tracker-authors clause is refused', () => {
  const clause = gatedClauses(RENDER).find(c => c.name === 'tracker-authors');
  assert.ok(clause, 'the render holds tracker-authors');
  const line = clause.text.split('\n').find(l => l.length > 30 && RENDER.split(`${l}\n`).length === 2);
  refuses(() => applyEdits(RENDER, [{ id: 'X', anchor: `${line}\n`, replacement: 'x\n' }]), 'cloud/anchor-gated');
});

test('cloud copy: an edit that repeats a gated clause is refused', () => {
  const clause = gatedClauses(RENDER).find(c => c.name === 'stop-and-escalate');
  refuses(() => applyEdits(RENDER, [{ ...EDITS[0], replacement: `${EDITS[0].replacement}${clause.text}` }]), 'cloud/gated-moved');
});

// ---------------------------------------------------------------- assemble

// A small setup head stands in for the real one, so these cases don't depend
// on its skills list; the other three templates are the real ones.
const HEAD = '#!/usr/bin/env bash\nset -u\nSKILLS=()\npresent() { :; }\n';
/** The three real templates beside the stand-in head. */
const TPL = () => Object.fromEntries(['configHead', 'configTail', 'setupTail'].map(k => [k, repoText(`cloud-sessions/${TEMPLATES[k]}`)]));
const OVERLAY = '{\n  "permissions": {\n    "defaultMode": "auto"\n  }\n}\n';
function inputs(change = {}) {
  const templates = { ...TPL(), setupHead: HEAD, ...change.templates };
  return {
    files: change.files ?? [
      { dest: 'CLAUDE.md', buf: Buffer.from('# Rules\n') },
      { dest: 'agents/a-lens.md', buf: Buffer.from('---\nname: a-lens\n---\n\nBody.\n') },
      { dest: 'pact/cross.mjs', buf: Buffer.from('export {};\n') },
    ],
    overlay: change.overlay ?? OVERLAY,
    templates,
  };
}

/** The single-quoted SETTINGS_OVERLAY string in a script. */
function overlayIn(script) {
  const from = script.indexOf("SETTINGS_OVERLAY='") + "SETTINGS_OVERLAY='".length;
  return script.slice(from, script.indexOf("'", from));
}

test('cloud copy: assemble builds both scripts, with the wrapper around the setup byte for byte', () => {
  const a = assemble(inputs());
  assert.match(a.marker, /^[0-9a-f]{12}$/);
  assert.equal(a.wrapper, `# Setup-field wrapper: runs under sh, hands the real script to bash.\ncat > /tmp/cloud-setup.sh <<'${SETUP_DELIM}'\n${a.setup}${SETUP_DELIM}\nbash /tmp/cloud-setup.sh\n`);
  assert.match(a.setup, new RegExp(`^ {2}echo "pact cloud copy ${a.marker}"$`, 'm'));
  assert.match(a.setup, /^EXPECTED_WRITES=4$/m);
  assert.match(a.setup, new RegExp(`^check_hash ${sha256('# Rules\n')} 'CLAUDE.md'$`, 'm'));
  assert.match(a.setup, /^write_config 'agents\/a-lens\.md' <<'__CLAUDE_CONFIG_EOF__'$/m);
});

for (const [name, files] of [
  ['an agent body', [{ dest: 'agents/a.md', buf: Buffer.from(`x\n${CONFIG_DELIM}\n`) }]],
  ['the rules body', [{ dest: 'CLAUDE.md', buf: Buffer.from(`x\n${SETUP_DELIM}\n`) }]],
]) {
  test(`cloud copy: a delimiter line in ${name} is refused`, () => {
    refuses(() => assemble(inputs({ files })), 'cloud/delimiter');
  });
}

test('cloud copy: a carriage return in a body is refused', () => {
  refuses(() => assemble(inputs({ files: [{ dest: 'CLAUDE.md', buf: Buffer.from('a\r\nb\n') }] })), 'cloud/body');
});

test('cloud copy: a single quote in the overlay is refused', () => {
  refuses(() => assemble(inputs({ overlay: '{\n  "a": "it\'s"\n}\n' })), 'cloud/overlay');
});

test('cloud copy: an overlay holding replacement patterns comes through byte for byte', () => {
  const overlay = '{\n  "env": {\n    "A": "$` $& $$ $1"\n  }\n}\n';
  const a = assemble(inputs({ overlay }));
  assert.equal(overlayIn(a.setup), overlay);
  assert.equal(overlayIn(a.wrapper), overlay);
});

for (const dest of ['agents/$(id).md', "agents/a'b.md", 'agents/a b.md', '../x.md']) {
  test(`cloud copy: the destination ${JSON.stringify(dest)} is refused`, () => {
    refuses(() => assemble(inputs({ files: [{ dest, buf: Buffer.from('x\n') }] })), 'cloud/form');
  });
}

test('cloud copy: a direction-changing character in an edit replacement is refused', () => {
  const rules = applyEdits(RENDER, [{ ...EDITS[0], replacement: `${EDITS[0].replacement.slice(0, -1)}${RLO}\n` }, EDITS[1]]);
  refuses(() => assemble(inputs({ files: [{ dest: 'CLAUDE.md', buf: Buffer.from(rules) }] })), 'cloud/chars');
});

test('cloud copy: a direction-changing character in a template is refused', () => {
  refuses(() => assemble(inputs({ templates: { configTail: `# ${RLO}\n${TPL().configTail}` } })), 'cloud/chars');
});

test('cloud copy: a byte changed in a template changes the output', () => {
  const base = assemble(inputs());
  const changed = assemble(inputs({ templates: { configHead: TPL().configHead.replace('== Config', '== Konfig') } }));
  assert.notEqual(changed.setup, base.setup);
});

test('cloud copy: a byte changed in the setup head changes the marker', () => {
  const base = assemble(inputs());
  const changed = assemble(inputs({ templates: { setupHead: HEAD.replace('set -u', 'set -u ') } }));
  assert.notEqual(changed.marker, base.marker);
});

// ---------------------------------------------------------------- the committed outputs

test('cloud copy: CLAUDE.cloud.md is the no-configuration render plus E1 and E2 only', () => {
  const cloud = repoText(OUTPUTS.rules);
  // A plain substitution of each anchor, apart from applyEdits, so a slip in
  // the edit step can't regenerate into the file and pass.
  let expected = RENDER;
  for (const e of EDITS) {
    assert.equal(expected.split(e.anchor).length, 2, `${e.id}'s anchor appears once`);
    expected = expected.split(e.anchor).join(e.replacement);
  }
  assert.equal(cloud, expected);
  assert.equal(applyEdits(RENDER), expected);
  assert.match(cloud, /<!-- pact:begin tracker-authors -->/);
  for (const c of gatedClauses(RENDER)) {
    assert.equal(cloud.split(c.text).length, 2, `${c.name} appears once, word for word`);
  }
  const order = gatedClauses(RENDER).map(c => cloud.indexOf(c.text));
  assert.deepEqual(order, [...order].sort((x, y) => x - y));
});

test('cloud copy: CLAUDE.cloud.md carries no configuration and the shipped usage line', () => {
  const cloud = repoText(OUTPUTS.rules);
  // The fit-check instruction "end the fit line with `Config: <digest>.`" is in
  // every render; only a filled notice or digest would be a configuration.
  assert.doesNotMatch(cloud, /Configuration in effect/);
  assert.doesNotMatch(cloud, /Config: [0-9a-f]{12}/);
  assert.match(cloud, /the weekly limit is above 75%/);
  for (const name of RETIRED) assert.doesNotMatch(cloud, new RegExp(`(?<![\\w-])${name}(?![\\w-])`), name);
});

test('cloud copy: the edit list is pinned', () => {
  assert.deepEqual(
    EDITS.map(e => e.id),
    EDIT_IDS,
  );
  assert.equal(editsDigest(), EDITS_DIGEST);
});

test('cloud copy: the wrapper embeds cloud-setup.sh byte for byte', () => {
  const { [OUTPUTS.setup]: setup, [OUTPUTS.wrapper]: wrapper } = committed();
  const open = `cat > /tmp/cloud-setup.sh <<'${SETUP_DELIM}'\n`;
  const body = wrapper.slice(wrapper.indexOf(open) + open.length, wrapper.lastIndexOf(`${SETUP_DELIM}\n`));
  assert.equal(body, setup);
});

test('cloud copy: each embedded file is its repo copy, with its hash checked, and the marker names the script', () => {
  const setup = repoText(OUTPUTS.setup);
  const blocks = [...setup.matchAll(new RegExp(`^write_config '([^']+)' <<'${CONFIG_DELIM}'\\n([\\s\\S]*?)^${CONFIG_DELIM}$`, 'gm'))];
  const source = dest =>
    dest === 'CLAUDE.md' ? OUTPUTS.rules : dest === 'pact/cross.mjs' ? 'cross/cross.mjs' : dest === 'agents/scout.md' ? 'familiars/scout.md' : `claude/${dest}`;
  // The whole set, from the repo apart from seam A: the rules file, every
  // shipped lens, scout and the cross script.
  const lenses = git(REPO, ['ls-files', '-z', '--', 'claude/agents/*.md']).split('\0').filter(Boolean);
  const want = ['CLAUDE.md', ...lenses.map(p => p.slice('claude/'.length)), 'agents/scout.md', 'pact/cross.mjs'].sort();
  assert.ok(lenses.length >= 9, lenses.join(', '));
  assert.deepEqual(blocks.map(m => m[1]).sort(), want);
  for (const [, dest, body] of blocks) {
    assert.equal(body, repoText(source(dest)), dest);
    assert.match(setup, new RegExp(`^check_hash ${sha256(body)} '${dest.replace(/[.]/g, '\\.')}'$`, 'm'), dest);
  }
  assert.match(setup, new RegExp(`^EXPECTED_WRITES=${blocks.length + 1}$`, 'm'));
  assert.equal(overlayIn(setup), repoText('claude/settings.overlay.json'));
  const marker = /^ {2}echo "pact cloud copy ([0-9a-f]{12})"$/m.exec(setup)[1];
  assert.equal(sha256(setup.split(`pact cloud copy ${marker}`).join('pact cloud copy __PACT_CLOUD_MARKER__')).slice(0, 12), marker);
  assert.equal(marker, repoGenerate().marker);
});

test('cloud copy: the Result section prints the marker only on a full, hash-matched write, and never a token', () => {
  // Read, not run: the suite runs on Windows too, and bash here can fail
  // silently. The owner's first cloud setup log is the run.
  const tail = repoText(`cloud-sessions/${TEMPLATES.setupTail}`);
  const lines = tail.split('\n');
  const at = lines.indexOf('if [ "$CONFIG_WRITTEN" -eq "$EXPECTED_WRITES" ] && [ "$HASH_FAILED" -eq 0 ]; then');
  assert.ok(at > 0, 'the marker condition, word for word');
  assert.deepEqual(lines.slice(at + 1, at + 5), [
    '  echo "pact cloud copy __PACT_CLOUD_MARKER__"',
    'else',
    '  echo "pact cloud copy INCOMPLETE ($CONFIG_WRITTEN of $EXPECTED_WRITES written, $HASH_FAILED hash mismatches)"',
    'fi',
  ]);
  assert.equal(tail.split('pact cloud copy __PACT_CLOUD_MARKER__').length, 2, 'the marker prints in one place');
  // HASH_FAILED counts every mismatch, and nothing resets it after the checks.
  assert.match(tail, /^ {4}echo "HASH MISMATCH: ~\/\.claude\/\$rel"; HASH_FAILED=\$\(\(HASH_FAILED \+ 1\)\)$/m);
  assert.equal(lines.filter(l => /HASH_FAILED=/.test(l)).length, 2);
  // The token line tests for a value and never expands one.
  const tokenUses = lines.filter(l => /GH_TOKEN|GITHUB_TOKEN/.test(l));
  assert.deepEqual(tokenUses, ['if [ -n "${GH_TOKEN:-}" ] || [ -n "${GITHUB_TOKEN:-}" ]; then']);
  for (const t of [...Object.values(TEMPLATES)].map(n => repoText(`cloud-sessions/${n}`))) {
    assert.doesNotMatch(t, /set -x|printenv|\benv\b *$/m);
  }
});

test('cloud copy: the templates are the four the generator reads', () => {
  assert.deepEqual(Object.values(TEMPLATES).sort(), ['tpl-config-head.sh', 'tpl-config-tail.sh', 'tpl-setup-head.sh', 'tpl-setup-tail.sh']);
});
