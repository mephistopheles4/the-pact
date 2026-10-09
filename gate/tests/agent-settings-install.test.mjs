// Agent settings (#97): the install script end to end, against a throwaway
// repo and -ClaudeHome. Never touches ~/.claude. Expected agent bytes are built
// here from the repo's copy, never taken from the renderer. The renderer's own
// cases, which never install, are in agent-settings.test.mjs.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { plantModule } from './gate-files.mjs';
import { REPO } from './text.mjs';
import { home, install, listTree, makeRepo, refused } from './install-harness.mjs';

const sha256 = b => createHash('sha256').update(b).digest('hex');
const AGENT = readFileSync(join(REPO, 'claude', 'agents', 'integrity-lens.md'), 'utf8');

/** The repo's integrity-lens file with its model and effort lines set. */
const withAgent = (model, effort) => AGENT.replace(/^model: .*$/m, `model: ${model}`).replace(/^effort: .*$/m, `effort: ${effort}`);

// ------------------------------------------------------------ the install script, end to end

function configure(h, config) {
  mkdirSync(join(h, 'pact'), { recursive: true });
  writeFileSync(join(h, 'pact', 'config.json'), `${JSON.stringify(config)}\n`);
}

function dryRunHash(r) {
  const m = /^ {2}rendered rules file: sha256 ([0-9a-f]{64})\r?$/m.exec(r.stdout);
  assert.ok(m, r.out);
  return m[1];
}

test('a configured install writes the rendered integrity-lens, records its hash, and removing the setting puts the committed file back', t => {
  const repo = makeRepo(t);
  const h = home(t);
  configure(h, { schema: 1, agents: { 'integrity-lens': { model: 'sonnet', effort: 'low' } } });
  const dry = install(repo, h);
  assert.equal(dry.code, 0, dry.out);
  assert.match(dry.stdout, /^ {2}WARN: the user configuration sets integrity-lens to sonnet, low effort\.\r?$/m, dry.out);
  assert.match(dry.stdout, /^seam-a\| RESULT: pass\r?$/m, dry.out);
  const r = install(repo, h, { apply: true, extra: ['-RenderedHash', dryRunHash(dry)] });
  assert.equal(r.code, 0, r.out);
  const want = Buffer.from(withAgent('sonnet', 'low'));
  assert.deepEqual(readFileSync(join(h, 'agents', 'integrity-lens.md')), want);
  const manifest = JSON.parse(readFileSync(join(h, '.pact-install.json'), 'utf8'));
  assert.equal(manifest.files.find(f => f.path === 'agents/integrity-lens.md').sha256, sha256(want));
  assert.match(readFileSync(join(h, 'CLAUDE.md'), 'utf8'), /^Agents set: integrity-lens \(sonnet, low effort\)\.$/m);
  const again = install(repo, h);
  assert.match(again.stdout, /^Nothing to do\.\r?$/m, again.out);

  // Removing the setting: the next install overwrites the live file with the committed bytes, with no drift.
  configure(h, { schema: 1, settings: { 'usage-pause': 90 } });
  const dry2 = install(repo, h);
  assert.equal(dry2.code, 0, dry2.out);
  assert.match(dry2.stdout, /^Drift: 0\r?$/m, dry2.out);
  const r2 = install(repo, h, { apply: true, extra: ['-RenderedHash', dryRunHash(dry2)] });
  assert.equal(r2.code, 0, r2.out);
  assert.deepEqual(readFileSync(join(h, 'agents', 'integrity-lens.md')), readFileSync(join(repo, 'claude', 'agents', 'integrity-lens.md')));
});

