// The pact's commands as skills, linked into a harness's skills folder (spec
// 0007 S7, S9): C19, and C17 and C18 as they hold for a link. Codex's known
// description is the harness here, in a throwaway home.
import assert from 'node:assert/strict';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { applyBound, commitAll, home, install, makeRepo, passed, refused } from './install-harness.mjs';

const at = (h, rel) => join(h, ...rel.split('/'));
const read = (h, rel) => readFileSync(at(h, rel), 'utf8');
const record = h => JSON.parse(read(h, '.pact/install.json'));
const put = (h, rel, text) => {
  mkdirSync(dirname(at(h, rel)), { recursive: true });
  writeFileSync(at(h, rel), text);
};
const config = (h, commands, install_ = ['codex']) => put(h, '.pact/config.json', `${JSON.stringify({ schema: 1, commands, harnesses: { install: install_ } })}\n`);
const kind = (h, rel) => {
  try {
    const st = lstatSync(at(h, rel));
    return st.isSymbolicLink() ? 'link' : st.isDirectory() ? 'folder' : 'file';
  } catch (e) {
    if (e.code === 'ENOENT') return 'absent';
    throw e;
  }
};
const pointsAt = (h, rel, to) => assert.equal(realpathSync.native(at(h, rel)), realpathSync.native(at(h, to)), rel);
const codexHome = t => {
  const h = home(t);
  mkdirSync(at(h, '.codex'));
  return h;
};
const SKILLS = '.agents/skills';
const links = h => (record(h).links ?? []).map(l => [l.harness, l.path, l.target]).sort();

test('C19: one apply links each skill and records the link; a command turned off and a harness taken out lose only their own links', t => {
  const repo = makeRepo(t);
  const h = codexHome(t);
  config(h, ['finis', 'scry']);
  put(h, `${SKILLS}/mine/SKILL.md`, 'mine\n');
  const dry = install(repo, h);
  passed(dry);
  assert.match(dry.stdout, /^ {2}link \.agents\/skills\/finis -> \.pact\/skills\/finis\r?$/m, dry.out);
  assert.equal(kind(h, `${SKILLS}/finis`), 'absent', 'a dry run writes nothing');
  passed(applyBound(repo, h));
  for (const n of ['finis', 'scry', 'scriptorium']) {
    assert.equal(kind(h, `${SKILLS}/${n}`), 'link', n);
    pointsAt(h, `${SKILLS}/${n}`, `.pact/skills/${n}`);
  }
  assert.deepEqual(links(h), ['finis', 'scriptorium', 'scry'].map(n => ['codex', `${SKILLS}/${n}`, `.pact/skills/${n}`]));
  const again = install(repo, h);
  passed(again);
  assert.match(again.stdout, /^Nothing to do\.\r?$/m, again.out);

  rmSync(at(h, `${SKILLS}/finis`), { recursive: true });
  const gone = install(repo, h);
  passed(gone);
  assert.match(gone.stdout, /^ {2}link \.agents\/skills\/finis -> \.pact\/skills\/finis\r?$/m, gone.out);
  passed(applyBound(repo, h));
  assert.equal(kind(h, `${SKILLS}/finis`), 'link', 'a recorded link that is gone is made again');

  config(h, ['finis']);
  passed(applyBound(repo, h));
  assert.deepEqual([kind(h, `${SKILLS}/finis`), kind(h, `${SKILLS}/scry`)], ['link', 'absent']);
  const manifests = readdirSync(at(h, '.pact/backups')).sort().map(b => JSON.parse(read(h, `.pact/backups/${b}/manifest.json`)));
  assert.deepEqual(manifests.at(-1).entries.find(e => e.path === `${SKILLS}/scry`), { path: `${SKILLS}/scry`, harness: 'codex', was: 'link', target: '.pact/skills/scry' });

  config(h, ['finis'], []);
  passed(applyBound(repo, h));
  assert.deepEqual(readdirSync(at(h, SKILLS)), ['mine'], 'only the recorded links went');
  assert.equal(read(h, `${SKILLS}/mine/SKILL.md`), 'mine\n');
  assert.deepEqual(links(h), []);
});

