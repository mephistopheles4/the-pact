// project-core.mjs (#155): the check itself, for the project install.
// project.mjs is its command line: it calls check() with its arguments, prints
// the lines and sets the exit code. Importing this file does nothing: no file,
// process, environment or OS user read until check() is called, and check()
// never prints or exits.
//
// The project install's checks and writes (#53, slice 5). The install script
// runs it through its Node runner, from the stage, with the stage as its
// working folder: never the project folder.
//
//   node project.mjs check <project folder> <Claude home folder>
//   node project.mjs write <project folder> <Claude home folder> <rendered file> <sha256>
//
// What a project install writes: one pact-owned rules file, RULES_NAME, in the
// project's .claude/rules folder, and a record beside it, RECORD_NAME, under a
// non-.md name, since Claude Code loads .md files in a rules folder. The
// record holds only that one file's name and hash: nothing derived from the
// user's own configuration, and not the pact's commit, since a team may commit
// the record with the repo. It can drive the deletion of nothing, since a
// project install deletes nothing. A record is a file in the project, so it is
// no proof that the pact wrote anything; it only lets a later install replace
// the file whose hash it names.
//
// Both modes first run every check below, in this order, and refuse on the
// first that fails:
//   1. The project folder exists and is a folder. Every later check is rooted
//      at its real path (links, junctions and short names resolved).
//   2. The home-folder relations, on canonical real paths, case-folded on
//      Windows and macOS, matched on whole segments (gate/paths.mjs). It
//      refuses a project folder that equals or holds the real home folder, or
//      that equals, holds or sits inside the real Claude folder (.claude in
//      the home folder), whatever --claude-home says; and likewise for the
//      Claude home folder named for the run, when it differs. The real home
//      folder is the account's, as the operating system reports it
//      (os.userInfo), and also the one HOME or USERPROFILE names when that
//      differs, so a changed environment cannot move it away.
//      Known limit: the relations compare path text after realpath. A
//      spelling realpath does not unify with the drive-letter form (a network
//      share of a local folder, say) is not matched; the folder is the owner's
//      choice, and such a project would still need a configuration file there.
//   3. The project's .claude folder exists, is not a link, and stays where it
//      was named; the project configuration file exists there and is not a
//      link. (The renderer reads it, under its own rules.)
//   4. The .claude/rules folder, when it exists, is not a link and stays where
//      it was named. The rules file and the record, when they exist, are read
//      once each as regular, one-link files that are not links
//      (gate/contained.mjs). The record must be one the pact wrote, naming
//      RULES_NAME. An existing rules file with no record, or whose hash is not
//      the record's, refuses: the install never replaces a file it did not
//      write. First-install mode never applies in a project.
// The install script also runs its reparse-attribute test on these paths,
// rooted at the real path this prints, since Node's lstat reads some reparse
// points as plain files.
//
// check prints "ROOT <real path of the project folder>" (for the install
// script's own attribute test; the install never shows it) and "STATE new" or
// "STATE update <sha256 of the recorded rules file>".
//
// write takes the real path check printed, and refuses unless it is still the
// folder's real path. It reads the rendered file once (at most 1 MiB) and
// refuses unless its hash is the one given. It makes .claude/rules if needed,
// then writes the rules file and the record, each through writeContained
// with a random temp name, the rules folder pinned to the identity the checks
// found. Then it verifies both: the same lstat and open checks, then the hash.
// It prints "WROTE <sha256 of the rules file> <sha256 of the record>".
//
// Then "RESULT: pass", or FAIL lines and "RESULT: fail" with exit 1. Like seam
// A, it never echoes a file's content: its messages are its own fixed text
// and fixed names. No switch turns a check off. Node 20 or later, ESM.

import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { folderId, randomTempName, readContained, writeContained } from './contained.mjs';
import { fold, realOrResolved, within } from './paths.mjs';
import { Refused, Report, readStrictJson } from './shared.mjs';

const RULES_NAME = 'pact-project.md';
const RECORD_NAME = 'pact-project.record.json';
const CONFIG_NAME = 'pact-config.json';
const RULES_MAX = 1024 * 1024;
const RECORD_MAX = 4096;
const RECORD_KEYS = Object.freeze(['file', 'sha256']);
const HEX64 = /^[0-9a-f]{64}$/;