test('a configured install sets a security-set lens and a shell lens: each WARN names the override, the shell lens names its egress risk, and both files install', t => {
  const repo = makeRepo(t);
  const h = home(t);
  configure(h, { schema: 1, agents: { 'behaviour-lens': { model: 'sonnet' }, 'data-lens': { effort: 'medium' }, 'integrity-lens': { effort: 'high' } } });
  const dry = install(repo, h);
  assert.equal(dry.code, 0, dry.out);
  const over = name => `${name} is a security-set lens, so this is an override, not security-tested: its security set ran only on its default\\.`;
  const egress = ' On a weaker setting it may follow instructions planted in the code it reviews, or send a secret out through a command, a browser address or a search query\\.';
  assert.match(dry.stdout, new RegExp(`^ {2}WARN: the user configuration sets behaviour-lens to sonnet, medium effort\\. ${over('behaviour-lens')}${egress}\\r?$`, 'm'), dry.out);
  assert.match(dry.stdout, new RegExp(`^ {2}WARN: the user configuration sets data-lens to opus, medium effort\\. ${over('data-lens')}\\r?$`, 'm'), dry.out);
  assert.match(dry.stdout, /^ {2}WARN: the user configuration sets integrity-lens to opus, high effort\.\r?$/m, dry.out);
  const r = install(repo, h, { apply: true, extra: ['-RenderedHash', dryRunHash(dry)] });
  assert.equal(r.code, 0, r.out);
  const set = (name, model, effort) => Buffer.from(readFileSync(join(repo, 'claude', 'agents', `${name}.md`), 'utf8').replace(/^model: .*$/m, `model: ${model}`).replace(/^effort: .*$/m, `effort: ${effort}`));
  assert.deepEqual(readFileSync(join(h, 'agents', 'behaviour-lens.md')), set('behaviour-lens', 'sonnet', 'medium'));
  assert.deepEqual(readFileSync(join(h, 'agents', 'data-lens.md')), set('data-lens', 'opus', 'medium'));
  const rules = readFileSync(join(h, 'CLAUDE.md'), 'utf8');
  assert.match(rules, /^Agents set: behaviour-lens \(sonnet, medium effort; override, not security-tested\), data-lens \(opus, medium effort; override, not security-tested\), integrity-lens \(opus, high effort\)\.$/m);
  assert.match(rules, /^Put "override, not security-tested" beside every report you post from these lenses, and in their rows of the Lens dispositions table: behaviour-lens, data-lens\.$/m);
  // Rollback: with the agents key gone, the next install puts back the committed files.
  configure(h, { schema: 1 });
  const dry2 = install(repo, h);
  assert.equal(dry2.code, 0, dry2.out);
  const r2 = install(repo, h, { apply: true, extra: ['-RenderedHash', dryRunHash(dry2)] });
  assert.equal(r2.code, 0, r2.out);
  for (const a of ['behaviour-lens', 'data-lens', 'integrity-lens']) assert.deepEqual(readFileSync(join(h, 'agents', `${a}.md`)), readFileSync(join(repo, 'claude', 'agents', `${a}.md`)));
});

test('bad case: an agent setting changed between the dry run and -Apply refuses by the rendered hash', t => {
  const repo = makeRepo(t);
  const h = home(t);
  configure(h, { schema: 1, agents: { 'integrity-lens': { model: 'sonnet' } } });
  const hash = dryRunHash(install(repo, h));
  configure(h, { schema: 1, agents: { 'integrity-lens': { model: 'opus', effort: 'low' } } });
  const r = install(repo, h, { apply: true, extra: ['-RenderedHash', hash] });
  refused(r);
  assert.match(r.stdout, /^REFUSED: the hash given with -RenderedHash is not the full hash/m, r.out);
  assert.ok(!existsSync(join(h, 'agents')), 'the refused install wrote agents');
});

// ------------------------------------------------------------ the install script: a renderer that lies

const R_PUSH = '  report.lines.push(`RENDERED ${sha256(rendered)}`, `DIFF ${sha256(diff)}`, ...head);';
const R_AGENT_PUSH = "  for (const a of agents) report.lines.push(`AGENT ${a.name} ${a.model} ${a.effort} ${sha256(a.buf)} ${a.security ? 'security-set' : 'plain'} ${a.override ? 'override' : 'default'} ${a.egress ? 'egress' : 'local'}`);";
const R_AGENT_WRITE = "  for (const a of agents) writeFileSync(join(out, `${AGENT_OUTPUT_PREFIX}${a.name}.md`), a.buf, { flag: 'wx' });";
const R_DIFF_WRITE = "  writeFileSync(join(out, DIFF_NAME), diff, { flag: 'wx' });";
const A64 = 'a'.repeat(64);

function plantRenderer(root, from, to) {
  plantModule(join(root, 'gate'), 'render', from, to);
}

const SET = { schema: 1, agents: { 'integrity-lens': { model: 'sonnet', effort: 'low' } } };

