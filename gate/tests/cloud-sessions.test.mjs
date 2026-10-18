// The cloud-session copy (#179, #181): cloud-sessions/gen.mjs generates
// CLAUDE.cloud.md and the two setup scripts through the render and seam A.
// These tests fail when a committed output is stale, and hold the generator
// to its refusals. They never install. The full pipeline runs four times at
// most; every other case calls one step directly.
//
// Every change to cloud-sessions/ and to this file is read closely: the
// script is published and runs as root (AGENTS.md).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import {
  CLOUD_COMMANDS,
  CLOUD_PINS,
  CLOUD_REPO_PINS,
  CLOUD_TOOLS,
  CONFIG_DELIM,
  CloudRefusal,
  OUTPUTS,
  SETUP_DELIM,
  TEMPLATES,
  assemble,
  commandsArg,
  generate,
  listPayload,
  readCopySet,
  renderNoConfig,
} from '../../cloud-sessions/gen.mjs';
import { REPO, withoutOpenMarks } from './text.mjs';
import { tempDir, writeTree } from './tree.mjs';

const PAYLOAD = ['claude', 'familiars', 'AGENTS.md'];
// The retired agents: the gate's own list of old reviewers, and the old builder.
// The reviewers the pact retired (#45), the old builder, and good-enough-lens (#302).
const RETIRED = ['plan-reviewer', 'result-checker', 'test-reviewer', 'security-reviewer', 'builder', 'good-enough-lens'];
const RLO = '‮';

const WIN = process.platform === 'win32';
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