const sha256 = b => createHash('sha256').update(b).digest('hex');
const isObject = v => typeof v === 'object' && v !== null && !Array.isArray(v);
const refuse = (rule, reason) => {
  throw new Refused(rule, reason);
};

/** A folder under the project that must be a real folder, not a link, and stay where it was named. False when it does not exist. */
function plainFolder(p, label) {
  let st;
  try {
    st = lstatSync(p);
  } catch (e) {
    if (e && e.code === 'ENOENT') return false;
    refuse('project-folder', `${label} could not be read`);
  }
  if (st.isSymbolicLink()) refuse('project-link', `${label} is a link`);
  if (!st.isDirectory()) refuse('project-folder', `${label} is not a folder`);
  let real;
  try {
    real = realpathSync.native(p);
  } catch {
    refuse('project-folder', `${label} could not be read`);
  }
  if (fold(real) !== fold(p)) refuse('project-link', `${label} resolves somewhere else`);
  return true;
}

/** Every check in the header, in order: { root, rulesDir, rulesExists, state }. Throws Refused. */
function inspect(given, home) {
  if (!isAbsolute(given)) refuse('project-folder', 'the project folder must be a full path');
  let root;
  try {
    root = realpathSync.native(given);
  } catch {
    refuse('project-folder', 'the project folder does not exist or could not be read');
  }
  if (!lstatSync(root).isDirectory()) refuse('project-folder', 'the project folder is not a folder');

  // The account's home folder from the operating system, and the one the
  // environment names when that differs.
  const homes = [homedir()];
  try {
    const sys = userInfo().homedir;
    if (typeof sys === 'string' && sys !== '') homes.unshift(sys);
  } catch {}
  const named = realOrResolved(home);
  for (const h of homes) {
    const realHome = realOrResolved(h);
    const realClaude = realOrResolved(join(h, '.claude'));
    if (within(realHome, root)) refuse('project-home', 'the project folder is your home folder, or holds it');
    if (within(realClaude, root) || within(root, realClaude)) refuse('project-home', 'the project folder is the Claude folder in your home folder, holds it, or is inside it');
  }
  if (within(named, root) || within(root, named)) refuse('project-home', 'the project folder is the Claude home folder named for this install, holds it, or is inside it');

  const claudeDir = join(root, '.claude');
  if (!plainFolder(claudeDir, "the project's .claude folder")) refuse('project-none', 'there is no project configuration: the project folder has no .claude folder');
  let cst;
  try {
    cst = lstatSync(join(claudeDir, CONFIG_NAME));
  } catch (e) {
    if (e && e.code === 'ENOENT') refuse('project-none', 'there is no project configuration: the project has no .claude/pact-config.json');
    refuse('project-file', 'the project configuration file could not be read');
  }
  if (cst.isSymbolicLink()) refuse('project-link', 'the project configuration file is a link');

  const rulesDir = join(claudeDir, 'rules');
  if (!plainFolder(rulesDir, "the project's .claude/rules folder")) return { root, rulesDir, rulesExists: false, state: 'STATE new' };
  const rulesId = folderId(rulesDir);
  if (rulesId === null) refuse('project-folder', "the project's .claude/rules folder could not be read");
  const rules = readContained(rulesDir, RULES_NAME, RULES_MAX);
  const recordBuf = readContained(rulesDir, RECORD_NAME, RECORD_MAX);
  let record = null;
  if (recordBuf) {
    try {
      record = readStrictJson(recordBuf.buf);
    } catch (e) {
      if (!(e instanceof Refused)) throw e;
      refuse('project-record', 'the project record is not valid JSON');
    }
    if (!isObject(record) || Object.keys(record).some(k => !RECORD_KEYS.includes(k)) || record.file !== RULES_NAME || typeof record.sha256 !== 'string' || !HEX64.test(record.sha256)) {
      refuse('project-record', `the project record is not one the pact wrote: it must name only ${RULES_NAME} and its hash`);
    }
  }
  if (!rules) return { root, rulesDir, rulesId, rulesExists: true, state: 'STATE new' };
  const hash = sha256(rules.buf);
  if (!record) refuse('project-unrecorded', `an existing .claude/rules/${RULES_NAME} with no record beside it; the install never replaces a file it has no record of writing`);
  if (record.sha256 !== hash) {
    refuse('project-unrecorded', `the existing .claude/rules/${RULES_NAME} is not the file its record names: it was edited, or an earlier write stopped partway. If the pact wrote it, delete it and ${RECORD_NAME}, then install again`);
  }
  return { root, rulesDir, rulesId, rulesExists: true, state: `STATE update ${hash}` };
}