for (const [label, config, from, to, why] of [
  ['an AGENT line with no configuration', null, R_PUSH, `${R_PUSH}\n  report.lines.push('AGENT integrity-lens sonnet low ${A64} plain override local');`, 'the renderer reported a digest, a value, an edit or an agent setting with no configuration'],
  ['an AGENT line for an agent off the list', SET, R_AGENT_PUSH, "  report.lines.push(`AGENT scout sonnet low ${sha256(agents[0].buf)} plain override local`);", 'the renderer printed a line the install does not read'],
  ['an AGENT line whose name differs only in case', SET, R_AGENT_PUSH, "  report.lines.push(`AGENT Integrity-lens sonnet low ${sha256(agents[0].buf)} plain override local`);", 'the renderer printed a line the install does not read'],
  ['an AGENT line with a value off the pattern', SET, R_AGENT_PUSH, "  report.lines.push(`AGENT integrity-lens haiku low ${sha256(agents[0].buf)} plain override local`);", 'the renderer printed a line the install does not read'],
  ['an AGENT line with no classification words', SET, R_AGENT_PUSH, "  report.lines.push(`AGENT integrity-lens sonnet low ${sha256(agents[0].buf)}`);", 'the renderer printed a line the install does not read'],
  ['the AGENT line twice', SET, R_AGENT_PUSH, `${R_AGENT_PUSH}\n${R_AGENT_PUSH}`, 'the renderer reported one agent setting twice'],
  ['an agent file hash other than its own', SET, R_AGENT_PUSH, `  report.lines.push('AGENT integrity-lens sonnet low ${A64} plain override local');`, "the rendered agent file's hash does not match the one the renderer reported"],
  ['default for a changed file', SET, R_AGENT_PUSH, "  for (const a of agents) report.lines.push(`AGENT ${a.name} ${a.model} ${a.effort} ${sha256(a.buf)} plain default local`);", "the renderer's override word for integrity-lens does not match whether its file changed"],
  ['override for a file at its own values', { schema: 1, agents: { 'integrity-lens': { model: 'opus' } } }, R_AGENT_PUSH, "  for (const a of agents) report.lines.push(`AGENT ${a.name} ${a.model} ${a.effort} ${sha256(a.buf)} plain override local`);", "the renderer's override word for integrity-lens does not match whether its file changed"],
  ['local and plain for the shell lens', { schema: 1, agents: { 'behaviour-lens': { model: 'sonnet' } } }, R_AGENT_PUSH, "  for (const a of agents) report.lines.push(`AGENT ${a.name} ${a.model} ${a.effort} ${sha256(a.buf)} plain override local`);", "the renderer's egress word for behaviour-lens does not match its committed tools line"],
  ['egress for a lens with only the read tools', SET, R_AGENT_PUSH, "  for (const a of agents) report.lines.push(`AGENT ${a.name} ${a.model} ${a.effort} ${sha256(a.buf)} security-set override egress`);", "the renderer's egress word for integrity-lens does not match its committed tools line"],
  ['egress but plain for the shell lens', { schema: 1, agents: { 'behaviour-lens': { model: 'sonnet' } } }, R_AGENT_PUSH, "  for (const a of agents) report.lines.push(`AGENT ${a.name} ${a.model} ${a.effort} ${sha256(a.buf)} plain override egress`);", 'the renderer called behaviour-lens egress but not security-set'],
  ['an AGENT line for another lens than the file it left', SET, R_AGENT_PUSH, "  report.lines.push(`AGENT behaviour-lens sonnet low ${sha256(agents[0].buf)} security-set override egress`);", 'the renderer did not leave exactly its rules file of at most 1 MiB, its diff, and an agent file only for an agent setting it reported'],  ['an AGENT line with no agent file', SET, R_AGENT_WRITE, '', 'the renderer did not leave exactly its rules file of at most 1 MiB, its diff, and an agent file only for an agent setting it reported'],
  ['an agent file with no AGENT line', SET, R_AGENT_PUSH, '', 'the renderer did not leave exactly its rules file of at most 1 MiB, its diff, and an agent file only for an agent setting it reported'],
  ['a third file under another name', null, R_DIFF_WRITE, `${R_DIFF_WRITE}\n  writeFileSync(join(out, 'agent-behaviour-lens.md'), 'x');`, 'the renderer did not leave exactly its rules file of at most 1 MiB, its diff, and an agent file only for an agent setting it reported'],
  ['an agent file changed beyond its two lines', SET, R_AGENT_WRITE, "  for (const a of agents) { a.buf = Buffer.from(a.buf.toString('utf8').replace('tools: [Read, Glob, Grep]', 'tools: [Read, Glob, Grep, Bash]')); writeFileSync(join(out, `${AGENT_OUTPUT_PREFIX}${a.name}.md`), a.buf, { flag: 'wx' }); }", 'the rendered agent file differs from the committed one beyond its model and effort lines, or does not hold the reported values'],
  ['a model line other than the one it reports', SET, R_AGENT_WRITE, `  for (const a of agents) a.buf = Buffer.from(a.buf.toString('utf8').replace('model: sonnet', 'model: opus'));\n${R_AGENT_WRITE}`, 'the rendered agent file differs from the committed one beyond its model and effort lines, or does not hold the reported values'],
  ['the committed lines left unchanged while it reports a setting', SET, R_AGENT_WRITE, `  for (const a of agents) a.buf = Buffer.from(a.buf.toString('utf8').replace('model: sonnet', 'model: opus').replace('effort: low', 'effort: medium'));\n${R_AGENT_WRITE}`, 'the rendered agent file differs from the committed one beyond its model and effort lines, or does not hold the reported values'],
  ['an effort line other than the one it reports', SET, R_AGENT_WRITE, `  for (const a of agents) a.buf = Buffer.from(a.buf.toString('utf8').replace('effort: low', 'effort: medium'));\n${R_AGENT_WRITE}`, 'the rendered agent file differs from the committed one beyond its model and effort lines, or does not hold the reported values'],
  ['a body line changed in place of the frontmatter', SET, R_AGENT_WRITE, `  for (const a of agents) a.buf = Buffer.from(a.buf.toString('utf8').replace('# integrity-lens', 'model: sonnet'));\n${R_AGENT_WRITE}`, 'the rendered agent file differs from the committed one beyond its model and effort lines, or does not hold the reported values'],
  ['an agent written into the stage', SET, R_AGENT_WRITE, `${R_AGENT_WRITE}\n  for (const a of agents) writeFileSync(join(dirname(source), 'agents', 'integrity-lens.md'), a.buf);`, 'the renderer changed the stage'],
]) {
  test(`bad case: a renderer that reports ${label} refuses, and nothing is installed`, t => {
    const repo = makeRepo(t, root => plantRenderer(root, from, to));
    const h = home(t);
    if (config) configure(h, config);
    const r = install(repo, h, { apply: true, extra: config ? ['-RenderedHash', A64] : [] });
    refused(r);
    assert.match(r.stdout, /^render\| RESULT: pass\r?$/m, r.out);
    assert.match(r.stdout, new RegExp(`^REFUSED: ${why.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.`, 'm'), r.out);
    assert.ok(!listTree(h).some(f => f === 'CLAUDE.md' || f === '.pact-install.json' || f.startsWith('agents')), listTree(h).join('\n'));
  });
}