// Gate rule cloud/not-plain; #264 S7 moved the plant to a payload file that survives.
test('cloud copy: a link-mode entry in the index is refused', t => {
  const root = baseRoot(t);
  const blob = git(root, ['hash-object', '-w', '--stdin'], 'review.md').trim();
  git(root, ['update-index', '--cacheinfo', `120000,${blob},claude/review.md`]);
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

// Gate rule cloud/not-plain; #264 S7 moved the plant to a payload file that survives.
test('cloud copy: a payload path that is not a regular file on disk is refused', t => {
  const root = baseRoot(t);
  // A folder where the index has a plain file: the same branch a link takes,
  // and no link privilege is needed to plant it.
  rmSync(join(root, 'claude', 'review.md'));
  mkdirSync(join(root, 'claude', 'review.md'));
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

// The edits went, and seam A's one run on the rendered rules file is what refuses a hidden character in it.
// #261 C11
test('cloud copy: a rules file seam A refuses fails the generator', t => {
  const root = baseRoot(t, r => {
    const p = join(r, 'claude', 'CLAUDE.md');
    writeFileSync(p, readFileSync(p, 'utf8').replace('## Guards', `## Gua${RLO}rds`));
  });
  refuses(() => generate(root), 'cloud/seam-a', /invisible/);
});

// ---------------------------------------------------------------- assemble

// A small setup head stands in for the real one, so these cases don't depend
// on its skills list; the other three templates are the real ones.
const HEAD = '#!/usr/bin/env bash\nset -u\n__CLOUD_PINS__\n__CLOUD_REPO_PINS__\nSKILLS=()\npresent() { :; }\n';
/** The three real templates beside the stand-in head. */
const TPL = () => Object.fromEntries(['configHead', 'configTail', 'setupTail'].map(k => [k, repoText(`cloud-sessions/${TEMPLATES[k]}`)]));
const OVERLAY = '{\n  "permissions": {\n    "defaultMode": "auto"\n  }\n}\n';
function inputs(change = {}) {
  const templates = { ...TPL(), setupHead: HEAD, ...change.templates };
  return {
    files: change.files ?? [
      { dest: 'CLAUDE.md', buf: Buffer.from('# Rules\n') },
      { dest: 'agents/a-lens.md', buf: Buffer.from('---\nname: a-lens\n---\n\nBody.\n') },
      { dest: 'pact/review.md', buf: Buffer.from('# Review\n') },
    ],
    overlay: change.overlay ?? OVERLAY,
    templates,
    pins: 'pins' in change ? change.pins : CLOUD_PINS,
    // The stand-in head lists no skills or plugins, so it takes no repo pins.
    repoPins: 'repoPins' in change ? change.repoPins : {},
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

// #183 C6: a pin reaches the root script only in its own shape, as one plain
// assignment that setup's environment can't replace.
test('cloud copy: a malformed pin, a pin written twice or a defaulted pin is refused', () => {
  const hash = CLOUD_PINS.MISE_SHA256;
  for (const pins of [
    { ...CLOUD_PINS, MISE_SHA256: hash.slice(1) },
    { ...CLOUD_PINS, NODE_BIN_SHA256: `${hash}0` },
    { ...CLOUD_PINS, NODE_TAR_SHA256: hash.toUpperCase() },
    { ...CLOUD_PINS, NODE_VERSION: '24.22.0;id' },
    { ...CLOUD_PINS, MISE_VERSION: '$(id)' },
    { ...CLOUD_PINS, NODE_VERSION: '24.22.0\nid' },
    { ...CLOUD_PINS, NODE_TAR_SHA256: `${hash}\n` },
    { ...CLOUD_PINS, MISE_VERSION: undefined },
    { ...CLOUD_PINS, EXTRA_PIN: '1.0.0' },
  ]) {
    refuses(() => assemble(inputs({ pins })), 'cloud/pin');
  }
  refuses(() => assemble(inputs({ pins: null })), 'cloud/pin');
  const head = extra => ({ templates: { setupHead: HEAD.replace('__CLOUD_PINS__\n', `__CLOUD_PINS__\n${extra}\n`) } });
  assert.ok(assemble(inputs(head('echo "$MISE_SHA256"'))).setup, 'a plain use of a pin is fine');
  refuses(() => assemble(inputs(head(`MISE_SHA256="\${MISE_SHA256:-${hash}}"`))), 'cloud/pin');
  refuses(() => assemble(inputs(head('echo "${NODE_VERSION:-24}"'))), 'cloud/pin');
  refuses(() => assemble(inputs(head('echo "${NODE_VERSION-24}"'))), 'cloud/pin');
  refuses(() => assemble(inputs(head('NODE_BIN_SHA256=0'))), 'cloud/pin');
  refuses(() => assemble(inputs(head('export NODE_BIN_SHA256=0'))), 'cloud/pin');
  refuses(() => assemble(inputs(head(`# ${hash}`))), 'cloud/pin');
  refuses(() => assemble(inputs({ templates: { setupHead: HEAD.replace('__CLOUD_PINS__\n', '') } })), 'cloud/form');
});

// #183 T3 C2: a repo pin reaches the root script only in its own shape, once,
// in the one read-only array assemble() writes, and only for a repo the head uses.
test('cloud copy: a malformed repo pin, a repo with no pin, an unused pin or a write to REPO_PIN is refused', () => {
  const sha = CLOUD_REPO_PINS['cloudflare/skills'];
  const uses = (line = '"a/b skills/x"') => HEAD.replace('SKILLS=()', `SKILLS=(\n  ${line}\n)`);
  const withHead = (head, repoPins = { 'a/b': sha }) => inputs({ templates: { setupHead: head }, repoPins });
  const ok = assemble(withHead(uses()));
  assert.equal(ok.setup.split(sha).length, 2, 'the pin appears once');
  assert.match(ok.setup, new RegExp(`^unset REPO_PIN\ndeclare -rA REPO_PIN=\\( \\["a/b"\\]=${sha} \\)$`, 'm'));
  for (const repoPins of [
    { 'a/b': sha.slice(1) },
    { 'a/b': sha.toUpperCase() },
    { 'a/b': 'main' },
    { 'a/b': `${sha}\n` },
  ]) {
    refuses(() => assemble(withHead(uses(), repoPins)), 'cloud/pin');
  }
  // A key out of shape, used by the head, so only the shape check can refuse it.
  refuses(() => assemble(withHead(uses('"a$(id)/b skills/x"'), { 'a$(id)/b': sha })), 'cloud/pin', /not owner\/repo/);
  refuses(() => assemble(withHead(uses(), {})), 'cloud/pin', /no pin/);
  refuses(() => assemble(withHead(HEAD)), 'cloud/pin', /no entry/);
  const plant = extra => uses().replace('present() {', `${extra}\npresent() {`);
  for (const extra of ['declare -A REPO_PIN=()', `REPO_PIN[a/b]=${'0'.repeat(40)}`, `REPO_PIN+=([c/d]=${'0'.repeat(40)})`, 'echo "${REPO_PIN[a/b]:-0}"']) {
    refuses(() => assemble(withHead(plant(extra))), 'cloud/pin');
  }
  assert.ok(assemble(withHead(plant('[[ -v REPO_PIN[$repo] ]] && echo "${REPO_PIN[$repo]}"'))).setup, 'a test and a plain read are fine');
  assert.deepEqual(Object.keys(CLOUD_REPO_PINS).sort(), ['anthropics/claude-plugins-official', 'cloudflare/skills', 'humanlayer/skills', 'mattpocock/skills', 'mephistopheles4/grimoire', 'typesafe-ai/skills']);
  assert.ok(Object.isFrozen(CLOUD_REPO_PINS));
});

// #261 C11
test('cloud copy: a direction-changing character in the rules body is refused', () => {
  const rules = RENDER.replace('## Guards', `## Gua${RLO}rds`);
  assert.notEqual(rules, RENDER);
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

// The cloud edits went with the parallel-session text, so the cloud copy is the default render, unchanged, and it holds the stop-and-ask block.
// #261 C11; since #262 the block is the pact source's own, not a gate-held copy.
test('cloud copy: CLAUDE.cloud.md is the no-configuration render, unchanged, holding the stop-and-ask block', () => {
  const cloud = repoText(OUTPUTS.rules);
  assert.equal(cloud, RENDER);
  const block = /<!-- pact:begin stop-and-escalate -->\n[\s\S]*?<!-- pact:end stop-and-escalate -->\n/.exec(repoText('claude/CLAUDE.md'));
  assert.ok(block, 'the pact source holds the stop-and-ask block');
  assert.equal(cloud.split(block[0]).length, 2, 'the block appears once, as the source has it');
});

// #261 C10
test('cloud copy: CLAUDE.cloud.md carries no configuration and the shipped usage line', () => {
  const cloud = repoText(OUTPUTS.rules);
  // The fit-check instruction "end the fit line with `Config: <digest>.`" is in
  // every render; only a filled notice or digest would be a configuration.
  assert.doesNotMatch(cloud, /Configuration in effect/);
  assert.doesNotMatch(cloud, /Config: [0-9a-f]{12}/);
  assert.match(cloud, /When it is above 75%, wait for my/);
  for (const name of RETIRED) assert.doesNotMatch(cloud, new RegExp(`(?<![\\w-])${name}(?![\\w-])`), name);
});

// #280 C1: seam A gets the cloud copy's commands and tools constants.
test('cloud copy: the command list is pinned, and empty until the cloud channels are tried (#203, S9)', () => {
  assert.deepEqual([...CLOUD_COMMANDS], []);
  assert.ok(Object.isFrozen(CLOUD_COMMANDS));
  assert.doesNotMatch(repoText(OUTPUTS.setup), /^write_config 'commands\//m, 'no command in the cloud copy');
  assert.equal(commandsArg([]), 'none');
  assert.equal(commandsArg(['make-it-so', 'finis']), 'make-it-so,finis');
  assert.match(readFileSync(join(REPO, 'cloud-sessions', 'gen.mjs'), 'utf8'), /seamCheck\(\[stage, '--commands', commandsArg\(CLOUD_COMMANDS\), '--tools', commandsArg\(CLOUD_TOOLS\)\]\)/, 'seam A gets the constants');
});

// #280 C1: the published root setup script never installs code that posts as the owner.
test('cloud copy: the tools list is pinned empty, and the setup writes nothing under the tools path', () => {
  assert.deepEqual([...CLOUD_TOOLS], []);
  assert.ok(Object.isFrozen(CLOUD_TOOLS));
  const setup = repoText(OUTPUTS.setup);
  assert.doesNotMatch(setup, /^write_config '[^']*tools\//m, 'no tool in the cloud copy');
  assert.doesNotMatch(setup, /poster/, 'nothing of the poster');
});

test('cloud copy: the wrapper embeds cloud-setup.sh byte for byte', () => {
  const { [OUTPUTS.setup]: setup, [OUTPUTS.wrapper]: wrapper } = committed();
  const open = `cat > /tmp/cloud-setup.sh <<'${SETUP_DELIM}'\n`;
  const body = wrapper.slice(wrapper.indexOf(open) + open.length, wrapper.lastIndexOf(`${SETUP_DELIM}\n`));
  assert.equal(body, setup);
});

// #261 C11
test('cloud copy: each embedded file is its repo copy, with its hash checked, and the marker names the script', () => {
  const setup = repoText(OUTPUTS.setup);
  const blocks = [...setup.matchAll(new RegExp(`^write_config '([^']+)' <<'${CONFIG_DELIM}'\\n([\\s\\S]*?)^${CONFIG_DELIM}$`, 'gm'))];
  const source = dest =>
    dest === 'CLAUDE.md' ? OUTPUTS.rules : dest === 'pact/review.md' ? 'claude/review.md' : `claude/${dest}`;
  // The whole set, from the repo apart from seam A: the rules file, every
  // shipped agent (the lenses and scout, #262 S18) and the review file.
  const lenses = git(REPO, ['ls-files', '-z', '--', 'claude/agents/*.md']).split('\0').filter(Boolean);
  const want = ['CLAUDE.md', ...lenses.map(p => p.slice('claude/'.length)), 'pact/review.md'].sort();
  assert.ok(lenses.length >= 9 && lenses.includes('claude/agents/scout.md'), lenses.join(', '));
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
  const at = lines.indexOf('if [ "$CONFIG_WRITTEN" -eq "$EXPECTED_WRITES" ] && [ "$HASH_FAILED" -eq 0 ] && [ -z "${NODE_FAILED:-}" ]; then');
  assert.ok(at > 0, 'the marker condition, word for word');
  assert.deepEqual(lines.slice(at + 1, at + 5), [
    '  echo "pact cloud copy __PACT_CLOUD_MARKER__"',
    'else',
    '  echo "pact cloud copy INCOMPLETE ($CONFIG_WRITTEN of $EXPECTED_WRITES written, $HASH_FAILED hash mismatches${NODE_FAILED:+, node: $NODE_FAILED})"',
    'fi',
  ]);
  // #183: the Node check runs the wrapper by path, and only a wrong version
  // adds a reason here; the head's block sets every other one.
  const nodeAt = lines.indexOf('NODE_SEEN="$(/root/.local/bin/node --version 2>/dev/null || echo none)"');
  assert.ok(nodeAt > 0 && nodeAt < at, 'the Node check, by path, before the marker');
  assert.deepEqual(lines.filter(l => /NODE_FAILED=/.test(l)), ['  NODE_FAILED=version']);
  assert.ok(lines.indexOf('if [ -z "${NODE_FAILED:-}" ] && [ "$NODE_SEEN" != "v$NODE_VERSION" ]; then') > nodeAt);
  assert.equal(tail.split('pact cloud copy __PACT_CLOUD_MARKER__').length, 2, 'the marker prints in one place');
  // HASH_FAILED counts every mismatch, and nothing resets it after the checks.
  assert.match(tail, /^ {4}echo "HASH MISMATCH: ~\/\.claude\/\$rel"; HASH_FAILED=\$\(\(HASH_FAILED \+ 1\)\)$/m);
  assert.equal(lines.filter(l => /HASH_FAILED=/.test(l)).length, 2);
  // The token line tests for a value and never expands one.
  // #183 T3 C6: the proxy line asks the API with both variables unset.
  const tokenUses = lines.filter(l => /GH_TOKEN|GITHUB_TOKEN/.test(l));
  assert.deepEqual(tokenUses, [
    'if [ -n "${GH_TOKEN:-}" ] || [ -n "${GITHUB_TOKEN:-}" ]; then',
    `  env -u GH_TOKEN -u GITHUB_TOKEN curl -s --max-time 10 -w '\\n%{http_code}' https://api.github.com/user 2>/dev/null | node -e "$PROXY_LINE_PROGRAM" 2>/dev/null || echo "github api during setup: unexpected"`,
  ]);
  for (const t of [...Object.values(TEMPLATES)].map(n => repoText(`cloud-sessions/${n}`))) {
    assert.doesNotMatch(t, /set -x|printenv|\benv\b *$/m);
  }
});

// ---------------------------------------------------------------- #183 T3: third-party fetches

/** The setup's own code: the head before the config, and the Result section; never the embedded bodies. */
function ownCode(setup) {
  return setup.slice(0, setup.indexOf('echo "== Config"')) + setup.slice(setup.indexOf('echo "== Result"'));
}

/** A line's code: '' for a comment line, and every quoted string emptied. */
const codeOf = l => (l.trim().startsWith('#') ? '' : l.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/'[^']*'/g, "''"));

/** The lines of `text` outside quoted heredoc bodies (the node programs), with their indexes. */
function shellLines(text) {
  const out = [];
  let end = null;
  text.split('\n').forEach((l, i) => {
    if (end !== null) {
      if (l === end) end = null;
      return;
    }
    const m = /<<-?'([A-Z_]+)'/.exec(l);
    if (m) end = m[1];
    out.push({ l, i });
  });
  return out;
}

/** #183 T3 C1: each fetch the setup's own code makes at a moving ref, and each git fetch outside fetch_pinned or not at a pin. */
function movingFetches(setup) {
  const found = [];
  const lines = ownCode(setup).split('\n');
  const nodeFrom = lines.indexOf('echo "== Node"');
  const nodeTo = lines.indexOf('echo "== Plugins"');
  const fpFrom = lines.indexOf('fetch_pinned() {');
  const fpTo = lines.indexOf('}', fpFrom);
  let fetches = 0;
  for (const { l, i } of shellLines(lines.join('\n'))) {
    const code = codeOf(l);
    if (/(?:^|[\s;&|(])npx\s/.test(code)) found.push(`npx: ${l}`);
    if (/\bgit\b.*\bclone\b/.test(code)) found.push(`git clone: ${l}`);
    if (!l.trim().startsWith('#') && /marketplace add (?!"\$)/.test(l)) found.push(`marketplace add of a non-path source: ${l}`);
    if (/(?:^|[\s;&|(])(?:curl|wget)\s/.test(code.replace(/command -v \S+/g, '')) && !(i > nodeFrom && i < nodeTo) && !/curl -s --max-time 10 -w '\\n%\{http_code\}' https:\/\/api\.github\.com\/user /.test(l)) found.push(`a download outside the Node block: ${l}`);
    if (/(?:^|[\s;&|(])git\b.*\sfetch\b/.test(code)) {
      fetches += 1;
      if (!(i > fpFrom && i < fpTo) || !l.includes('"${REPO_PIN[$repo]}"')) found.push(`a git fetch outside fetch_pinned or not at its pin: ${l}`);
    }
  }
  if (fpFrom < 0 || fetches === 0) found.push('no fetch_pinned, or no git fetch in it');
  return found;
}

/** #183 T3 C6: each git, claude or node command in the skills and plugins code that does not run through third_party. */
function bareCommands(setup) {
  const found = [];
  const code = ownCode(setup);
  const head = code.slice(0, code.indexOf('echo "== Result"'));
  const region = head.slice(0, head.indexOf('echo "== Node"')) + head.slice(head.indexOf('echo "== Plugins"'));
  for (const { l } of shellLines(region)) {
    for (const seg of codeOf(l).split(/&&|\|\||;|\|/)) {
      const hits = seg.match(/(?:^|[\s(!`])(?:git|claude|node)(?=\s|$)/g) ?? [];
      if (hits.length === 0 || /command -v (?:git|claude|node)\b/.test(seg)) continue;
      if (hits.length !== 1 || !/\bthird_party\s+(?:-o\s+\S+\s+)?(?:git|claude|node)\s/.test(seg)) found.push(l);
    }
  }
  return found;
}

test('cloud copy: the setup fetches no third-party code at a moving ref, and every git fetch is fetch_pinned at a pin (#183 T3 C1)', () => {
  const setup = repoText(OUTPUTS.setup);
  assert.deepEqual(movingFetches(setup), []);
  // Bad cases: each plant is one the check must see.
  const at = setup.indexOf('echo "== Skills"');
  for (const plant of ['npx -y skills add a/b -y', 'git clone --depth 1 https://github.com/a/b x', 'third_party claude plugin marketplace add anthropics/claude-plugins-official', 'third_party git -C "$x" fetch -q --depth 1 https://github.com/a/b main']) {
    assert.notDeepEqual(movingFetches(`${setup.slice(0, at)}${plant}\n${setup.slice(at)}`), [], plant);
  }
});

test('cloud copy: every git, claude and node command in the plugins and skills steps runs through third_party (#183 T3 C6)', () => {
  const setup = repoText(OUTPUTS.setup);
  assert.deepEqual(bareCommands(setup), []);
  const at = setup.indexOf('echo "== Skills"');
  assert.deepEqual(bareCommands(`${setup.slice(0, at)}  git -C "$tmp" ls-tree -r HEAD\n${setup.slice(at)}`), ['  git -C "$tmp" ls-tree -r HEAD']);
  // third_party runs its command with both token variables unset.
  assert.match(setup, /^ {2}\(cd "\$PACT_STEP_DIR" && env -u GH_TOKEN -u GITHUB_TOKEN GIT_TERMINAL_PROMPT=0 timeout "\$secs" "\$@"\)/m);
});

// #183 T3 C13
test('cloud copy: both generated setup scripts parse under bash -n', { skip: WIN && 'not run: bash is not on a Windows runner by default' }, () => {
  for (const rel of [OUTPUTS.setup, OUTPUTS.wrapper]) {
    const r = spawnSync('bash', ['-n', join(REPO, ...rel.split('/'))], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${rel}: ${r.stderr}`);
  }
  // Bad case: a script that doesn't parse is seen to fail.
  const bad = spawnSync('bash', ['-n'], { input: 'if true; then\n', encoding: 'utf8' });
  assert.notEqual(bad.status, 0);
});

// #183 C6, C3: read, not run, as above. The Node block's hand checks are in
// the test driver; this holds the order of its checks.
test('cloud copy: the Node block checks every pin before anything runs or lands on the PATH', () => {
  const setup = repoText(OUTPUTS.setup);
  for (const [k, v] of Object.entries(CLOUD_PINS)) {
    assert.equal(setup.split(v).length, 2, `${k} appears once`);
    assert.match(setup, new RegExp(`^${k}=${v.replace(/[.]/g, '\\.')}$`, 'm'), `${k} is a plain assignment`);
  }
  const block = setup.slice(setup.indexOf('echo "== Node"'), setup.indexOf('echo "== Plugins"'));
  assert.ok(block.length > 0 && setup.indexOf('echo "== Node"') < setup.indexOf('echo "== Plugins"'), 'the block runs before the plugins step');
  // #183 T3: plugins before skills, so a spent budget skips skills first.
  assert.ok(setup.indexOf('echo "== Plugins"') < setup.indexOf('echo "== Skills"'), 'the plugins step runs before the skills step');
  const at = needle => {
    const i = block.indexOf(needle);
    assert.ok(i >= 0, `the block holds: ${needle}`);
    return i;
  };
  const arch = at('if [ "$(uname -m)" != "x86_64" ]; then');
  const curl = at(`env -u GH_TOKEN -u GITHUB_TOKEN $T curl -fsSL --proto '=https' --tlsv1.2 `);
  const miseHash = at('!= "$MISE_SHA256" ]; then');
  const untar = at('tar -xzf ');
  const paranoid = at('paranoid = true');
  const asked = at('"$MISE_BIN" settings get paranoid');
  const lock = at('checksum = "sha256:$NODE_TAR_SHA256"');
  const install = at('env -u GH_TOKEN -u GITHUB_TOKEN MISE_SAFE=1 MISE_LOCKED=1 $T "$MISE_BIN" install');
  const binHash = at('!= "$NODE_BIN_SHA256" ]; then');
  const wrappers = at('"$NODE_WRAPPER_TAG" "$NODE_HOME/bin/$w" > "/root/.local/bin/$w"');
  assert.ok(arch < curl && curl < miseHash && miseHash < untar, 'arch, download, then the hash before unpacking');
  const hashToUntar = block.slice(miseHash, untar);
  assert.ok(hashToUntar.includes('elif ') && !/^\s*fi$/m.test(hashToUntar), 'unpacking is the else of the hash check');
  assert.ok(untar < paranoid && paranoid < asked && asked < lock && lock < install && install < binHash, 'config, lockfile, install, then the binary');
  assert.ok(binHash < wrappers, 'wrappers only after every check');
  assert.ok(block.slice(binHash, wrappers).includes('if [ -z "$NODE_FAILED" ]; then'), 'wrappers only when no check failed');
  for (const l of block.split('\n').filter(l => /\bcurl -|"\$MISE_BIN" (?!settings)/.test(l))) {
    assert.match(l, /env -u GH_TOKEN -u GITHUB_TOKEN /, `a fetch without the tokens: ${l}`);
  }
  for (const setting of ['lockfile = true', 'use_versions_host = false', 'node.verify = true', 'node.gpg_verify = true', 'node.mirror_url = "https://nodejs.org/dist/"']) at(setting);
});

// #183, ADR 0088: the pin bump's keys stay the bytes their README records, so
// a swapped binary keyring shows as a text change in review.
test('cloud copy: each committed key file hashes to the value its README records', () => {
  const readme = repoText('cloud-sessions/keys/README.md');
  for (const name of ['node-release-keys.kbx', 'mise-minisign.pub']) {
    const want = new RegExp(`^- \`${name.replace(/[.]/g, '\\.')}\`: \`([0-9a-f]{64})\`$`, 'm').exec(readme);
    assert.ok(want, `the README records ${name}'s hash`);
    assert.equal(createHash('sha256').update(readFileSync(join(REPO, 'cloud-sessions', 'keys', name))).digest('hex'), want[1], name);
  }
});

test('cloud copy: the templates are the four the generator reads', () => {
  assert.deepEqual(Object.values(TEMPLATES).sort(), ['tpl-config-head.sh', 'tpl-config-tail.sh', 'tpl-setup-head.sh', 'tpl-setup-tail.sh']);
});
