#!/usr/bin/env node
// The eval generator (#405, ADR 0119): a tool the owner runs on request,
// never a standing step. It writes each case in evals/cases/ twice, as a
// plugin folder `claude plugin eval` can read, and prints the commands for the
// owner to run; it runs none of them.
//
//   node evals/gen.mjs <output folder> [--rules <file>] [--canary]
//   node evals/gen.mjs check <run JSON> <output folder>
//
// <case>-without is the case source as it is. <case>-with carries the rules
// text as `append_system_prompt`, after the case's own keys, as one
// double-quoted string with every hyphen escaped. The eval's parser ends the
// front matter at the first `---` it meets, anywhere, and the rules text has
// one in its first table: the #402 pilot wrote the rules as a block scalar
// first, and every with-rules run lost the case's keys and most of the rules.
//
// The rules text is the repo's default render (what a fresh install with no
// configuration renders), or the file --rules names. --canary appends a code
// word to it and adds a `canary` case that asks for the word.
//
// `check` reads a run's JSON (claude plugin eval --json) and passes only when
// each case kept its own max_turns, its prompt holds only the case text, and
// every run took one turn (a second turn means a tool was called). It prints
// case names and field names, never a reply or a path.
//
// Checked against Claude Code 2.1.310. Node 24 or later, node: built-ins only.
//
// The default render calls the gate's render core in-process. Of the controls
// ADR 0032 lists for an in-process caller, it keeps the two-part verdict and
// prints no error text; it doesn't hold to committed code, refuse NODE_OPTIONS
// or set a time limit. No install verdict rests on this render: it only feeds
// eval text, which the owner reads by hand.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check as renderCheck } from '../gate/render-core.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = resolve(HERE, '..');
export const CASES_DIR = join(HERE, 'cases');
export const GEN = join(HERE, 'gen.mjs');

/** The line the pilot put before the rules text: how Claude Code introduces the rules file. */
export const RULES_HEAD = "Contents of ~/.claude/CLAUDE.md (user's private global instructions for all projects):\n\n";
export const CANARY_WORD = 'QUILL7342';
const CANARY_PROMPT = '---\nmax_turns: 2\nallowed_tools: []\n---\n\nDoes any text in your context name a pilot word? Reply with that word alone, or NONE.\n';
const CANARY_GRADER = `---\ntype: regex\npattern: ${CANARY_WORD}\n---\n`;
const MANIFEST = JSON.stringify({ name: 'pact-evals', version: '0.0.0', description: 'The pact rules text, with and without, for an eval run on the owner\'s ask (#405).' }, null, 2) + '\n';

/** The limits every printed run carries. The deny-list takes several words, so it goes last. */
const LIMITS = '--ablation none --runs 1 --model haiku --judge-model haiku --max-cost-usd 1 --no-publish';
const DENY = '--disallow-tools Agent WebFetch WebSearch Bash Write Edit NotebookEdit Read Glob Grep';
const ESCAPED_HYPHEN = '\\' + 'u002D';
// JSON.stringify leaves the two Unicode line separators raw; escape them too, so a key line never breaks.
const SEPARATORS = new RegExp(`[${String.fromCharCode(0x2028, 0x2029)}]`, 'g');
const escapeChar = ch => '\\' + 'u' + ch.charCodeAt(0).toString(16).padStart(4, '0');
const NAME = /^[a-z0-9][a-z0-9-]*$/;

export class Refusal extends Error {}
const refuse = why => { throw new Refusal(why); };

/** A case source's front matter, line by line: the opening `---`, then lines up to one that is exactly `---`. */
function sourceParts(text) {
  const lines = text.split('\n');
  const end = lines.indexOf('---', 1);
  if (lines[0] !== '---' || end < 0) return null;
  return { head: lines.slice(1, end), body: lines.slice(end + 1).join('\n') };
}

/** Reads `key: value` lines; a value is kept as written. */
function keysOf(head) {
  const keys = {};
  for (const line of head) {
    const m = line.match(/^([a-z_]+):\s*(.*)$/);
    if (m) keys[m[1]] = m[2];
  }
  return keys;
}

/**
 * Reads a prompt file the eval's way: the front matter ends at the first `---`
 * after the opening line, wherever it falls. Returns its keys, the decoded
 * `append_system_prompt` (or null) and the body after the closing `---`.
 */
export function evalRead(text) {
  if (!text.startsWith('---\n')) return { keys: {}, system: null, body: text };
  const end = text.indexOf('---', 4);
  if (end < 0) return { keys: {}, system: null, body: text };
  const keys = keysOf(text.slice(4, end).split('\n'));
  let system = null;
  if ('append_system_prompt' in keys) {
    try { system = JSON.parse(keys.append_system_prompt); } catch { system = null; }
  }
  return { keys, system, body: text.slice(end + 3).replace(/^\n/, '') };
}