test('bad case: a renderer that rewrites a model line in the body, not the frontmatter, refuses', t => {
  // The committed lens carries a body line that starts like a model line, so
  // only the frontmatter-only rule tells the two apart.
  const repo = makeRepo(t, root => {
    const f = join(root, 'claude', 'agents', 'integrity-lens.md');
    writeFileSync(f, readFileSync(f, 'utf8').replace('# integrity-lens', 'model: opus\n\n# integrity-lens'));
    plantRenderer(root, R_AGENT_WRITE, `  for (const a of agents) { const l = a.buf.toString('utf8').split('\\n'); const i = l.indexOf('model: opus', 8); l[i] = 'model: sonnet'; a.buf = Buffer.from(l.join('\\n')); }\n${R_AGENT_WRITE}`);
  });
  const h = home(t);
  configure(h, SET);
  const r = install(repo, h, { apply: true, extra: ['-RenderedHash', A64] });
  refused(r);
  assert.match(r.stdout, /^render\| RESULT: pass\r?$/m, r.out);
  assert.match(r.stdout, /^REFUSED: the rendered agent file differs from the committed one beyond its model and effort lines, or does not hold the reported values\./m, r.out);
});

test('bad case: a configuration setting integrity-lens on a commit with no integrity-lens file refuses', t => {
  // A planted renderer that does not read the file, so only the install's own check stands.
  const repo = makeRepo(t, root => {
    plantRenderer(root, "    agents = checked.agents.map(a => renderAgent(source, a, report, buf.toString('utf8')));", "    agents = checked.agents.map(a => ({ name: a.name, model: 'sonnet', effort: 'low', buf: Buffer.from('x') }));");
    rmSync(join(root, 'claude', 'agents', 'integrity-lens.md'));
  });
  const h = home(t);
  configure(h, SET);
  const r = install(repo, h, { apply: true, extra: ['-RenderedHash', A64] });
  refused(r);
  assert.match(r.stdout, /^REFUSED: the configuration sets integrity-lens, but the commit holds no claude\/agents\/integrity-lens\.md\./m, r.out);
});
