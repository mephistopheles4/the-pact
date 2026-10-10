// Read-only. Reads a rendered rules file (by default the installed one) and
// checks, in its "Implementing a change" section, every skill installed under
// --skills-dir that the text names:
//   - a command (`/name`) is a skill only the owner starts, so it must carry
//     disable-model-invocation: true;
//   - a code span (`name`) is a skill the agent uses, so it must not.
// A command is a code span whose whole text is "/" and a name: a letter or
// digit, then letters, digits, ".", "_" or "-". A bare /name in prose, a
// placeholder such as `/<skill>`, and a span holding more than the command
// (an argument) are not commands. gate/tests/no-skill-names.test.mjs uses the
// same definition. Gated blocks are skipped: they are held word for word by the
// gate. A skill written both ways is checked in both forms. Until the pact's
// new text is installed, the default file (the installed one) holds the old
// text and will warn; pass --rules-file with a rendered copy of the repo's file.
// OPEN_PARTS below must equal OPEN_MARKS in gate/tests/text.mjs (a test checks
// it). Prints a WARN: line per mismatch, then a summary line when there is
// none, and exits 0 either way. It exits 1 on a usage error, a rules file it
// cannot read, or a rules file with no "Implementing a change" section.
//
//   node scripts/check-skill-flags.mjs [--skills-dir <folder>] [--rules-file <file>]
//
// Ported from scripts/check-skill-flags.ps1 (#210), with its behaviour kept:
// the flag line is matched without regard to case, as PowerShell's -match did.
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const OPEN_PARTS = Object.freeze(['config-notice', 'usage-pause', 'move-1', 'move-2', 'move-3', 'move-4-extra']);

const NAME = '[A-Za-z0-9][A-Za-z0-9._-]*';
const COMMAND_RE = new RegExp(`^/(${NAME})$`);
const NAME_RE = new RegExp(`^${NAME}$`);
const FLAG_RE = /^\s*disable-model-invocation\s*:\s*true\s*$/i;

const readText = p => readFileSync(p, 'utf8').replace(/^\uFEFF/, '');
const isFolder = p => existsSync(p) && statSync(p).isDirectory();
const isFile = p => existsSync(p) && statSync(p).isFile();

// A line's start and end as .NET's multiline ^ and $ read them, which the
// PowerShell script used: only a line feed ends a line, so a CRLF file's
// lines end in a carriage return.
const BOL = '(?:(?<![\\s\\S])|(?<=\\n))';
const EOL = '(?=\\n|(?![\\s\\S]))';
const SECTION_RE = new RegExp(`${BOL}## Implementing a change\\s*${EOL}([\\s\\S]*?)(?=${BOL}## |(?![\\s\\S]))`);
const GATED_RE = new RegExp(`${BOL}[ \\t]*<!-- pact:begin ([a-z0-9-]+) -->${EOL}[\\s\\S]*?${BOL}[ \\t]*<!-- pact:end \\1 -->${EOL}`, 'g');

/** The rules file's "Implementing a change" section, with its gated blocks dropped; null when there is none. */
export function section(md) {
  const m = SECTION_RE.exec(md);
  if (!m) return null;
  return m[1].replace(GATED_RE, (whole, name) => (OPEN_PARTS.includes(name) ? whole : ''));
}

/** Whether the skill's SKILL.md frontmatter sets disable-model-invocation: true. */
function flagged(skillsDir, name) {
  const p = join(skillsDir, name, 'SKILL.md');
  if (!isFile(p)) return false;
  const lines = readText(p).split(/\r?\n/);
  if (lines[0].trim() !== '---') return false;
  for (let i = 1; i < lines.length && lines[i].trim() !== '---'; i += 1) if (FLAG_RE.test(lines[i])) return true;
  return false;
}

/** The output lines for the rules text `md` and the skills under `skillsDir`. */
export function check(md, skillsDir) {
  const text = section(md);
  if (text === null) throw new Error("no 'Implementing a change' section in the rules file");
  const commands = [];
  const agentSkills = [];
  for (const span of text.matchAll(/`([^`\r\n]+)`/g)) {
    const c = COMMAND_RE.exec(span[1]);
    if (c) commands.push(c[1]);
    else if (NAME_RE.test(span[1])) agentSkills.push(span[1]);
  }
  const installed = names => [...new Set(names)].filter(n => isFolder(join(skillsDir, n)));
  const cmds = installed(commands);
  const spans = installed(agentSkills);
  const out = [];
  for (const n of cmds) if (!flagged(skillsDir, n)) out.push(`WARN: ${n} is written as a command (only the owner starts it) but lacks disable-model-invocation: true`);
  for (const n of spans) if (flagged(skillsDir, n)) out.push(`WARN: ${n} is written as a code span (the agent uses it) but has disable-model-invocation: true`);
  if (out.length === 0) out.push(`named skills: ${new Set([...cmds, ...spans]).size}; commands: ${cmds.length}; OK`);
  return out;
}

function main(argv) {
  const opts = { '--skills-dir': join(homedir(), '.claude', 'skills'), '--rules-file': join(homedir(), '.claude', 'CLAUDE.md') };
  for (let i = 0; i < argv.length; i += 2) {
    if (!(argv[i] in opts) || argv[i + 1] === undefined) {
      process.stderr.write('usage: node scripts/check-skill-flags.mjs [--skills-dir <folder>] [--rules-file <file>]\n');
      return 1;
    }
    opts[argv[i]] = argv[i + 1];
  }
  try {
    for (const l of check(readText(opts['--rules-file']), opts['--skills-dir'])) process.stdout.write(`${l}\n`);
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    return 1;
  }
  return 0;
}

// Run only when started as a script, never when a test imports OPEN_PARTS.
const real = p => {
  const r = realpathSync(p);
  return process.platform === 'win32' ? r.toLowerCase() : r;
};
if (process.argv[1] && existsSync(process.argv[1]) && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) process.exitCode = main(process.argv.slice(2));
