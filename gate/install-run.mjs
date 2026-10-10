// The install runner (#153, S3). The bootstrap (gate/install.mjs) starts it
// from the stage it made of HEAD's files, so every line here is committed
// code. It does everything after staging, as scripts/install.ps1 did: pin,
// render, seam A, the copy set, the plan, settings, review output, apply,
// record and verify. The four gate checks run in-process, through each core's
// check(), with ADR 0032's controls kept (S5): this process refuses any
// preload, each verdict needs both parts, only the checks' own cleaned lines
// are shown, and the bootstrap's clock stops the whole run until CHECKS DONE.
// Every decision is a function in install-core.mjs; every read and write is
// in install-io.mjs. No error's own text is ever printed.
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as core from './install-core.mjs';
import * as io from './install-io.mjs';
import { FOLD_CASE } from './paths.mjs';

const say = s => process.stdout.write(`${s}\n`);
const live = (root, rel) => join(root, ...rel.split('/'));
let gateLines = [];

/** The count of other work folders a hard stop left, which may hold configuration text (S3, step 6). */
function leftoverNote(tmp, own) {
  const left = io.leftoverWorkFolders(tmp, own);
  if (left) say(`NOTE: ${left} other pact-install-* folder(s) in the temp folder; an install stopped hard left them, and they may hold configuration text. docs/install.md says how to delete them.`);
}
let writing = false;

/** A gate module's core, loaded from the stage; a missing or broken one refuses. */
async function loadCore(file) {
  try {
    return (await import(`./${file}`)).check;
  } catch {
    return core.stops.moduleMissing(`gate/${file}`);
  }
}

/** Runs a core in-process: its cleaned lines shown (ROOT lines never), its verdict needing both parts. */
function runCheck(check, argv, prefix, what) {
  const report = check(argv);
  const lines = core.outputLines(report.lines);
  for (const l of core.showLines(lines.filter(l => !l.startsWith('ROOT ')), prefix)) say(l);
  return { report, lines: core.checkVerdict(report, what) };
}

const stateOf = root => {
  try {
    return io.treeState(root);
  } catch {
    return core.stops.stageUnreadable();
  }
};

