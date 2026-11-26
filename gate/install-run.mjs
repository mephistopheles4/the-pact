// The install runner (#153, S3). The bootstrap (gate/install.mjs) starts it
// from the stage it made of HEAD's files, so every line here is committed
// code. It does everything after staging: pin,
// render, seam A, the copy set, the plan, settings, review output, apply,
// record and verify. The four gate checks run in-process, through each core's
// check(), with ADR 0032's controls kept (S5): each verdict needs both parts, only the checks' own cleaned lines
// are shown, and the bootstrap's clock stops the whole run until CHECKS DONE.
// Every decision is a function in install-core.mjs; every read and write is
// in install-io.mjs. No error's own text is ever printed.
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as core from './install-core.mjs';
import * as harness from './harnesses.mjs';
import { renderHarnesses } from './harness-render.mjs';
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
// #272: set when the backup step is about to create something, so a run that ends before CHECKS DONE names the staging folder; then the backup's name.
let backupStarted = false;
let backup = null;

/** A gate module's core, loaded from the stage; a missing or broken one refuses. */
async function loadCore(file) {
  try {
    return (await import(`./${file}`)).check;
  } catch {
    return core.stops.moduleMissing(`gate/${file}`);
  }
}

/**
 * The harnesses this install takes (spec 0007 S5): the commit's known ones and
 * the user configuration's own.
 */
function chooseHarnesses({ stage, staged, home, parsed, record }) {
  if (!staged.has(harness.KNOWN_REL)) core.stops.harnessKnownMissing();
  const known = harness.parseKnown(readFileSync(live(stage, harness.KNOWN_REL), 'utf8'));
  let text = null;
  if (parsed.config.kind === 'user') {
    const bytes = io.readOptional(live(home, core.CONFIG_REL));
    text = bytes === null ? null : bytes.toString('utf8');
  }
  const { install, own } = harness.configHarnesses(text);
  const harnesses = harness.resolveHarnesses({ known, own, home, platform: process.platform, inWorkTree: io.insideWorkTree });
  const detected = new Set(harnesses.filter(h => io.isFolder(live(home, h.detect))).map(h => h.id));
  return harness.chooseHarnesses({ harnesses, install, detected, recorded: [...new Set(record ? record.harnesses.map(h => h.id) : [])] });
}

/** The dry run's harness list: each one in or out, then what the install does not do for it. */
function harnessLines({ rows, warnings }) {
  const out = [rows.length ? 'Harnesses:' : 'Harnesses: none found, so nothing installs'];
  for (const r of rows) out.push(`  ${r.id}${r.harness ? ` (${r.harness.name})` : ''}: ${r.in ? 'in' : 'out'}${r.detected ? '' : ', not found'}`);
  for (const w of warnings) out.push(`WARN: ${core.formatPlain(w)}`);
  for (const r of rows) {
    const h = r.harness;
    if (h?.own && h.hooks) out.push(`guards unverified for ${h.id}: the pact has not seen this harness run its hook`);
    if (!r.in) continue;
    const parts = core.builtParts(h);
    if (h.agents && !parts.agents) out.push(`WARN: ${h.id}: the pact does not build ${h.name}'s agent format yet; no agent is installed into it.`);
    if (h.hooks && !parts.settings && !parts.guard) out.push(`WARN: ${h.id}: the pact writes no hook into its hooks file yet.`);
  }
  return out;
}

/** The staged payload files directly in `dir` with `ext`, as name -> text. */
function stagedTexts(stage, staged, dir, ext) {
  const names = [...staged.keys()].flatMap(rel => (rel.startsWith(dir) && rel.endsWith(ext) && !rel.slice(dir.length).includes('/') ? [rel.slice(dir.length, -ext.length)] : [])).sort();
  return new Map(names.map(n => [n, readFileSync(live(stage, `${dir}${n}${ext}`), 'utf8')]));
}

/**
 * Each taken harness's render (spec 0007 S7), written into the stage under
 * rendered/ and hashed as staged, from the configured rules and agents and the
 * commit's commands. Returns its warnings and each harness's rules hash.
 */
function writeRenders({ stage, staged, taken }) {
  if (!taken.length) return { warnings: [], rules: [] };
  const { files, warnings } = renderHarnesses({
    rules: readFileSync(live(stage, core.RULES_REL), 'utf8'),
    agents: stagedTexts(stage, staged, 'claude/agents/', '.md'),
    commands: stagedTexts(stage, staged, 'claude/commands/', '.md'),
    harnesses: taken,
  });
  for (const [rel, text] of files) {
    const bytes = Buffer.from(text, 'utf8');
    mkdirSync(dirname(live(stage, rel)), { recursive: true });
    writeFileSync(live(stage, rel), bytes, { flag: 'wx' });
    staged.set(rel, io.sha256(bytes));
  }
  return { warnings, rules: taken.map(h => ({ id: h.id, sha256: staged.get(`${core.RENDERED_REL}${h.id}/rules.md`) })) };
}

/** Runs a core in-process: its cleaned lines shown (ROOT lines never), its verdict needing both parts. */
function runCheck(check, argv, prefix, what) {
  const report = check(argv);
  const lines = core.outputLines(report.lines);
  for (const l of core.showLines(lines.filter(l => !l.startsWith('ROOT ')), prefix)) say(l);
  return { report, lines: core.checkVerdict(report, what) };
}