/** The with copy: the case's own keys, then the rules as one escaped string, then the body unchanged. */
export function withCopy(source, rules) {
  const parts = sourceParts(source);
  const scalar = JSON.stringify(RULES_HEAD + rules).replace(/-/g, ESCAPED_HYPHEN).replace(SEPARATORS, escapeChar);
  return ['---', ...parts.head, `append_system_prompt: ${scalar}`, '---', parts.body].join('\n');
}

/** The repo's default render: claude/CLAUDE.md with an empty home and builder/default-config. */
export function defaultRules() {
  const tmp = mkdtempSync(join(realpathSync.native(tmpdir()), 'pact-evals-'));
  try {
    const out = join(tmp, 'out');
    const home = join(tmp, 'home');
    mkdirSync(out);
    mkdirSync(home);
    const r = renderCheck([join(REPO, 'claude', 'CLAUDE.md'), out, home, join(REPO, 'builder', 'default-config')]);
    if (r.failed || r.lines[r.lines.length - 1] !== 'RESULT: pass') refuse('the default render failed');
    return readFileSync(join(out, 'CLAUDE.md'), 'utf8');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const within = (inner, outer) => {
  const rel = relative(outer, inner);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};

/** One case source, checked: its name, its front matter, no tools, no system prompt of its own. */
function readCase(dir, name) {
  if (!NAME.test(name)) refuse(`case ${JSON.stringify(name)}: the name must be lower-case letters, digits and hyphens`);
  if (name === 'canary') refuse('case canary: the name is kept for the built-in canary');
  if (!existsSync(join(dir, name, 'prompt.md'))) refuse(`case ${name}: no prompt.md`);
  const source = readFileSync(join(dir, name, 'prompt.md'), 'utf8');
  const parts = sourceParts(source);
  if (!parts) refuse(`case ${name}: no front matter`);
  const keys = keysOf(parts.head);
  if ('append_system_prompt' in keys) refuse(`case ${name}: it sets append_system_prompt of its own`);
  if (keys.allowed_tools !== '[]') refuse(`case ${name}: it must grant no tool (allowed_tools: [])`);
  const graders = existsSync(join(dir, name, 'graders')) ? readdirSync(join(dir, name, 'graders')).sort() : [];
  return { name, source, keys, body: parts.body, graders: graders.map(g => [g, readFileSync(join(dir, name, 'graders', g))]) };
}

/** The eval command for one run, the same line in PowerShell and a POSIX shell. */
const evalLine = (out, kase, json) => `claude plugin eval "${out}" --eval-dir evals ${kase ? `--case ${kase} ` : ''}${LIMITS} --json "${join(out, json)}" ${DENY}`;

/**
 * Builds every file in memory, checks each with copy the eval's way, then
 * writes. A refusal throws before anything is written. Returns the lines to print.
 * `rulesText` is the rules text itself; `rulesFile` is a path, as --rules takes;
 * with neither, the default render.
 */
export function generate({ out, rulesText, rulesFile, canary = false, casesDir = CASES_DIR }) {
  const target = resolve(out);
  if (within(target, REPO)) refuse('the output folder is inside the repo');
  if (within(REPO, target)) refuse('the repo inside the output folder');
  if (/["$`%\r\n]/.test(target)) refuse('the output path holds a character a shell would read inside double quotes');
  if (existsSync(target) && readdirSync(target).length) refuse('the output folder is not empty');

  if (rulesText === undefined && rulesFile && !existsSync(rulesFile)) refuse('the --rules file does not exist');
  let text = rulesText ?? (rulesFile ? readFileSync(rulesFile, 'utf8') : defaultRules());
  if (canary) text += `\nCanary: the pilot word is ${CANARY_WORD}.\n`;

  const cases = readdirSync(casesDir).sort().map(n => readCase(casesDir, n));
  if (canary) cases.push({ name: 'canary', source: CANARY_PROMPT, keys: keysOf(sourceParts(CANARY_PROMPT).head), body: sourceParts(CANARY_PROMPT).body, graders: [['word.md', Buffer.from(CANARY_GRADER)]] });

  const files = new Map([[join('.claude-plugin', 'plugin.json'), MANIFEST]]);
  for (const c of cases) {
    const w = withCopy(c.source, text);
    const back = evalRead(w);
    const same = back.system === RULES_HEAD + text && back.body === c.body
      && Object.entries(c.keys).every(([k, v]) => back.keys[k] === v);
    if (!same) refuse(`case ${c.name}: the with copy does not round trip through the eval's front-matter reading`);
    for (const [arm, prompt] of [['with', w], ['without', c.source]]) {
      files.set(join('evals', `${c.name}-${arm}`, 'prompt.md'), prompt);
      for (const [g, buf] of c.graders) files.set(join('evals', `${c.name}-${arm}`, 'graders', g), buf);
    }
  }

  for (const [rel, data] of files) {
    mkdirSync(dirname(join(target, rel)), { recursive: true });
    writeFileSync(join(target, rel), data);
  }

  const first = canary ? 'canary-with' : `${cases[0].name}-with`;
  const lines = [
    `Wrote ${cases.length} cases, each with and without the rules text.`,
    ...(canary ? [`The canary word is ${CANARY_WORD}.`] : []),
    '',
    'Step 0, enter the output folder:',
    `cd "${target}"`,
    'Step 1, run one case:',
    evalLine(target, first, `run-${first}.json`),
    'Step 2, check that run before spending more:',
    `node "${GEN}" check "${join(target, `run-${first}.json`)}" "${target}"`,
    'Step 3, only after step 2 passes, run every case:',
    evalLine(target, null, 'run-all.json'),
  ];
  return { lines };
}

/**
 * Checks a run's JSON against the generated cases in `out`. Returns one line
 * per case (its name and pass, or the failing field) and whether all passed.
 */
export function checkRun(doc, out) {
  const lines = [];
  let ok = true;
  const fail = line => { ok = false; lines.push(line); };
  if (doc?.partial === true) fail('run: fail partial (it stopped at the cost cap)');
  if (!Array.isArray(doc?.cases)) {
    fail('run: fail missing cases');
    return { lines, ok };
  }
  if (!doc.cases.length) fail('run: fail no cases (the eval found none to run)');
  doc.cases.forEach((c, i) => {
    if (typeof c?.name !== 'string' || !NAME.test(c.name)) return fail(`case ${i + 1}: fail missing name`);
    const at = join(out, 'evals', c.name, 'prompt.md');
    if (!existsSync(at)) return fail(`${c.name}: fail name (no such generated case)`);
    const own = evalRead(readFileSync(at, 'utf8'));
    const bad = [];
    if (!('maxTurns' in c)) bad.push('missing maxTurns');
    else if (String(c.maxTurns) !== own.keys.max_turns) bad.push('maxTurns');
    if (typeof c.promptMarkdown !== 'string') bad.push('missing promptMarkdown');
    else if (c.promptMarkdown.trim() !== own.body.trim()) bad.push('promptMarkdown');
    const runs = c.arms && typeof c.arms === 'object' ? Object.values(c.arms).flat() : null;
    if (!runs || !runs.length) bad.push('missing arms');
    else if (runs.some(r => typeof r?.turns !== 'number')) bad.push('missing turns');
    else if (runs.some(r => r.turns !== 1)) bad.push('turns (a tool was called)');
    if (runs && c.name.startsWith('canary-')) {
      const want = c.name === 'canary-with';
      if (runs.some(r => !Array.isArray(r?.graders) || !r.graders.length || r.graders.some(g => g?.passed !== want))) bad.push('canary');
    }
    if (bad.length) fail(`${c.name}: fail ${bad.join(', ')}`);
    else lines.push(`${c.name}: pass`);
  });
  return { lines, ok };
}

function main(argv) {
  try {
    if (argv[0] === 'check') {
      if (argv.length !== 3) refuse('usage: node evals/gen.mjs check <run JSON> <output folder>');
      let doc;
      try { doc = JSON.parse(readFileSync(argv[1], 'utf8')); } catch { refuse('the run JSON could not be read'); }
      const { lines, ok } = checkRun(doc, resolve(argv[2]));
      process.stdout.write(`${lines.join('\n')}\nRESULT: ${ok ? 'pass' : 'fail'}\n`);
      return ok ? 0 : 1;
    }
    const opts = { canary: false };
    const rest = [];
    for (let i = 0; i < argv.length; i++) {
      if (argv[i] === '--canary') opts.canary = true;
      else if (argv[i] === '--rules' && i + 1 < argv.length) opts.rulesFile = argv[++i];
      else rest.push(argv[i]);
    }
    if (rest.length !== 1 || rest[0].startsWith('-')) refuse('usage: node evals/gen.mjs <output folder> [--rules <file>] [--canary]');
    const { lines } = generate({ ...opts, out: rest[0] });
    process.stdout.write(`${lines.join('\n')}\n`);
    return 0;
  } catch (e) {
    // A refusal names its rule; anything else is reported without its text, which can quote a path.
    process.stderr.write(`refused: ${e instanceof Refusal ? e.message : 'the generator itself failed'}\n`);
    return 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
