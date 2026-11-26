// The pact's shared guard (spec 0007 S8). A harness's PreToolUse hook runs a
// thin wrapper beside this file before the calls it matches; the wrapper hands
// the call's command text, or the path of a file about to be read, here, and
// this answers it against rules.json, the rule table the install writes next to
// it. It reads both as data: it runs nothing, writes nothing, sends nothing and
// reads only the table.
//
// Every failure is thrown as a GuardFailure with a code from the wrappers'
// closed list, so a wrapper can answer deny with fixed text. Nothing from the
// call, and no error's own text, is ever part of an answer.
//
// The tokenizer and the wrapper stripping are ported from the repo's athanor
// guard (spec 0001). Guards are speed bumps: another spelling gets past them.

import { readFileSync } from 'node:fs';

/** The longest command the guard reads; a longer one is refused, so a huge command can't outrun the hook's timeout. */
export const COMMAND_MAX = 1024 * 1024;

export class GuardFailure extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}
const fail = code => {
  throw new GuardFailure(code);
};

// The command as segments of tokens. Quotes are read first, so text inside
// them is one token of data; the body of a heredoc or a PowerShell here-string
// is skipped as data; and only then do `;`, `|`, `&&`, `||`, a lone `&`, a
// parenthesis, a brace and a line break end a segment. A backslash is a path
// character, not an escape, except before a double quote inside double quotes
// in Bash; PowerShell escapes with a backtick. A line continuation joins the
// two lines. An unclosed quote runs to the end of the command.
export function segmentsOf(command, bash) {
  command = command.replace(bash ? /\\\r?\n/g : /`\r?\n/g, ' ');
  const segments = [];
  let tokens = [];
  let current = '';
  let started = false;
  let heredocs = [];
  const endToken = () => {
    if (started) tokens.push(current);
    current = '';
    started = false;
  };
  const endSegment = () => {
    endToken();
    if (tokens.length) segments.push(tokens);
    tokens = [];
  };
  const n = command.length;
  let i = 0;
  while (i < n) {
    const c = command[i];
    if (c === "'") {
      started = true;
      i++;
      while (i < n && command[i] !== "'") current += command[i++];
      i++;
    } else if (c === '"') {
      started = true;
      i++;
      while (i < n && command[i] !== '"') {
        if ((command[i] === (bash ? '\\' : '`') || (bash && command[i] === '`')) && command[i + 1] === '"') {
          current += '"';
          i += 2;
        } else current += command[i++];
      }
      i++;
    } else if ((c === '@' && (command[i + 1] === "'" || command[i + 1] === '"')) && /^[ \t]*\r?\n/.test(command.slice(i + 2, i + 80))) {
      // A PowerShell here-string: its body runs to a line that opens with the
      // same quote and `@`.
      const close = command.indexOf(`\n${command[i + 1]}@`, i + 2);
      started = true;
      current += '@';
      i = close === -1 ? n : close + 3;
    } else if (c === '<' && command.startsWith('<<', i) && !command.startsWith('<<<', i)) {
      let j = i + 2;
      const strip = command[j] === '-';
      if (strip) j++;
      while (command[j] === ' ' || command[j] === '\t') j++;
      const quote = command[j] === "'" || command[j] === '"' ? command[j++] : '';
      let delimiter = '';
      while (j < n && !/[\s;|&()<>]/.test(command[j]) && command[j] !== quote) delimiter += command[j++];
      if (quote && command[j] === quote) j++;
      if (delimiter) heredocs.push({ word: delimiter, strip });
      endToken();
      tokens.push('<<');
      i = j;
    } else if (c === '\n') {
      endSegment();
      i++;
      // The bodies of the heredocs this line opened, in order.
      for (const { word, strip } of heredocs) {
        while (i < n) {
          const eol = command.indexOf('\n', i);
          const line = command.slice(i, eol === -1 ? n : eol).replace(/\r$/, '');
          i = eol === -1 ? n : eol + 1;
          if ((strip ? line.replace(/^\t+/, '') : line) === word) break;
        }
      }
      heredocs = [];
    } else if (!bash && command.startsWith('<#', i) && !started) {
      // A PowerShell block comment runs to its `#>`.
      const close = command.indexOf('#>', i + 2);
      i = close === -1 ? n : close + 2;
    } else if (c === '#' && !started) {
      // A comment, in either shell, runs to the end of its line.
      while (i < n && command[i] !== '\n') i++;
    } else if (c === ' ' || c === '\t' || c === '\r') {
      endToken();
      i++;
    } else if (c === ';' || c === '|' || c === '(' || c === ')' || c === '{' || c === '}') {
      endSegment();
      i += command.startsWith('||', i) ? 2 : 1;
    } else if (c === '&') {
      if (current.endsWith('>') || command[i + 1] === '>') {
        // A redirect, `2>&1` or `&>`, is part of the word it sits in.
        started = true;
        current += c;
        i++;
      } else if (command.startsWith('&&', i)) {
        endSegment();
        i += 2;
      } else if (tokens.length === 0 && !started) {
        // PowerShell's call operator opens a command; it wraps, it does not end.
        tokens.push('&');
        i++;
      } else {
        endSegment();
        i++;
      }
    } else {
      started = true;
      current += c;
      i++;
    }
  }
  endSegment();
  return segments;
}