async function main() {
  if (process.env.NODE_OPTIONS !== undefined || process.execArgv.length) core.stops.preload();
  const run = core.parseRunnerArgs(process.argv.slice(2));
  const { work, commit } = run;
  const stage = join(work, 'stage');
  try {
    core.checkWorkFolder({
      parentReal: realpathSync.native(dirname(work)),
      tmpReal: realpathSync.native(tmpdir()),
      name: basename(work),
      hasGit: io.exists(join(work, '.git')),
      runnerReal: realpathSync.native(fileURLToPath(import.meta.url)),
      expectedRunnerReal: realpathSync.native(join(stage, 'gate', 'install-run.mjs')),
      fold: FOLD_CASE,
    });
  } catch (e) {
    if (e instanceof core.Refusal) throw e;
    core.stops.runArgs();
  }
  const opts = core.parseArgs(run.words, process.platform);
  const home = resolve(opts.claudeHome ?? join(homedir(), '.claude'));
  const project = opts.projectFolder !== null;

  // The stage against the commit's tree, from committed code (G7, G9).
  const tree = core.parseTree(readFileSync(join(work, 'tree')));
  const staged = new Map(); // rel -> sha256 of the staged bytes
  for (const [rel, id] of tree) {
    const bytes = readFileSync(live(stage, rel));
    core.checkStagedBlob(rel, id, io.blobId(bytes));
    staged.set(rel, io.sha256(bytes));
  }

  const recordFile = join(home, '.pact-install.json');
  const recordBytes = io.readOptional(recordFile);
  const record = core.parseRecord(recordBytes === null ? null : recordBytes.toString('utf8'));
  if (project) {
    say(`Project install from commit ${commit} into the project folder ${core.formatPlain(opts.projectFolder)}`);
    say(`It reads the user configuration under ${home} and writes nothing there.`);
  } else {
    say(`Install from commit ${commit} into ${home}`);
    if (record) say(`Last install: ${core.formatPlain(record.commit)} with ${record.digest ? `configuration ${record.digest}` : 'no configuration'}`);
    else say('No manifest found: first-install mode. Live files are compared with the repo; only the retired agents (builder, spec-builder, security-builder) can be deleted.');
  }

  // The gate's fingerprints: every staged gate file, the install's own included (G11).
  const gateNow = new Map([...staged].filter(([rel]) => rel.startsWith('gate/')).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  gateLines = core.gateBlock(gateNow, record ? record.gate : [], run.selfDiffers);

  // The pinned check (P1). Node is this process: no lookup happens (P2).
  const pinFile = live(stage, 'gate/grimoire/check.mjs.pin');
  const pinned = live(stage, 'gate/grimoire/check.mjs');
  if (!io.exists(pinFile) || !io.exists(pinned)) core.stops.pinMissing();
  const pinCommit = core.parsePin(readFileSync(pinFile, 'utf8'), io.fileSha256(pinned));
  say(`Node: ${process.execPath} (${process.version})`);
  say(`Pinned check: grimoire ${pinCommit}, sha256 verified`);

  // A project install checks the project folder before anything reads from
  // it (J1): the project module's real path is parsed, never shown, and the
  // link test runs on the project's paths below it (J2, S7).
  let pc = null;
  const projectLinks = () => core.checkProjectLinks(core.PROJECT_ATTR_RELS.find(rel => io.throughLink(pc.root, rel)) ?? null);
  if (project) {
    const projectCheck = await loadCore('project-core.mjs');
    const report = projectCheck(['check', resolve(opts.projectFolder), home]);
    for (const l of core.showLines(core.outputLines(report.lines).filter(l => !l.startsWith('ROOT ')), 'project')) say(l);
    pc = core.parseProjectCheck(report, process.platform);
    projectLinks();
  }

  // The user configuration's link test, before the renderer reads it (R1, S7).
  if (io.throughLink(home, core.CONFIG_REL)) core.stops.configLink();
  if (io.throughLink(home, core.BLOCKS_REL)) core.stops.blocksLink();
  const blocks = live(home, core.BLOCKS_REL);
  if (io.liveState(blocks).exists) {
    let state;
    try {
      state = io.treeState(blocks);
    } catch {
      core.stops.blocksUnreadable();
    }
    if (state.split('\n').some(l => l.startsWith('link '))) core.stops.blocksHoldLink();
  }

  // The renderer, in-process, the stage hashed around it (R2 to R10).
  const render = await loadCore('render-core.mjs');
  if (!staged.has(core.RULES_REL)) core.stops.rulesMissing();
  const rulesStaged = live(stage, core.RULES_REL);
  const before = stateOf(stage);
  const renderOut = mkdtempSync(join(work, 'render-'));
  // A project install gives the stage its no-file render, against a new empty
  // folder in place of the Claude home folder; the user file is read later.
  const renderHome = project ? mkdtempSync(join(work, 'nohome-')) : home;
  const { lines: renderLines } = runCheck(render, [rulesStaged, renderOut, renderHome], 'render', 'the renderer');
  const parsed = core.parseRenderLines(renderLines, { project, hash: io.sha256 });
  if (stateOf(stage) !== before) core.stops.renderChangedStage();
  core.checkRenderOutput(io.folderEntries(renderOut), parsed.agentSets.keys());
  const rendered = readFileSync(join(renderOut, 'CLAUDE.md'));
  const rulesHash = io.sha256(rendered);
  const diffFile = join(renderOut, 'config.diff');
  core.checkRenderedHashes({ rules: rulesHash, diff: io.fileSha256(diffFile) }, parsed);
  for (const [name, set] of parsed.agentSets) {
    const rel = `claude/agents/${name}.md`;
    const out = join(renderOut, `agent-${name}.md`);
    const bytes = readFileSync(out);
    core.checkAgentFile(name, set, staged.has(rel) ? readFileSync(live(stage, rel)) : null, bytes, io.sha256(bytes));
    writeFileSync(live(stage, rel), bytes);
    staged.set(rel, set.sha256);
    unlinkSync(out);
  }
  writeFileSync(rulesStaged, rendered);
  staged.set(core.RULES_REL, rulesHash);
  unlinkSync(join(renderOut, 'CLAUDE.md'));

  // Seam A, in-process, on the staged and rendered copy (S-1 to S-3).
  const seamA = await loadCore('seam-a-core.mjs');
  const { lines: seamLines } = runCheck(seamA, [stage], 'seam-a', 'the check');
  const checked = core.matchCopySet(seamLines, core.expectedCopySet(staged.keys()), staged, commit);
  const overlayBytes = readFileSync(live(stage, core.OVERLAY_REL));
  const overlay = core.checkOverlay(seamLines, io.sha256(overlayBytes), staged.get(core.OVERLAY_REL), overlayBytes.toString('utf8'));
  const pactAsk = (overlay.get('permissions').get('ask') ?? []).map(String);
  say(`Check: passed on commit ${commit}`);
  say("Partly checked: the rendered CLAUDE.md's marked clauses are checked word for word, and its open text for form, imports, routing and the roster, not for meaning; line numbers in seam A's lines count the rendered file.");

  // A project install ends here, never reaching the home copy, delete,
  // settings merge or record. The renderer runs again in project mode, the
  // stage hashed around it, to give the project rules file (J3, J4).
  if (project) {
    projectLinks();
    const was = stateOf(stage);
    const projectOut = mkdtempSync(join(work, 'project-'));
    const { lines: prLines } = runCheck(render, ['project', projectOut, home, pc.root], 'render', 'the project render');
    const pr = core.parseProjectRenderLines(prLines, io.sha256);
    if (stateOf(stage) !== was) core.stops.renderChangedStage();
    const projectFile = join(projectOut, 'pact-project.md');
    const entries = io.folderEntries(projectOut);
    core.checkProjectOutput(entries, entries.length === 1 && entries[0].file ? io.fileSha256(projectFile) : null, pr.projectHash);
    for (const l of core.projectBlock(pc.state, pr)) say(l);
    if (run.dirty) say(`Working tree: DIRTY (${run.dirty} path(s)); the check ran on commit ${commit}, and uncommitted edits are not checked. --apply will refuse.`);
    else say('Working tree: clean');
    leftoverNote(tmpdir(), basename(work));
    for (const l of gateLines) say(l);
    // The hash binds the project rules file's bytes, not the configuration files behind them (#95).
    core.checkBinding(opts, pr.projectHash, commit);
    if (!opts.apply) {
      say("Dry run only. After the owner's go-ahead, run:");
      say(`  ${core.applyLine(opts.paths, commit, pr.projectHash, process.platform)}`);
      say('RESULT: pass');
      return;
    }
    core.checkApply({ configApplies: true, hashGiven: opts.renderedHash !== null, selfDiffers: run.selfDiffers, drift: false, dirty: run.dirty > 0, settingsObject: true });
    projectLinks();
    const projectWrite = await loadCore('project-core.mjs');
    say('CHECKS DONE');
    writing = 'project';
    say('Applying.');
    for (const l of gateLines) say(l);
    const report = projectWrite(['write', pc.root, home, projectFile, pr.projectHash]);
    for (const l of core.showLines(core.outputLines(report.lines), 'project')) say(l);
    const recordHash = core.parseProjectWrite(report, pr.projectHash);
    // Verify: each written file plain, then its hash; then the link test again.
    let bad = 0;
    for (const [rel, sha] of [[core.PROJECT_RULES_REL, pr.projectHash], [core.PROJECT_RECORD_REL, recordHash]]) {
      const ok = !io.throughLink(pc.root, rel) && io.liveState(live(pc.root, rel)).sha256 === sha;
      say(`${ok ? 'OK      ' : 'MISMATCH'} ${rel}`);
      if (!ok) bad++;
    }
    if (core.PROJECT_ATTR_RELS.some(rel => io.throughLink(pc.root, rel))) {
      say('MISMATCH a project path is now a link or other reparse point');
      bad++;
    }
    if (bad) {
      say(`${bad} mismatch(es).`);
      process.exitCode = 1;
      return;
    }
    say(`Installed commit ${commit} with configuration ${pr.digest} into the project folder; all files verified.`);
    say('RESULT: pass');
    return;
  }

  // The plan (L1 to L3).
  const linkIn = rel => io.throughLink(home, rel);
  const { repoFiles, sourceOf } = core.installDestinations(checked, linkIn);
  const p = core.plan(record, repoFiles, rel => io.liveState(live(home, rel)), linkIn);

  // Settings (L4 to L9).
  const settingsFile = join(home, 'settings.json');
  const liveBytes = io.readOptional(settingsFile);
  const liveSettings = liveBytes === null ? new Map() : core.readSettings(liveBytes.toString('utf8'));
  let merged = null;
  let settings;
  let changes = [];
  let notes = [];
  if (liveSettings === null) {
    settings = 'not a strict JSON object: left untouched';
    notes = ['WARN: settings.json is not a strict JSON object (a comment, a trailing comma or another root); the merge leaves it untouched, and nothing in it was checked.'];
  } else {
    merged = core.mergeSettings(liveSettings, overlay);
    if (liveBytes === null) settings = 'would be created from the overlay';
    else {
      settings = core.canonical(liveSettings) === core.canonical(merged) ? 'unchanged' : 'would be merged';
      notes = core.liveSettingsLines(liveSettings, overlay, pactAsk);
    }
    changes = core.settingsChanges(liveSettings, overlay);
  }
  const settingsWill = settings.startsWith('would');
  const lastConfig = record ? record.config : new Map();
  const stale = (record && record.commit.toLowerCase() !== commit) || gateLines[0] !== 'Gate: unchanged since the last install' || core.configStale(core.configNow(parsed), lastConfig);
  const nothing = !(p.overwrite.length || p.add.length || p.delete.length || settingsWill || stale || !record);

  for (const [title, items] of [['Drift', p.drift], ['Overwrite', p.overwrite], ['Add', p.add], ['Delete', p.delete]]) {
    say(`${title}: ${items.length}`);
    for (const i of items) say(`  ${core.formatPlain(i)}`);
  }
  for (const w of p.warnings) say(`WARN: ${core.formatPlain(w)}`);
  say(`Unchanged: ${p.same}`);
  say(`settings.json: ${settings}`);
  if (settingsWill) for (const l of changes) say(l);
  for (const l of notes) say(l);
  for (const [rel, file] of [['settings.json', settingsFile], ['.pact-install.json', recordFile]]) {
    if (io.openToOthers(file)) say(`WARN: ${rel} can be read by other accounts on this machine; an older install may have widened it. The install keeps a file's mode, so restrict it to yourself (chmod 600).`);
  }
  say('Configuration:');
  for (const l of core.configBlock(parsed, rulesHash, record)) say(l);
  if (run.dirty) say(`Working tree: DIRTY (${run.dirty} path(s)); the check ran on commit ${commit}, and uncommitted edits are not checked. --apply will refuse.`);
  else say('Working tree: clean');
  if (nothing) say('Nothing to do.');
  leftoverNote(tmpdir(), basename(work));
  // The gate block comes last, after the checks' own output, so nothing they print can stand in for it.
  for (const l of gateLines) say(l);

  core.checkBinding(opts, rulesHash, commit);
  const configApplies = parsed.config.kind !== 'none';

  // The review output, once every check for this run has passed (V1, X3).
  const writeReview = async () => {
    if (opts.reviewFolder === null) return;
    const review = await loadCore('review-core.mjs');
    if (io.fileSha256(rulesStaged) !== rulesHash) core.stops.reviewRulesChanged();
    const was = stateOf(stage);
    const report = review([resolve(opts.reviewFolder), home, rulesStaged, diffFile]);
    for (const l of core.showLines(core.outputLines(report.lines), 'review')) say(l);
    let now = null;
    try {
      now = io.treeState(stage);
    } catch {}
    if (now !== was) core.stops.reviewChangedStage();
    core.checkReviewLines(report, rulesHash, parsed.diffHash);
    say('Review output: rendered-rules.txt and config.diff written to the review folder.');
  };

  if (!opts.apply) {
    await writeReview();
    say("Dry run only. After the owner's go-ahead, run:");
    say(`  ${core.applyLine(opts.paths, commit, configApplies ? rulesHash : null, process.platform)}`);
    say('RESULT: pass');
    return;
  }
  core.checkApply({ configApplies, hashGiven: opts.renderedHash !== null, selfDiffers: run.selfDiffers, drift: p.drift.length > 0, dirty: run.dirty > 0, settingsObject: liveSettings !== null });

  // Apply (X2 to X5): every staged byte re-hashed, the review last, then the writes.
  for (const [rel, sha] of repoFiles) if (io.fileSha256(live(stage, sourceOf.get(rel))) !== sha) core.stops.stageChanged(rel);
  // A temp file a hard stop left would stop the writes midway, so refuse before any (X5).
  for (const rel of [...p.overwrite, ...p.add]) if (io.exists(io.tempName(live(home, rel)))) core.stops.tempLeft(rel);
  for (const [rel, file] of [['settings.json', settingsFile], ['.pact-install.json', recordFile]]) if (io.exists(io.tempName(file))) core.stops.tempLeft(rel);
  await writeReview();
  say('CHECKS DONE');
  writing = true;
  say('Applying.');
  for (const l of gateLines) say(l);
  mkdirSync(home, { recursive: true });
  for (const rel of p.delete) {
    io.removeFile(live(home, rel));
    say(`deleted ${rel}`);
  }
  for (const rel of [...p.overwrite, ...p.add]) {
    io.writeReplacing(live(home, rel), readFileSync(live(stage, sourceOf.get(rel))));
    say(`installed ${rel}`);
  }
  if (settingsWill) {
    io.writeReplacing(settingsFile, core.settingsText(merged), 0o600);
    say('merged settings.json');
  }
  io.writeReplacing(recordFile, core.recordText({ commit, digest: parsed.digest, userHash: parsed.config.kind === 'user' ? parsed.config.sha256 : null, blockHashes: parsed.blockHashes, repoFiles, gateNow }), 0o600);

  // Verify: live against the checked bytes, and the guard in the settings Claude Code reads (X7).
  let bad = 0;
  for (const [rel, sha] of repoFiles) {
    if (io.liveState(live(home, rel)).sha256 === sha) say(`OK       ${rel}`);
    else {
      say(`MISMATCH ${rel}`);
      bad++;
    }
  }
  for (const rel of p.delete) {
    if (io.liveState(live(home, rel)).exists) {
      say(`MISMATCH ${rel} (should be deleted)`);
      bad++;
    }
  }
  const after = io.readOptional(settingsFile);
  if (core.guardHolds(after === null ? null : core.readSettings(after.toString('utf8')), pactAsk)) say("OK       settings.json (the pact's ask rules and auto mode)");
  else {
    say("MISMATCH settings.json (the pact's ask rules or auto mode are missing)");
    bad++;
  }
  if (bad) {
    say(`${bad} mismatch(es).`);
    process.exitCode = 1;
    return;
  }
  say(`Installed commit ${commit} with ${parsed.digest ? `configuration ${parsed.digest}` : 'no configuration'}; all files verified.`);
  say('RESULT: pass');
}

try {
  await main();
} catch (e) {
  for (const l of gateLines) say(l);
  const left = writing === 'project' ? core.PROJECT_LEFT : 'The Claude home folder may hold part of this install.';
  if (e instanceof core.Refusal) say(`REFUSED: ${e.why} ${writing ? left : e.outcome}`);
  else say(`REFUSED: the install failed while it ran. ${writing ? left : 'Nothing was changed.'}`);
  say('RESULT: refused');
  process.exitCode = 1;
}