async function main() {
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
  const home = resolve(opts.home ?? homedir());
  const project = opts.projectFolder !== null;
  // A release runs from the bootstrap's clone, which the apply line names by its full path (spec 0007 S10).
  const releaseFrom = () => (opts.release === null ? null : { release: opts.release, script: join(home, core.NEUTRAL_REL, 'source', commit, 'gate', 'install.mjs') });
  // A home the caller names must be outside any repository (spec 0007 S4, C30).
  if (opts.home !== null && io.insideWorkTree(home)) core.stops.homeWorkTree();

  // The stage against the commit's tree, from committed code (G7, G9).
  const tree = core.parseTree(readFileSync(join(work, 'tree')));
  const staged = new Map(); // rel -> sha256 of the staged bytes
  for (const [rel, id] of tree) {
    const bytes = readFileSync(live(stage, rel));
    core.checkStagedBlob(rel, id, io.blobId(bytes));
    staged.set(rel, io.sha256(bytes));
  }
  // The commit's history, which the bootstrap listed, for the behind line (#407).
  const reachableBytes = io.readOptional(join(work, 'reachable'));
  if (reachableBytes === null) core.stops.reachableMissing();
  const reachable = core.parseReachable(reachableBytes, commit);

  if (io.throughHomeLink(home, core.RECORD_REL)) core.stops.configLink();
  const recordFile = live(home, core.RECORD_REL);
  const recordBytes = io.readOptional(recordFile);
  const record = core.parseRecord(recordBytes === null ? null : recordBytes.toString('utf8'));
  if (project) {
    say(`Project install from commit ${commit} into the project folder ${core.formatPlain(opts.projectFolder)}`);
    say(`It reads the user configuration under ${home} and writes nothing there.`);
  } else {
    say(`Install from commit ${commit} into ${home}`);
    // A record with a digest and no configuration file of the person's is an install of the pact's default (#183 T4a).
    if (record) say(`Last install: ${core.formatPlain(record.commit)} with ${record.digest ? `${record.config.size ? '' : "the pact's default "}configuration ${record.digest}` : 'no configuration'}`);
    else say('No manifest found: first-install mode. Live files are compared with the repo; only the retired agents (builder, spec-builder, security-builder) can be deleted.');
  }

  // The gate's fingerprints: every staged gate file, the install's own included (G11).
  const gateNow = new Map([...staged].filter(([rel]) => rel.startsWith('gate/')).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  gateLines = core.gateBlock(gateNow, record ? record.gate : []);

  // Node is this process: no lookup happens (P2).
  say(`Node: ${process.execPath} (${process.version})`);

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
  // The builder kit's rules source (#203 S6): the unrendered rules, copied in the stage before the render, bound to the commit's hash.
  if (staged.has(core.KIT_RULES_REL)) core.stops.rulesSourceInTree();
  copyFileSync(rulesStaged, live(stage, core.KIT_RULES_REL));
  staged.set(core.KIT_RULES_REL, staged.get(core.RULES_REL));
  const renderOut = mkdtempSync(join(work, 'render-'));
  // A project install gives the stage its no-file render, against a new empty
  // folder in place of the home folder; the user file is read later.
  const renderHome = project ? mkdtempSync(join(work, 'nohome-')) : home;
  // A home install with no user file renders the pact's default from the stage (#183 T4a); a project install never does.
  const { lines: renderLines } = runCheck(render, [rulesStaged, renderOut, renderHome, ...(project ? [] : [live(stage, core.DEFAULT_CONFIG_DIR)])], 'render', 'the renderer');
  const parsed = core.parseRenderLines(renderLines, { project, hash: io.sha256 });
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
  // The harnesses: a project install takes none.
  const choice = project ? { rows: [], warnings: [] } : chooseHarnesses({ stage, staged, home, parsed, record });
  const taken = choice.rows.filter(r => r.in).map(r => r.harness);
  const renders = writeRenders({ stage, staged, taken });
  // One hash over every harness's rules binds the apply (spec 0007 S9); the review folder gets Claude Code's, or the first harness's.
  const boundHash = core.boundHash(renders.rules, rulesHash, io.sha256);
  const reviewed = renders.rules.find(r => r.id === 'claude') ?? renders.rules[0] ?? null;
  const reviewFile = reviewed ? live(stage, `${core.RENDERED_REL}${reviewed.id}/rules.md`) : rulesStaged;
  const reviewHash = reviewed ? reviewed.sha256 : rulesHash;
  // The settings merge and the hook are Claude Code's: only with it in.
  const claude = taken.find(h => core.builtParts(h).settings) ?? null;
  // The commands that install: the renderer's COMMANDS line, and /scriptorium whenever it is in the commit (#262).
  // They reach seam A as its --commands (#203, S8); each side works out the copy set on its own.
  const on = project ? [] : core.commandsOn(parsed.commands, staged.keys());
  core.checkKit(on, staged.keys());
  // The tools that install: the renderer's TOOLS line alone, off by default (#280). They reach seam A as its --tools.
  const toolsOn = project ? [] : parsed.tools;
  // The auto-compact window (#482): the renderer's VALUE line, else the default; 0 is off, and a project install is always off. It reaches seam A as --compact.
  const window = claude ? core.compactWindow(parsed) : 0;
  // The guard (spec 0007 S8): its command rules follow the switches, whichever harnesses are in. Its files and hooks
  // install while a harness with a guard hook is in and a rule is on.
  const switches = project ? [] : [...(toolsOn.includes('cleaner') ? ['cleaner'] : []), ...(core.stopSwitchOn(parsed) ? ['session-stop-deny'] : [])];
  const rules = core.guardRules(switches);
  const wired = switches.length ? taken.filter(h => core.builtParts(h).guard) : [];
  const guardOn = wired.length > 0;
  if (guardOn) core.checkGuardHome({ platform: process.platform, windowsHome: io.present(join(home, 'AppData')) });
  const { lines: seamLines } = runCheck(seamA, [stage, '--commands', on.length ? on.join(',') : 'none', '--tools', toolsOn.length ? toolsOn.join(',') : 'none', '--compact', window > 0 ? 'on' : 'off', '--harness', core.harnessArg(taken, guardOn)], 'seam-a', 'the check');
  const checked = core.matchCopySet(seamLines, core.expectedCopySet(staged.keys(), on, toolsOn, window > 0, taken, guardOn), staged, commit);
  const overlayBytes = readFileSync(live(stage, core.OVERLAY_REL));
  const checkedOverlay = core.checkOverlay(seamLines, io.sha256(overlayBytes), staged.get(core.OVERLAY_REL), overlayBytes.toString('utf8'));
  // After the hash check, and only then: the hook script's path and the window replace the overlay's two tokens.
  const hookScript = join(home, ...core.HOOK_SCRIPT_REL.split('/'));
  const overlay = window > 0 ? core.fillHooks(checkedOverlay, home, hookScript, window, process.platform) : checkedOverlay;
  say(`Check: passed on commit ${commit}`);
  say("Not checked: what the pact's files say. The gate checks install mechanics only; vet the pact as you would any skill.");
  // Before every other warning (#262, S8). A project install never edits a part.
  const securityLine = project ? null : core.securityDefaultsLine(parsed, record);
  if (securityLine) say(securityLine);
  const enoughNote = project ? null : core.enoughNoteLine(parsed, rendered.toString('utf8'));
  if (enoughNote) say(enoughNote);
  const behind = project ? null : core.behindLine(record ? record.commit : null, commit, reachable, opts.release, record ? record.release : null);
  if (behind) say(behind);

  // A project install ends here, never reaching the home copy, delete,
  // settings merge or record. The renderer runs again in project mode, the
  // stage hashed around it, to give the project rules file (J3, J4).
  if (project) {
    const projectOut = mkdtempSync(join(work, 'project-'));
    const { lines: prLines } = runCheck(render, ['project', projectOut, home, pc.root], 'render', 'the project render');
    const pr = core.parseProjectRenderLines(prLines, io.sha256);
    const projectFile = join(projectOut, 'pact-project.md');
    const entries = io.folderEntries(projectOut);
    core.checkProjectOutput(entries, entries.length === 1 && entries[0].file ? io.fileSha256(projectFile) : null, pr.projectHash);
    // A project's own qualities list and Cost limits lead the warnings, then the note line (#262 S25, #278).
    const projectSecurity = core.projectSecurityLine(pr);
    if (projectSecurity) say(projectSecurity);
    const projectNote = core.projectNoteLine(pr);
    if (projectNote) say(projectNote);
    for (const l of core.projectBlock(pc.state, pr)) say(l);
    if (run.dirty) say(`Working tree: DIRTY (${run.dirty} path(s)); the check ran on commit ${commit}, and uncommitted edits are not checked. --apply will refuse.`);
    else say('Working tree: clean');
    leftoverNote(tmpdir(), basename(work));
    for (const l of gateLines) say(l);
    // The hash binds the project rules file's bytes, not the configuration files behind them (#95).
    core.checkBinding(opts, pr.projectHash, commit);
    if (!opts.apply) {
      say("Dry run only. After the owner's go-ahead, run:");
      say(`  ${core.applyLine(opts.paths, commit, pr.projectHash, process.platform, releaseFrom())}`);
      say('RESULT: pass');
      return;
    }
    core.checkApply({ configApplies: true, hashGiven: opts.renderedHash !== null, drift: false, dirty: run.dirty > 0, settingsObject: true });
    const projectWrite = await loadCore('project-core.mjs');
    say('CHECKS DONE');
    writing = 'project';
    say('Applying.');
    for (const l of gateLines) say(l);
    const report = projectWrite(['write', pc.root, home, projectFile, pr.projectHash]);
    for (const l of core.showLines(core.outputLines(report.lines), 'project')) say(l);
    const recordHash = core.parseProjectWrite(report, pr.projectHash);
    // Verify: each written file's hash.
    let bad = 0;
    for (const [rel, sha] of [[core.PROJECT_RULES_REL, pr.projectHash], [core.PROJECT_RECORD_REL, recordHash]]) {
      const ok = io.liveState(live(pc.root, rel)).sha256 === sha;
      say(`${ok ? 'OK      ' : 'MISMATCH'} ${rel}`);
      if (!ok) bad++;
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

  // The plan (L1 to L3). Each live state it reads is kept, so the backup compares its copies with what the plan saw (#272, S7).
  const recorded = record ? record.harnesses : [];
  const targets = [...taken.map(core.targetsOf), ...recorded];
  const guardRecorded = (record ? record.entries : []).filter(e => core.guardFormatOf(e) !== null);
  const claudeRecorded = (record ? record.entries : []).filter(e => core.guardFormatOf(e) === null);
  const mergedFiles = [...choice.rows.flatMap(r => (r.harness?.hooks ? [r.harness.hooks.file] : [])), ...recorded.flatMap(h => (h.settings ? [h.settings] : [])), ...guardRecorded.map(e => e.path), core.CODEX_CONFIG_REL];
  const linkIn = rel => io.throughHomeLink(home, rel);
  const destinations = core.resolveDestinations(checked, taken);
  // rules.json, and on Windows each wrapper's launcher, are the install's own, made here after seam A, which refuses a commit that holds one.
  if (guardOn) {
    const make = (rel, dest, text) => {
      const bytes = Buffer.from(text, 'utf8');
      mkdirSync(dirname(live(stage, rel)), { recursive: true });
      writeFileSync(live(stage, rel), bytes);
      destinations.push([rel, { dest, sha256: io.sha256(bytes), harness: core.PACT_ID }]);
    };
    make(core.GUARD_TABLE_REL, core.GUARD_TABLE_DEST, core.guardTableText(rules));
    if (process.platform === 'win32') for (const format of new Set(wired.map(h => h.hooks.format))) make(core.guardLauncherRel(format), core.guardLauncherDest(format), core.guardLauncherText(format));
  }
  // The skill folders (spec 0007 S7): a link each, or the files copied where no link can be made.
  const wanted = core.skillsWanted(taken, on);
  const linkable = !wanted.length || io.canLink(work);
  const links = core.linkPlan({ wanted, record, targets, state: (rel, target) => io.linkState(live(home, rel), live(home, target)), canLink: linkable, throughLink: linkIn, merged: mergedFiles });
  const neutral = destinations.filter(([, d]) => d.harness === core.PACT_ID);
  destinations.push(...core.copyDestinations(links.copy, neutral));
  const { repoFiles, sourceOf, harnessOf } = core.installDestinations(destinations, linkIn, mergedFiles);
  const seen = new Map();
  const liveAt = rel => {
    if (!seen.has(rel)) seen.set(rel, io.liveState(live(home, rel)));
    return seen.get(rel);
  };
  const p = core.plan(record, repoFiles, liveAt, linkIn, targets, mergedFiles);
  // #262: the person's agents are not the pact's to write, check or record.
  for (const rel of p.yours) repoFiles.delete(rel);
  // The harness each path belongs to: this run's copy set, else the record's, else Claude Code's retired agents.
  const recordHarness = new Map(record ? record.files.map(e => [e.path, e.harness]) : []);
  const owner = rel => harnessOf.get(rel) ?? recordHarness.get(rel) ?? 'claude';
  // A pact command never shadowed by a same-named skill, nor a command or tool laid over a file the pact didn't write (#203, S8; #280).
  if (taken.some(h => h.id === 'claude' && core.builtParts(h).commands)) core.checkSkillClash(on, rel => io.present(live(home, rel)));
  core.checkNewPaths(repoFiles, record, liveAt, taken.flatMap(h => (core.builtParts(h).commands ? [h.commands.dir] : [])));
  const unrecorded = core.unrecordedRules(taken.flatMap(h => (core.builtParts(h).rules ? [h.rules.path] : [])), record, liveAt);

  // Settings (L4 to L9). With Claude Code taken out, the entries the record
  // lists are removed by the same merge, over an empty overlay.
  const claudeFile = choice.rows.find(r => r.id === 'claude')?.harness?.hooks?.file ?? null;
  const removing = !claude && claudeRecorded.length > 0 && claudeFile !== null;
  const settingsRel = claude ? claude.hooks.file : removing ? claudeFile : null;
  const settingsFile = settingsRel === null ? null : live(home, settingsRel);
  const liveBytes = settingsFile === null ? null : io.readOptional(settingsFile);
  const liveSettings = liveBytes === null ? new Map() : core.readSettings(liveBytes.toString('utf8'));
  let merged = null;
  let plain = { record: [], drop: [] };
  // #438: the cleaner's deny rules come and go with it; settings left untouched keep the record's list.
  // #439: the stop switch's rules likewise; a project install never turns the switch on.
  const stopOn = claude ? core.stopSwitchOn(parsed) : false;
  // #603: the identity switch. On, the claude app must be pinned and its gitconfig must be exactly what setup writes, or the install refuses before any write; off, the check is skipped, so a changed or missing gitconfig never blocks turning it off.
  const identityOn = claude ? core.identitySwitchOn(parsed) : false;
  const refusal = (rule, why) => new core.Refusal(rule, why);
  const identityChecks = () => {
    const pinText = io.readOptional(live(home, '.pact/github.json'));
    const app = pinText === null ? null : core.identityPinApp(pinText.toString('utf8'));
    if (app === null) throw refusal('identity-pin', 'the agent-identity switch is on, but .pact/github.json holds no claude app; run gh-app.mjs setup first.');
    const cfg = io.readOptional(live(home, '.pact/gh-app-claude.gitconfig'));
    if (cfg === null) throw refusal('identity-gitconfig-missing', 'the agent-identity switch is on, but the claude app\'s gitconfig is missing; run gh-app.mjs setup first.');
    if (!core.identityNodeOk(process.execPath)) throw refusal('identity-node', 'this Node is not one the agent gitconfig may name (an absolute path to a program called node), so the gitconfig cannot be checked; run the install with a Node that is, then run gh-app.mjs setup under it.');
    const want = core.identityGitconfigText({ userHome: home, nodePath: process.execPath, app, xdg: io.exists(join(home, '.config', 'git', 'config')) });
    const verdict = core.identityGitconfigVerdict(cfg.toString('utf8'), want);
    const line = core.identityGitconfigLine(verdict);
    if (!verdict.ok) throw refusal('identity-gitconfig', line);
    return ['agent-identity: on', `  ${line}`];
  };
  let identity = { set: new Map(), drop: [], record: record ? record.identityEnv : {}, conflicts: [] };
  let identityBlock = [];
  let deny = { add: [], drop: [], record: record ? record.cleanerDeny : [] };
  let stopRecord = record ? record.stopDeny : [];
  // #523: the cleaner's ask rules, with the cleaner's switch.
  let askPlan = { add: [], drop: [], record: record ? record.cleanerAsk : [] };
  let settings;
  let changes = [];
  let notes = [];
  // #482: the hooks and the window, merged by key.
  const compact = { window, script: hookScript, recorded: record ? record.autoCompactWindow : null, platform: process.platform };
  let compactBlock = claude ? [`auto-compact-window: ${window > 0 ? `on, ${window} tokens` : 'off'}`] : [];
  const mergeTools = claude ? toolsOn : [];
  if (identityOn) identityBlock = identityChecks();
  if (settingsRel === null) settings = null;
  else if (liveSettings === null) {
    settings = 'not a strict JSON object: left untouched';
    notes = ['WARN: settings.json is not a strict JSON object (a comment, a trailing comma or another root); the merge leaves it untouched, and nothing in it was checked.'];
    if (identityOn) notes.push("WARN: settings.json is left untouched, so the agent-identity switch's two env keys are not set; git in a session stays your own until they are.");
    // #523: the cleaner on, its ask rules are not added to a file left untouched; say which.
    if (mergeTools.includes('cleaner')) notes.push(`WARN: settings.json is left untouched, so the cleaner's two ask rules on remove --override are not added: ${core.CLEANER_ASK.map(core.formatPlain).join(', ')}`);
  } else {
    const cleanerPlan = core.cleanerDenyPlan(liveSettings, mergeTools, record ? record.cleanerDeny : []);
    const stopPlan = core.stopDenyPlan(liveSettings, stopOn, record ? record.stopDeny : []);
    // The record lists every added deny rule once, so cleanerDeny and stopDeny hold the same list and each plan filters it by its own rules.
    // Here deny.record is the cleaner's own; the stop switch's is kept in stopRecord.
    deny = { ...core.joinDeny(cleanerPlan, stopPlan), record: cleanerPlan.record };
    stopRecord = stopPlan.record;
    askPlan = core.cleanerAskPlan(liveSettings, mergeTools, record ? record.cleanerAsk : []);
    identity = core.identityEnvPlan(liveSettings, identityOn, record ? record.identityEnv : {}, core.identityEnvWanted(home));
    if (identity.conflicts.length) throw refusal('identity-env', `the agent-identity switch is on, but settings.json already sets env ${identity.conflicts.join(' and ')}; take it out first, since the install never overwrites your own env.`);
    const applied = claude ? overlay : new Map();
    plain = core.overlayKeysPlan(liveSettings, applied, record ? record.entries.filter(e => e.path === settingsRel) : []);
    merged = core.mergeSettings(liveSettings, applied, deny, compact, askPlan, identity, plain.drop);
    if (liveBytes === null) settings = claude ? 'would be created from the overlay' : 'unchanged';
    else {
      settings = core.canonical(liveSettings) === core.canonical(merged) ? 'unchanged' : 'would be merged';
      if (claude) notes = core.liveSettingsLines(liveSettings, overlay, compact);
    }
    changes = [...core.settingsChanges(liveSettings, applied, deny, askPlan, identity), ...plain.drop.map(k => `  - ${k}`)];
    compactBlock = core.compactLines(liveSettings, applied, compact);
  }
  const settingsWill = settings !== null && settings.startsWith('would');
  // The overlay's two plain keys are never drift: each apply sets them again, with a warning, and the record holds them for take-out.
  // The entries the record keeps next: those the merged settings hold, or, for a file left untouched, the last ones.
  const lastEntries = claudeRecorded.filter(e => e.path === settingsRel);
  const entries = settingsRel === null || liveSettings === null
    ? claudeRecorded
    : claude ? core.settingsEntries({ harness: claude.id, path: settingsRel, merged, deny: [...deny.record, ...stopRecord], ask: askPlan.record, identityEnv: identity.record, window, hooks: overlay.get('hooks'), hash: io.sha256, overlayKeys: plain.record }) : [];
  const settingsDrift = liveSettings === null ? [] : core.entryDrift(lastEntries.filter(e => !core.OVERLAY_KEYS.includes(e.key)), liveSettings);
  // The guard's hook, one keyed merge per hooks file (spec 0007 S8).
  const hooks = core.guardPlans(guardRecorded, wired.map(h => ({ harness: h.id, path: h.hooks.file, format: h.hooks.format, command: core.guardCommand({ script: join(home, ...core.guardScriptRel(h.hooks.format).split('/')), platform: process.platform, systemRoot: process.env.SystemRoot }) })));
  for (const f of hooks) {
    const why = f.path.toLowerCase() === settingsRel?.toLowerCase() ? 'the path of settings.json' : core.guardPathReason(f.path, linkIn);
    if (why) core.stops.hooksPath(f.path, why);
    f.file = live(home, f.path);
    const state = io.liveState(f.file);
    if (state.exists && !state.file) core.stops.hooksNotObject(f.path);
    f.bytes = state.exists ? io.readOptional(f.file) : null;
    const current = f.bytes === null ? new Map() : core.readSettings(f.bytes.toString('utf8'));
    if (current === null) core.stops.hooksNotObject(f.path);
    Object.assign(f, core.guardMerge(current, f));
    f.drifted = core.guardDrift(f, current);
    f.entries = core.guardEntries(f, io.sha256);
    // The trust step goes to each harness whose entry is new or changed.
    f.trust = f.added.includes('codex');
  }
  core.checkLinks(links);
  const hooksWill = hooks.filter(f => f.changed);
  // A one-time cleanup: an older install's record marks the shell policy line it wrote into Codex's config.toml, which is the owner's now.
  const policyMarked = record?.shellPolicy === true;
  const policyFile = live(home, core.CODEX_CONFIG_REL);
  const policyBytes = policyMarked && !linkIn(core.CODEX_CONFIG_REL) && io.liveState(policyFile).file ? io.readOptional(policyFile) : null;
  const policyNext = policyBytes === null ? undefined : core.withoutShellPolicy(policyBytes);
  const policyWill = policyNext !== undefined;
  const drift = [...p.drift, ...links.drift.map(d => d.line), ...settingsDrift, ...hooks.flatMap(f => f.drifted.map(d => d.line))];
  const lastConfig = record ? record.config : new Map();
  const targetsText = list => JSON.stringify(list);
  const stale = (record && (record.commit.toLowerCase() !== commit || record.release !== opts.release)) || gateLines[0] !== 'Gate: unchanged since the last install' || core.configStale(core.configNow(parsed), lastConfig) || targetsText(taken.map(core.targetsOf)) !== targetsText(recorded);
  // An agent the record lists that is now yours needs the record rewritten without it.
  const yoursListed = record ? p.yours.some(rel => record.files.some(e => e.path === rel)) : false;
  const linksWill = links.add.length || links.remove.length || (record && record.links.length !== links.keep.length);
  const nothing = !(p.overwrite.length || p.add.length || p.delete.length || linksWill || settingsWill || hooksWill.length || policyWill || policyMarked || stale || yoursListed || !record);

  // One block per harness, the pact's own files first (spec 0007 S9).
  for (const l of harnessLines(choice)) say(l);
  for (const w of renders.warnings) say(`WARN: ${core.formatPlain(w)}`);
  if (!linkable && links.copy.length) say(core.NO_LINK_LINE);
  for (const w of links.warnings) say(`WARN: ${core.formatPlain(w)}`);
  const changed = new Set([...p.overwrite, ...p.add]);
  const ids = [...new Set([...(repoFiles.size || record ? ['pact'] : []), ...taken.map(h => h.id), ...recorded.map(h => h.id)])];
  for (const id of ids) {
    const h = taken.find(t => t.id === id);
    say(id === 'pact' ? `== pact home (${core.NEUTRAL_REL}) ==` : `== ${id} (${h ? h.name : 'taken out'}) ==`);
    const mine = rel => owner(rel) === id;
    const driftHere = [...p.drift.filter(l => mine(l.slice(0, l.indexOf(' (')))), ...links.drift.filter(d => d.harness === id).map(d => d.line), ...(id === 'claude' ? settingsDrift : []), ...hooks.flatMap(f => f.drifted.filter(d => d.harness === id).map(d => d.line))];
    for (const [title, items] of [['Drift', driftHere], ['Overwrite', p.overwrite.filter(mine)], ['Add', p.add.filter(mine)], ['Delete', p.delete.filter(mine)], ['Yours, left as is', [...p.yours.filter(mine), ...links.yours.filter(l => l.harness === id).map(l => l.path)]]]) {
      say(`${title}: ${items.length}`);
      for (const i of items) say(`  ${core.formatPlain(i)}`);
    }
    const linking = core.linkLines(links, id);
    if (linking.length) say(`Links: ${linking.length}`);
    for (const l of linking) say(`  ${core.formatPlain(l.trim())}`);
    if (h && core.builtParts(h).agents) for (const l of core.retiredAgentLines(rel => liveAt(rel).exists, p.delete, h.agents.dir)) say(l);
    say(`Unchanged: ${[...repoFiles.keys()].filter(rel => mine(rel) && !changed.has(rel)).length}`);
    for (const rel of unrecorded.filter(mine)) say(`WARN: ${core.formatPlain(rel)} already exists and the install record does not list it; --apply refuses until you move it out of the way; after an install from before ~/.pact, follow the one-time removal in docs/install.md.`);
    if (id === 'claude' && settings !== null) {
      say(`settings.json: ${settings}`);
      if (settingsWill) for (const l of changes) say(l);
      for (const l of compactBlock) say(l);
      for (const l of identityBlock) say(l);
      for (const l of notes) say(l);
    }
    for (const f of hooks.filter(f => [...f.want, ...f.recorded].some(w => w.harness === id))) for (const l of core.guardLines(f, id)) say(l);
  }
  if (guardOn) say(`Guard rules (${core.GUARD_TABLE_DEST}): ${rules.map(r => `${r.id} (${r.decision})`).join(', ')}`);
  for (const w of p.warnings) say(`WARN: ${core.formatPlain(w)}`);
  // What --apply will copy first (#272, S9): the same inputs the backup takes.
  const settingsCopied = settingsWill && liveBytes !== null;
  say(core.backupLine(p.overwrite.length + p.delete.length + (settingsCopied ? 1 : 0) + hooksWill.filter(f => f.bytes !== null).length + (policyWill ? 1 : 0) + (recordBytes !== null ? 1 : 0), settingsCopied));
  const folder = io.scanBackups(home);
  if (folder.link) say(`WARN: ${core.BACKUPS_REL} is not a plain folder: a link, a file or another reparse point; --apply refuses until it is moved out of the way.`);
  if (folder.staging.length) say(core.stagingLine(folder.staging));
  if (folder.others) say(core.othersLine(folder.others));
  const ownFiles = [...(settingsRel === null ? [] : [[settingsRel, settingsFile]]), ...hooks.map(f => [f.path, f.file]), ...(policyWill ? [[core.CODEX_CONFIG_REL, policyFile]] : []), [core.RECORD_REL, recordFile]];
  say('Configuration:');
  for (const l of core.configBlock(parsed, boundHash, record, renders.rules.map(r => r.id).sort())) say(l);
  for (const l of core.commandsBlock(on, staged.keys(), parsed.commands)) say(l);
  for (const l of core.toolsBlock(toolsOn, staged.keys())) say(l);
  for (const l of core.skillsBlock(parsed)) say(l);
  if (run.dirty) say(`Working tree: DIRTY (${run.dirty} path(s)); the check ran on commit ${commit}, and uncommitted edits are not checked. --apply will refuse.`);
  else say('Working tree: clean');
  if (nothing) say('Nothing to do.');
  leftoverNote(tmpdir(), basename(work));
  // The gate block comes last, after the checks' own output, so nothing they print can stand in for it.
  for (const l of gateLines) say(l);

  core.checkBinding(opts, boundHash, commit);
  const configApplies = parsed.config.kind !== 'none';

  // The review output, once every check for this run has passed (V1, X3).
  const writeReview = async () => {
    if (opts.reviewFolder === null) return;
    const review = await loadCore('review-core.mjs');
    const report = review([resolve(opts.reviewFolder), home, reviewFile, diffFile]);
    for (const l of core.showLines(core.outputLines(report.lines), 'review')) say(l);
    core.checkReviewLines(report, reviewHash, parsed.diffHash);
    say('Review output: rendered-rules.txt and config.diff written to the review folder.');
  };

  if (!opts.apply) {
    await writeReview();
    say("Dry run only. After the owner's go-ahead, run:");
    say(`  ${core.applyLine(opts.paths, commit, configApplies ? boundHash : null, process.platform, releaseFrom())}`);
    say('RESULT: pass');
    return;
  }
  core.checkApply({ configApplies, hashGiven: opts.renderedHash !== null, drift: drift.length > 0, dirty: run.dirty > 0, settingsObject: settingsRel === null || liveSettings !== null, unrecorded });

  // Apply (X2 to X5): the review last, then the writes.
  // A temp file a hard stop left would stop the writes midway, so refuse before any (X5).
  for (const rel of [...p.overwrite, ...p.add]) if (io.exists(io.tempName(live(home, rel)))) core.stops.tempLeft(rel);
  for (const [rel, file] of ownFiles) if (io.exists(io.tempName(file))) core.stops.tempLeft(rel);
  await writeReview();
  // @@TEST-BACKUP-HOOK@@
  // The backup, after every check and before CHECKS DONE, so a backup that fails still changed nothing (#272, S7).
  const settingsBackup = [
    ...(settingsWill ? [{ path: settingsRel, harness: 'claude', sha256: liveBytes === null ? null : io.sha256(liveBytes) }] : []),
    ...hooksWill.map(f => ({ path: f.path, harness: (f.want[0] ?? f.recorded[0]).harness, sha256: f.bytes === null ? null : io.sha256(f.bytes) })),
    ...(policyWill ? [{ path: core.CODEX_CONFIG_REL, harness: 'codex', sha256: io.sha256(policyBytes) }] : []),
  ];
  const toKeep = core.backupEntries({ copy: [...p.overwrite, ...p.delete], add: p.add, live: rel => seen.get(rel), settings: settingsBackup, record: recordBytes === null ? null : io.sha256(recordBytes), harnessOf: owner, links });
  const started = () => {
    backupStarted = true;
    say('BACKUP STARTED');
    // @@TEST-BACKUP-STARTED-HOOK@@
  };
  const made = io.takeBackup(io.FS_OPS, { home, commit, entries: toKeep, now: () => new Date(), started });
  backup = made.name;
  say(`backed up ${made.files} file(s) to ${core.BACKUPS_REL}/${backup}`);
  say('CHECKS DONE');
  writing = true;
  say('Applying.');
  for (const l of gateLines) say(l);
  mkdirSync(home, { recursive: true });
  // The record is written after each change, so a failed apply leaves it
  // matching the disk where it stopped (spec 0007 S9): it starts as what is
  // already true, the last install's files and those that need no write.
  const files = new Map();
  for (const e of record ? record.files : []) if (e.path !== null && core.inTargets(e.path, e.harness, targets) && core.skipReason(e.path, linkIn, mergedFiles) === null && !p.yours.includes(e.path) && liveAt(e.path).file) files.set(e.path, { harness: e.harness, sha256: e.sha256 });
  for (const [rel, sha] of repoFiles) if (!changed.has(rel)) files.set(rel, { harness: owner(rel), sha256: sha });
  // The links on disk: the last install's that still stand, then each as it is made or removed.
  const linkOf = l => [l.path, { harness: l.harness, path: l.path, target: l.target }];
  const linksNow = new Map([...links.keep, ...links.remove].map(linkOf));
  let entriesNow = claudeRecorded;
  // Each hooks file's entries: the last install's until it is written, or at once when it needs no write.
  const hookEntries = new Map(hooks.map(f => [f.path, f.changed ? f.recorded : f.entries]));
  const writeRecord = () => {
    const now = taken.map(core.targetsOf);
    // A harness of the last install stays listed while the record still names a file in its folders.
    const kept = recorded.filter(old => !now.some(t => targetsText(t) === targetsText(old)) && ([...files].some(([rel, f]) => f.harness === old.id && core.inTargets(rel, old.id, [old]) && !core.inTargets(rel, old.id, now)) || [...linksNow.values()].some(l => l.harness === old.id && !now.some(t => t.id === old.id))));
    const sorted = new Map([...files].sort(([a], [b]) => (a < b ? -1 : 1)));
    // The window stays recorded when the settings file is left untouched.
    io.writeReplacing(recordFile, core.recordText({ commit, release: opts.release, digest: parsed.digest, harnesses: [...now, ...kept], userHash: parsed.config.kind === 'user' ? parsed.config.sha256 : null, blockHashes: parsed.config.kind === 'user' ? parsed.blockHashes : new Map(), files: sorted, links: [...linksNow.values()].sort((a, b) => (a.path < b.path ? -1 : 1)), entries: [...entriesNow, ...[...hookEntries.values()].flat()], gateNow }));
  };
  const writeHooks = f => {
    io.writeReplacing(f.file, core.settingsText(f.merged));
    hookEntries.set(f.path, f.entries);
    writeRecord();
    say(`merged ${f.path}`);
  };
  // A hook goes before the files it runs are deleted, and comes after the files it runs are written, so no entry names a missing wrapper.
  for (const f of hooksWill.filter(f => !f.want.length)) writeHooks(f);
  const stands = l => io.linkState(live(home, l.path), live(home, l.target)) === 'ours';
  // A link goes before the files it points at are deleted, and comes after they are written.
  for (const l of links.remove) {
    if (stands(l)) io.removeLink(live(home, l.path));
    linksNow.delete(l.path);
    writeRecord();
    say(`unlinked ${l.path}`);
  }
  for (const rel of p.delete) {
    io.removeFile(live(home, rel));
    files.delete(rel);
    writeRecord();
    say(`deleted ${rel}`);
  }
  for (const rel of core.skillFolders(p.delete, targets)) io.removeIfEmpty(live(home, rel));
  const put = (rel, source, sha256, harnessId) => {
    io.writeReplacing(live(home, rel), readFileSync(live(stage, source)));
    files.set(rel, { harness: harnessId, sha256 });
    writeRecord();
    say(`installed ${rel}`);
  };
  for (const rel of changed) put(rel, sourceOf.get(rel), repoFiles.get(rel), owner(rel));
  const linked = [...links.keep];
  for (const l of links.add) {
    try {
      io.makeLink(live(home, l.target), live(home, l.path));
    } catch (e) {
      // The folder is copied only where nothing came to be at its path.
      if (io.present(live(home, l.path))) throw e;
      say(`copied ${l.path}: a link could not be made`);
      for (const [source, d] of core.copyDestinations([l], neutral)) put(d.dest, source, d.sha256, d.harness);
      continue;
    }
    linksNow.set(...linkOf(l));
    linked.push(l);
    writeRecord();
    say(`linked ${l.path} -> ${l.target}`);
  }
  if (settingsWill) {
    io.writeReplacing(settingsFile, core.settingsText(merged));
    say('merged settings.json');
  }
  entriesNow = entries;
  writeRecord();
  for (const f of hooksWill.filter(f => f.want.length)) writeHooks(f);
  for (const f of hooks.filter(f => f.trust)) say(core.CODEX_TRUST_LINE);
  if (policyWill) {
    io.writeReplacing(policyFile, policyNext);
    say(`merged ${core.CODEX_CONFIG_REL}`);
  }

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
  for (const l of linked) {
    if (stands(l)) say(`OK       ${l.path} (link)`);
    else {
      say(`MISMATCH ${l.path} (the skill link is not there)`);
      bad++;
    }
  }
  for (const l of links.remove) {
    if (io.present(live(home, l.path))) {
      say(`MISMATCH ${l.path} (should be unlinked)`);
      bad++;
    }
  }
  for (const f of hooks.filter(f => f.want.length)) {
    const after = io.readOptional(f.file);
    const now = after === null ? null : core.readSettings(after.toString('utf8'));
    if (now !== null && !core.guardDrift({ recorded: f.entries }, now).length) say(`OK       ${f.path} (pact-guard hook)`);
    else {
      say(`MISMATCH ${f.path} (the pact-guard hook is not there)`);
      bad++;
    }
  }
  if (claude) {
    const after = io.readOptional(settingsFile);
    if (core.guardHolds(after === null ? null : core.readSettings(after.toString('utf8')))) say('OK       settings.json (auto mode, no retired ask rules)');
    else {
      say('MISMATCH settings.json (auto mode is off or a retired ask rule remains)');
      bad++;
    }
  }
  if (bad) {
    say(`${bad} mismatch(es). ${core.backupKept(backup)}`);
    process.exitCode = 1;
    return;
  }
  // Old backups go only after a verified apply; an error here leaves them, and the run still passes (#272, S8).
  for (const l of core.pruneLines(io.pruneBackups(io.FS_OPS, { home, own: backup }))) say(l);
  say(`Installed commit ${commit} with ${parsed.config.kind === 'default' ? `the pact's default configuration ${parsed.digest}` : parsed.digest ? `configuration ${parsed.digest}` : 'no configuration'}; all files verified.`);
  say('RESULT: pass');
}

try {
  await main();
} catch (e) {
  for (const l of gateLines) say(l);
  const left = writing === 'project' ? core.PROJECT_LEFT : `The home folder may hold part of this install.${backup ? ` ${core.backupKept(backup)}` : ''}`;
  // Between BACKUP STARTED and CHECKS DONE only the backup's own refusal knows what it removed (#272, S9).
  const staged = backupStarted && !writing;
  if (e instanceof core.Refusal) say(`REFUSED: ${e.why} ${writing ? left : staged && !e.rule.startsWith('backup-') ? core.STAGING_LEFT : e.outcome}`);
  else say(`REFUSED: the install failed while it ran. ${writing ? left : staged ? core.STAGING_LEFT : 'Nothing was changed.'}`);
  say('RESULT: refused');
  process.exitCode = 1;
}