// Words that only wrap the command that follows them.
const WRAPPERS = new Set(['&', 'time', 'call']);
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const MISE = /^mise(?:\.exe)?$/i;
const NPX = /^npx(?:\.cmd|\.exe)?$/i;
const base = t => t.slice(Math.max(t.lastIndexOf('/'), t.lastIndexOf('\\')) + 1);

/** The index of the program a segment runs, past its wrappers; the segment's length when there is none. */
export function programAt(tokens) {
  let i = 0;
  // Once no `--` lies ahead, none will for a later `mise` either; without this a long line of them is quadratic.
  let noDashes = false;
  for (;;) {
    const t = tokens[i];
    if (t === undefined) return tokens.length;
    if (WRAPPERS.has(t) || ASSIGNMENT.test(t)) i++;
    else if (t === 'env') {
      i++;
      while (tokens[i] !== undefined && (tokens[i].startsWith('-') || ASSIGNMENT.test(tokens[i]))) i += tokens[i] === '-u' || tokens[i] === '--unset' ? 2 : 1;
    } else if (t.startsWith('$') && tokens[i + 1] === '=') i += 2;
    else if (t === 'timeout') {
      i++;
      if (/^[\d.]+[smhd]?$/.test(tokens[i] ?? '')) i++;
    } else if (MISE.test(base(t)) && /^(?:x|exec)$/.test(tokens[i + 1] ?? '')) {
      // The command is what follows mise's own `--`; without one, it follows
      // the options and the tool@version words.
      i += 2;
      const dashes = noDashes ? -1 : tokens.indexOf('--', i);
      if (dashes !== -1) i = dashes + 1;
      else {
        noDashes = true;
        while (tokens[i] !== undefined && (tokens[i].startsWith('-') || tokens[i].includes('@'))) i++;
      }
    } else if (NPX.test(base(t))) {
      i++;
      while (tokens[i]?.startsWith('-')) i += tokens[i] === '-p' || tokens[i] === '--package' ? 2 : 1;
    } else return i;
  }
}

/** A program word as a rule names it: no folder, no `@version`, no Windows extension, lower case. */
const programName = t => base(t).replace(/@[^@]*$/, '').replace(/\.(?:exe|cmd|bat|ps1)$/i, '').toLowerCase();

/** Whether the words from `at` begin with the rule's, `*` standing for one or more words. */
function wordsMatch(tokens, at, words) {
  if (at >= tokens.length || programName(tokens[at]) !== words[0]) return false;
  let t = at + 1;
  let w = 1;
  while (w < words.length) {
    const gap = words[w] === '*';
    if (gap) w++;
    let end = w;
    while (end < words.length && words[end] !== '*') end++;
    const chunk = words.slice(w, end);
    const fits = s => chunk.every((word, k) => tokens[s + k] === word);
    if (!gap) {
      if (!fits(t)) return false;
    } else {
      let s = t + 1;
      while (s + chunk.length <= tokens.length && !fits(s)) s++;
      if (s + chunk.length > tokens.length) return false;
      t = s;
    }
    t += chunk.length;
    w = end;
  }
  return true;
}