test('C18: a skill folder the record does not list is yours and left as is; a recorded link replaced since the install is drift', t => {
  const repo = makeRepo(t);
  const h = codexHome(t);
  config(h, ['finis', 'scry']);
  put(h, `${SKILLS}/scry/SKILL.md`, 'mine\n');
  const first = applyBound(repo, h);
  passed(first);
  assert.match(first.stdout, /^Yours, left as is: 1\r?\n {2}\.agents\/skills\/scry\r?$/m, first.out);
  assert.equal(read(h, `${SKILLS}/scry/SKILL.md`), 'mine\n');
  assert.ok(!links(h).some(l => l[1] === `${SKILLS}/scry`));

  rmSync(at(h, `${SKILLS}/finis`), { recursive: true });
  put(h, `${SKILLS}/finis/SKILL.md`, 'mine now\n');
  const r = applyBound(repo, h);
  refused(r, /installed files or settings entries changed/);
  assert.match(r.stdout, /^ {2}\.agents\/skills\/finis \(the pact's skill link changed since the install\)\r?$/m, r.out);
  assert.equal(read(h, `${SKILLS}/finis/SKILL.md`), 'mine now\n');
  // Turned off, the replaced link is still reported, and still left.
  config(h, ['scry']);
  const off = applyBound(repo, h);
  refused(off, /installed files or settings entries changed/);
  assert.match(off.stdout, /^ {2}\.agents\/skills\/finis \(the pact's skill link changed since the install\)\r?$/m, off.out);
  assert.equal(read(h, `${SKILLS}/finis/SKILL.md`), 'mine now\n');
});

test('bad case: a record link the install may not act on is warned about and skipped, links in another shape refuse, and so does a skills folder that is a link', t => {
  const repo = makeRepo(t);
  const h = codexHome(t);
  config(h, ['finis']);
  passed(applyBound(repo, h));
  const kept = record(h);
  const planted = [
    { harness: 'codex', path: `${SKILLS}/../planted`, target: '.pact/skills/planted' },
    { harness: 'codex', path: `${SKILLS}/other`, target: '.pact/config.json' },
  ];
  put(h, '.pact/install.json', JSON.stringify({ ...kept, links: [...kept.links, ...planted] }));
  const r = install(repo, h);
  passed(r);
  assert.match(r.stdout, /^WARN: path outside its harness's folders in the install record, skipped: \.agents\/skills\/\.\.\/planted\r?$/m, r.out);
  assert.match(r.stdout, /^WARN: unsafe path in the install record, skipped: \.agents\/skills\/other\r?$/m, r.out);
  assert.doesNotMatch(r.stdout, /unlink/, r.out);

  put(h, '.pact/install.json', JSON.stringify({ ...kept, links: [{ harness: 'codex', path: `${SKILLS}/finis` }] }));
  refused(install(repo, h), /links are not a list of skill links/);

  const behind = codexHome(t);
  config(behind, ['finis']);
  mkdirSync(at(behind, '.agents/elsewhere'), { recursive: true });
  symlinkSync(at(behind, '.agents/elsewhere'), at(behind, SKILLS), 'junction');
  refused(install(repo, behind), /path through a link for a skill folder/);
  assert.deepEqual(readdirSync(at(behind, '.agents/elsewhere')), []);
});

/** A repo whose one function that makes a link fails first, where `when` holds. */
const noLinks = (t, when) => makeRepo(t, root => {
  const p = join(root, 'gate', 'install-io.mjs');
  const s = readFileSync(p, 'utf8');
  const head = 'export function makeLink(target, path) {';
  assert.equal(s.split(head).length, 2);
  writeFileSync(p, s.replace(head, `${head}\n  if (${when}) throw Object.assign(new Error('planted'), { code: 'EPERM' });`));
});

test('C19: a link that fails only at its own place is copied by the apply, which says so', t => {
  // The install's trial link, in its work folder, still succeeds.
  const repo = noLinks(t, "!path.includes('link-probe')");
  const h = codexHome(t);
  config(h, ['finis']);
  const r = applyBound(repo, h);
  passed(r);
  assert.match(r.stdout, /^copied \.agents\/skills\/finis: a link could not be made\r?$/m, r.out);
  assert.equal(read(h, `${SKILLS}/finis/SKILL.md`), read(h, '.pact/skills/finis/SKILL.md'));
  assert.deepEqual(links(h), []);
  const again = install(repo, h);
  passed(again);
  assert.match(again.stdout, /^Nothing to do\.\r?$/m, again.out);
});

test('C19: where a link cannot be made, the dry run says so and the install copies the folder; the copy comes out again', t => {
  const repo = noLinks(t, 'true');
  const h = codexHome(t);
  config(h, ['finis']);
  const dry = install(repo, h);
  passed(dry);
  assert.match(dry.stdout, /^WARN: a skill link cannot be made on this machine, so each new skill folder is copied instead\.\r?$/m, dry.out);
  passed(applyBound(repo, h));
  assert.equal(kind(h, `${SKILLS}/finis`), 'folder');
  assert.equal(read(h, `${SKILLS}/finis/SKILL.md`), read(h, '.pact/skills/finis/SKILL.md'));
  assert.ok(record(h).files.some(f => f.path === `${SKILLS}/finis/agents/openai.yaml` && f.harness === 'codex'));
  const again = install(repo, h);
  passed(again);
  assert.match(again.stdout, /^Nothing to do\.\r?$/m, again.out);
  config(h, ['finis'], []);
  passed(applyBound(repo, h));
  assert.equal(kind(h, `${SKILLS}/finis`), 'absent', 'no empty folder is left');
});

// agy 1.2.14 lists no skill whose folder is a link (docs/log/2026-11-25-antigravity.md), so Antigravity's are copied.
test('C19: a harness that does not discover a linked skill gets copies, beside another harness\'s links, and they come out again', t => {
  const repo = makeRepo(t);
  const h = codexHome(t);
  mkdirSync(at(h, '.gemini/config'), { recursive: true });
  config(h, ['finis'], ['codex', 'antigravity']);
  const dry = install(repo, h);
  passed(dry);
  assert.doesNotMatch(dry.stdout, /^WARN: a skill link cannot be made|^ {2}link \.gemini\//m, dry.out);
  passed(applyBound(repo, h));
  const AG = '.gemini/config/skills';
  assert.deepEqual([kind(h, `${SKILLS}/finis`), kind(h, `${AG}/finis`)], ['link', 'folder']);
  assert.equal(read(h, `${AG}/finis/SKILL.md`), read(h, '.pact/skills/finis/SKILL.md'));
  assert.ok(record(h).files.some(f => f.path === `${AG}/finis/SKILL.md` && f.harness === 'antigravity'));
  assert.deepEqual(links(h).map(l => l[0]), ['codex', 'codex']);
  const again = install(repo, h);
  passed(again);
  assert.match(again.stdout, /^Nothing to do\.\r?$/m, again.out);
  config(h, ['finis'], ['codex']);
  passed(applyBound(repo, h));
  assert.equal(kind(h, `${AG}/finis`), 'absent');
});