function write(args, report) {
  const [given, home, renderedFile, want] = args;
  if (!HEX64.test(want)) refuse('usage', 'the hash is not in its form');
  const at = inspect(given, home);
  if (at.root !== given) refuse('project-folder', 'the project folder no longer resolves to the real path the check found');
  let bytes;
  try {
    const st = lstatSync(renderedFile);
    if (!st.isFile() || st.size > RULES_MAX) throw new Error();
    bytes = readFileSync(renderedFile);
  } catch {
    refuse('project-input', 'the rendered project rules file could not be read');
  }
  if (bytes.length > RULES_MAX || sha256(bytes) !== want) refuse('project-input', "the rendered project rules file's hash is not the one the install checked");
  let rulesId = at.rulesId ?? null;
  if (!at.rulesExists) {
    try {
      mkdirSync(at.rulesDir);
    } catch {
      refuse('project-folder', "the project's .claude/rules folder could not be made");
    }
    if (!plainFolder(at.rulesDir, "the project's .claude/rules folder")) refuse('project-folder', "the project's .claude/rules folder could not be made");
    rulesId = folderId(at.rulesDir);
    if (rulesId === null) refuse('project-folder', "the project's .claude/rules folder could not be made");
  }
  const record = Buffer.from(`${JSON.stringify({ file: RULES_NAME, sha256: want }, null, 2)}\n`, 'utf8');
  writeContained(at.rulesDir, randomTempName(), RULES_NAME, bytes, rulesId);
  writeContained(at.rulesDir, randomTempName(), RECORD_NAME, record, rulesId);
  // The verify: the same lstat and open checks as any read here, then the hash.
  const wroteRules = readContained(at.rulesDir, RULES_NAME, RULES_MAX);
  const wroteRecord = readContained(at.rulesDir, RECORD_NAME, RECORD_MAX);
  if (!wroteRules || !wroteRecord || sha256(wroteRules.buf) !== want || sha256(wroteRecord.buf) !== sha256(record)) {
    refuse('project-verify', 'the project rules file or its record does not hold what was written');
  }
  report.lines.push(`WROTE ${want} ${sha256(record)}`);
}

function run(argv, report) {
  const usage = 'usage: node project.mjs check <project folder> <Claude home folder>, or node project.mjs write <project folder> <Claude home folder> <rendered file> <sha256>';
  if (argv.some(a => a === '' || a.startsWith('-'))) return report.fail('usage', null, null, usage);
  try {
    if (argv[0] === 'check' && argv.length === 3) {
      const at = inspect(argv[1], argv[2]);
      report.lines.push(`ROOT ${at.root}`, at.state);
    } else if (argv[0] === 'write' && argv.length === 5) write(argv.slice(1), report);
    else report.fail('usage', null, null, usage);
  } catch (e) {
    if (!(e instanceof Refused)) throw e;
    report.fail(e.rule, null, null, e.reason);
  }
}

/**
 * Run the check on `argv`. Returns the report's lines, with the RESULT line
 * last, and whether it failed. Any throw is an `internal` failure, never a pass.
 */
export function check(argv) {
  const report = new Report();
  try {
    run(argv, report);
  } catch {
    // Never a pass, and never the error's text: it can quote a path.
    report.fail('internal', null, null, 'the project install itself failed');
  }
  report.lines.push(`RESULT: ${report.failed ? 'fail' : 'pass'}`);
  return { lines: report.lines, failed: report.failed };
}