/** Whether the segment's text holds each part in order. */
function containsMatch(text, parts) {
  let from = 0;
  for (const part of parts) {
    const at = text.indexOf(part, from);
    if (at === -1) return false;
    from = at + part.length;
  }
  return true;
}

const ID_RE = /^[a-z0-9-]{1,64}$/;
const isWords = v => Array.isArray(v) && v.length > 0 && v.every(w => typeof w === 'string' && w !== '');
// What a rule matches, one kind each: a command's words, parts of its text, or the skills whose file a read opens.
const SHAPES = {
  words: v => isWords(v) && v[0] !== '*' && v.at(-1) !== '*',
  contains: isWords,
  skills: v => isWords(v) && v.every(name => ID_RE.test(name)),
};

/** The rule table's text as its rules; anything but exactly the install's shape is a `table` failure. */
export function parseTable(text) {
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    fail('table');
  }
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.rules)) fail('table');
  for (const r of doc.rules) {
    const ok = r && typeof r === 'object' && typeof r.id === 'string' && ID_RE.test(r.id) && (r.decision === 'deny' || r.decision === 'ask');
    const kinds = ok ? Object.keys(SHAPES).filter(k => Object.hasOwn(r, k)) : [];
    if (kinds.length !== 1 || !SHAPES[kinds[0]](r[kinds[0]])) fail('table');
  }
  return doc.rules;
}

/** The first rule `met` accepts, as { decision, id }, or null. A deny anywhere beats an ask. */
function firstMet(rules, met) {
  for (const decision of ['deny', 'ask']) {
    const rule = rules.find(r => r.decision === decision && met(r));
    if (rule) return { decision, id: rule.id };
  }
  return null;
}

/**
 * The rule a command meets, or null. The hook doesn't say which shell runs the
 * command, so it is read both as Bash and as PowerShell, and a match in either
 * counts. A deny anywhere beats an ask.
 */
export function judge(command, rules) {
  const segments = [...segmentsOf(command, true), ...segmentsOf(command, false)].map(tokens => ({ tokens, at: programAt(tokens), text: tokens.join(' ') }));
  return firstMet(rules, rule => !rule.skills && segments.some(s => (rule.words ? wordsMatch(s.tokens, s.at, rule.words) : containsMatch(s.text, rule.contains))));
}

/** A name without the dots and spaces Windows drops from its end; a loop, so a long name costs no backtracking. */
function trimmed(name) {
  let end = name.length;
  while (end > 0 && (name[end - 1] === '.' || name[end - 1] === ' ')) end -= 1;
  return name.slice(0, end);
}

/**
 * A path's parts in lower case, with either separator, `.` and `..` resolved,
 * and each name cut as Windows reads it: no stream after a colon, no dot or
 * space at its end.
 */
function pathParts(path) {
  const parts = [];
  for (const named of path.toLowerCase().split(/[\\/]+/)) {
    const part = named.split(':', 1)[0];
    if (part === '..') parts.pop();
    else if (part !== '' && part !== '.') parts.push(trimmed(part));
  }
  return parts;
}

/** The rule a read of `path` meets, or null: the SKILL.md of a skill the rule names, in a folder named skills. */
export function judgeRead(path, rules) {
  const [folder, skill, file] = pathParts(path).slice(-3);
  if (folder !== 'skills' || file !== 'skill.md') return null;
  return firstMet(rules, rule => rule.skills?.includes(skill));
}

/** `judged` against the table beside this file, once the call's text is one the guard reads. */
function against(text, judged, tableFile) {
  if (typeof text !== 'string') fail('call');
  if (text.length > COMMAND_MAX) fail('size');
  let table;
  try {
    table = readFileSync(tableFile, 'utf8');
  } catch {
    fail('table');
  }
  return judged(text, parseTable(table));
}

const TABLE = new URL('./rules.json', import.meta.url);
/** The answer to one command: null, or { decision, id }. */
export const answer = (command, tableFile = TABLE) => against(command, judge, tableFile);
/** The answer to one read of a file: null, or { decision, id }. */
export const answerRead = (path, tableFile = TABLE) => against(path, judgeRead, tableFile);
