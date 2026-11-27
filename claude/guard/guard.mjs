// The pact's shared guard (spec 0007 S8, spec 0009 S3). A harness's
// PreToolUse hook runs a thin wrapper beside this file before the calls it
// matches; the wrapper hands the call here, and this answers it against
// rules.json and (lazily on identity candidates) github.json. It reads them
// and plain-text git configs as data: it spawns nothing, writes nothing, sends
// nothing.
//
// Every failure is thrown as a GuardFailure with a code from the wrappers'
// closed list, so a wrapper can answer deny with fixed text. Nothing from the
// call, .git/config, github.json, or any error's own text is ever part of an
// answer's reason or failure message.

import { closeSync, lstatSync, openSync, readFileSync, readSync, realpathSync } from 'node:fs';
import { dirname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The longest command the guard reads; a longer one is refused, so a huge command can't outrun the hook's timeout. */
export const COMMAND_MAX = 1024 * 1024;
const PIN_MAX = 64 * 1024;
const GITCONFIG_MAX = 1024 * 1024;

export class GuardFailure extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}
const fail = code => {
  throw new GuardFailure(code);
};

const PROVIDERS = Object.freeze(['claude', 'codex', 'antigravity']);
const LOGIN_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38})$/;
const HOST_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const WIN_PATH_BAD = /["%!^&|<>$`\u201c\u201d\u201e\p{Cc}]/u;

// ------------------------------------------------------------ closed command & option tables

const GIT_WRITE_SUBCOMMANDS = Object.freeze(new Set(['commit', 'push', 'merge', 'cherry-pick', 'revert', 'rebase', 'tag', 'am']));
const GIT_GLOBAL_VALUE_OPTS = Object.freeze(new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--config-env', '--super-prefix', '--exec-path', '--list-cmds', '--attr-source']));
const GIT_GLOBAL_NOARG_OPTS = Object.freeze(new Set([
  '-p', '--paginate', '-P', '--no-pager', '--bare', '--no-replace-objects',
  '--no-lazy-fetch', '--no-optional-locks', '--no-advice', '--literal-pathspecs',
  '--glob-pathspecs', '--noglob-pathspecs', '--icase-pathspecs', '--version',
  '-v', '--help', '-h', '--html-path', '--man-path', '--info-path', '--exec-path',
]));

const GIT_PUSH_VALUE_OPTS = Object.freeze(new Set(['-o', '--push-option', '--receive-pack', '--exec', '--repo']));
const GIT_PUSH_EQ_ONLY_OPTS = Object.freeze(new Set(['--force-with-lease', '--recurse-submodules', '--signed']));
const GIT_PUSH_NOARG_OPTS = Object.freeze(new Set([
  '-u', '--set-upstream', '-f', '--force', '--force-if-includes', '--no-force-if-includes',
  '--tags', '--all', '--mirror', '-d', '--delete', '-n', '--dry-run', '--atomic',
  '--no-verify', '-q', '--quiet', '-v', '--verbose', '--porcelain', '--no-signed',
  '-4', '--ipv4', '-6', '--ipv6', '--prune', '--thin', '--no-thin',
  '--follow-tags', '--no-follow-tags', '--progress', '--no-progress',
  '--no-recurse-submodules', '--no-force-with-lease',
]));

const GH_READ_ONLY_GROUPS = Object.freeze(new Set(['status', 'browse', 'search', 'completion', 'help', 'version']));
const GH_EXEMPT_GROUPS = Object.freeze(new Set(['run', 'workflow']));
const GH_READ_VERBS = Object.freeze({
  pr: Object.freeze(new Set(['list', 'view', 'status', 'diff', 'checks'])),
  issue: Object.freeze(new Set(['list', 'view', 'status'])),
  release: Object.freeze(new Set(['list', 'view', 'download', 'verify', 'verify-asset'])),
  repo: Object.freeze(new Set(['list', 'view', 'clone', 'gitignore', 'license', 'credits'])),
  label: Object.freeze(new Set(['list'])),
  gist: Object.freeze(new Set(['list', 'view', 'clone'])),
  secret: Object.freeze(new Set(['list'])),
  variable: Object.freeze(new Set(['list', 'get'])),
  cache: Object.freeze(new Set(['list'])),
  ruleset: Object.freeze(new Set(['list', 'view', 'check'])),
  project: Object.freeze(new Set(['list', 'view', 'field-list', 'item-list'])),
  org: Object.freeze(new Set(['list'])),
  attestation: Object.freeze(new Set(['verify', 'download', 'inspect', 'trusted-root'])),
  auth: Object.freeze(new Set(['status'])),
});
const GH_FREE_TEXT_WRITES = Object.freeze({
  pr: Object.freeze(new Set(['create', 'comment', 'edit', 'review'])),
  issue: Object.freeze(new Set(['create', 'comment', 'edit'])),
});
const GH_GLOBAL_VALUE_FLAGS = Object.freeze(new Set(['-R', '--repo', '--hostname']));
const GH_REPO_POSITIONAL_EXEMPT_VERBS = Object.freeze(new Set(['delete', 'archive', 'unarchive', 'edit', 'sync', 'set-default']));
const GH_API_VALUE_FLAGS = Object.freeze(new Set(['-X', '--method', '-H', '--header', '-q', '--jq', '-t', '--template', '--hostname', '--cache', '--preview', '-f', '--raw-field', '-F', '--field', '--input']));
const GH_API_WRITE_FLAGS = Object.freeze(new Set(['-f', '--raw-field', '-F', '--field', '--input']));
const GH_API_NOARG_FLAGS = Object.freeze(new Set(['-p', '--paginate', '--slurp', '-i', '--include', '--silent', '--verbose', '--help', '-h']));

const CONTROL_KEYWORDS = Object.freeze(new Set(['if', 'then', 'elif', 'else', 'fi', 'for', 'while', 'until', 'select', 'do', 'done', 'case', 'esac', 'function', 'coproc']));
const CONTROL_OPENERS = Object.freeze(new Set(['then', 'elif', 'else', 'do']));
const CD_PROGRAMS = Object.freeze(new Set(['cd', 'pushd', 'set-location', 'sl', 'chdir']));
const PS_ENV_ITEM_CMDS = Object.freeze(new Set([
  'remove-item', 'set-item', 'clear-item', 'new-item', 'rename-item', 'move-item', 'copy-item',
  'del', 'rm', 'ri', 'si', 'cli', 'ni', 'erase', 'ren', 'rni', 'mv', 'mi', 'move', 'cpi', 'cp', 'copy',
]));
const PS_VAR_CMDS = Object.freeze(new Set(['set-variable', 'remove-variable', 'clear-variable', 'sv', 'rv', 'clv']));
const GIT_CONFIG_OVERRIDE_KEY_RE = /^(?:credential|user|author|committer|include|includeif|http|url)(?:\.|$)|^core\.askpass$/i;
const GIT_SCOPE_OVERRIDE_KEY_RE = /^(?:remote|branch|url|include|includeif)(?:\.|$)/i;

// ------------------------------------------------------------ tokenizer

/**
 * Tokenize `command` in one shell mode (`bash` true/false), tracking raw tokens,
 * separators, comments, subshell/substitution markers, and quoting metadata.
 */
function tokenizeMode(command, bash) {
  const hasRawNewline = /[\r\n]/.test(command);
  command = command.replace(bash ? /\\\r?\n/g : /`\r?\n/g, ' ');
  const segments = [];
  const separators = [];
  let tokens = [];
  let rawTokens = [];
  let tokenOffsets = [];
  let prevTokenQuoted = false;
  let current = '';
  let tokStart = -1;
  let started = false;
  let wasQuoted = false;
  let heredocs = [];
  let stopParse = false;
  let sawComment = false;
  let hasSubexprInDoubleQuotes = false;
  let hasExpandableHereStringWithDollar = false;
  let hasBashSubst = false;
  let hasPsSubexpr = false;
  let hasEnvBraced = false;
  let hasDotNetEnv = false;
  let hasNonSemiSep = false;
  let hasEnclosingOrPipeOrBg = false;
  let hasControlKeyword = false;

  const markUnquotedScan = (idx, lim) => {
    if (bash) {
      if ((command[idx] === '$' && command[idx + 1] === '(') || command[idx] === '`') hasBashSubst = true;
    } else {
      if (command[idx] === '$' && command[idx + 1] === '(') hasPsSubexpr = true;
      if (command[idx] === '$' && idx + 6 <= lim && command.slice(idx, idx + 6).toLowerCase() === '${env:') hasEnvBraced = true;
      if (command[idx] === '[' && /^\[(?:system\.)?environment\]::/i.test(command.slice(idx, idx + 26))) hasDotNetEnv = true;
    }
  };

  const startToken = idx => {
    if (!started) {
      started = true;
      tokStart = idx;
    }
  };

  const endToken = (rawEnd = -1) => {
    if (started) {
      const lower = bash ? current : current.toLowerCase();
      if (!wasQuoted && CONTROL_KEYWORDS.has(lower)) {
        if (tokens.length === 0 || (!prevTokenQuoted && CONTROL_OPENERS.has(bash ? tokens.at(-1) : tokens.at(-1).toLowerCase()))) {
          hasControlKeyword = true;
        }
      }
      tokens.push(current);
      rawTokens.push(tokStart >= 0 && rawEnd >= tokStart ? command.slice(tokStart, rawEnd) : current);
      tokenOffsets.push(tokStart);
      prevTokenQuoted = wasQuoted;
    }
    current = '';
    tokStart = -1;
    started = false;
    wasQuoted = false;
  };

  const endSegment = (sep, rawEnd = -1) => {
    endToken(rawEnd);
    if (tokens.length) {
      segments.push({ tokens, rawTokens, tokenOffsets });
    }
    tokens = [];
    rawTokens = [];
    tokenOffsets = [];
    prevTokenQuoted = false;
    if (sep) {
      separators.push(sep);
      if (sep !== ';' && sep !== '\n') {
        hasNonSemiSep = true;
        if (sep === '|' || sep === '&' || sep === '(' || sep === ')' || sep === '{' || sep === '}') {
          hasEnclosingOrPipeOrBg = true;
        }
      }
    }
  };

  const n = command.length;
  let i = 0;

  const consumeHeredocs = () => {
    for (const { word, strip } of heredocs) {
      while (i < n) {
        const eol = command.indexOf('\n', i);
        const line = command.slice(i, eol === -1 ? n : eol).replace(/\r$/, '');
        i = eol === -1 ? n : eol + 1;
        if ((strip ? line.replace(/^\t+/, '') : line) === word) break;
      }
    }
    heredocs = [];
  };

  while (i < n) {
    const c = command[i];
    if (stopParse) {
      if (c === '\n') {
        endSegment('\n', i);
        stopParse = false;
        i++;
        consumeHeredocs();
      } else if (c === ' ' || c === '\t' || c === '\r') {
        endToken(i);
        i++;
      } else {
        startToken(i);
        current += c;
        i++;
      }
      continue;
    }

    if (!bash && !started && c === '-' && command.startsWith('--%', i) && (i + 3 === n || /[ \t\r\n]/.test(command[i + 3]))) {
      tokens.push('--%');
      rawTokens.push('--%');
      tokenOffsets.push(i);
      prevTokenQuoted = false;
      stopParse = true;
      i += 3;
      continue;
    }

    if (c === "'") {
      startToken(i);
      wasQuoted = true;
      i++;
      while (i < n) {
        if (command[i] === "'") {
          if (!bash && command[i + 1] === "'") {
            current += "'";
            i += 2;
          } else {
            i++;
            break;
          }
        } else {
          current += command[i++];
        }
      }
    } else if (bash && c === '$' && command[i + 1] === "'") {
      startToken(i);
      wasQuoted = true;
      i += 2;
      while (i < n) {
        if (command[i] === "'") {
          i++;
          break;
        } else if (command[i] === '\\' && i + 1 < n && (command[i + 1] === "'" || command[i + 1] === '\\')) {
          current += command[i + 1];
          i += 2;
        } else {
          current += command[i++];
        }
      }
    } else if (c === '"') {
      startToken(i);
      wasQuoted = true;
      i++;
      while (i < n) {
        if (bash) {
          if (command[i] === '"') {
            i++;
            break;
          } else if (command[i] === '\\' && i + 1 < n && (command[i + 1] === '"' || command[i + 1] === '\\')) {
            current += command[i + 1];
            i += 2;
          } else {
            markUnquotedScan(i, n);
            current += command[i++];
          }
        } else {
          if (command[i] === '`' && i + 1 < n) {
            current += command[i + 1];
            i += 2;
          } else if (command[i] === '"') {
            if (command[i + 1] === '"') {
              current += '"';
              i += 2;
            } else {
              i++;
              break;
            }
          } else {
            if (command[i] === '$' && command[i + 1] === '(') hasSubexprInDoubleQuotes = true;
            markUnquotedScan(i, n);
            current += command[i++];
          }
        }
      }
    } else if (!bash && !started && c === '@' && (command[i + 1] === "'" || command[i + 1] === '"')) {
      let j = i + 2;
      while (j < n && (command[j] === ' ' || command[j] === '\t')) j++;
      if (j < n && (command[j] === '\n' || (command[j] === '\r' && command[j + 1] === '\n'))) {
        const q = command[i + 1];
        const close = command.indexOf(`\n${q}@`, j);
        const endIdx = close === -1 ? n : close + 3;
        if (q === '"') {
          const dollarAt = command.indexOf('$', j);
          if (dollarAt !== -1 && dollarAt < endIdx) hasExpandableHereStringWithDollar = true;
        }
        startToken(i);
        wasQuoted = true;
        current += '@';
        i = endIdx;
      } else {
        startToken(i);
        current += c;
        i++;
      }
    } else if ((bash || (!started && !stopParse)) && c === '<' && command.startsWith('<<', i) && !command.startsWith('<<<', i)) {
      let j = i + 2;
      const strip = command[j] === '-';
      if (strip) j++;
      while (j < n && (command[j] === ' ' || command[j] === '\t')) j++;
      let delimiter = '';
      let inQuote = '';
      while (j < n) {
        const ch = command[j];
        if (inQuote === "'") {
          if (ch === "'") {
            inQuote = '';
            j++;
          } else {
            delimiter += ch;
            j++;
          }
        } else if (inQuote === '"') {
          if (ch === '"') {
            inQuote = '';
            j++;
          } else if (ch === '\\' && j + 1 < n && (command[j + 1] === '"' || command[j + 1] === '\\' || command[j + 1] === '$' || command[j + 1] === '`')) {
            delimiter += command[j + 1];
            j += 2;
          } else {
            delimiter += ch;
            j++;
          }
        } else if (ch === "'" || ch === '"') {
          inQuote = ch;
          j++;
        } else if (ch === '\\' && j + 1 < n) {
          delimiter += command[j + 1];
          j += 2;
        } else if (/[\s;|&()<>]/.test(ch)) {
          break;
        } else {
          delimiter += ch;
          j++;
        }
      }
      if (delimiter) heredocs.push({ word: delimiter, strip });
      endToken(i);
      tokens.push('<<');
      rawTokens.push('<<');
      tokenOffsets.push(i);
      prevTokenQuoted = false;
      i = j;
    } else if (c === '\n') {
      endSegment('\n', i);
      i++;
      consumeHeredocs();
    } else if (!bash && command.startsWith('<#', i) && !started) {
      sawComment = true;
      const close = command.indexOf('#>', i + 2);
      i = close === -1 ? n : close + 2;
    } else if (c === '#' && !started) {
      sawComment = true;
      while (i < n && command[i] !== '\n') i++;
    } else if (c === ' ' || c === '\t' || c === '\r') {
      endToken(i);
      i++;
    } else if (c === ';' || c === '|' || c === '(' || c === ')') {
      const sep = command.startsWith('||', i) ? '||' : c;
      endSegment(sep, i);
      i += sep.length;
    } else if ((c === '{' && !started && (i + 1 === n || /[\s;&|(){}]/.test(command[i + 1]))) || (c === '}' && !started)) {
      endSegment(c, i);
      i++;
    } else if (c === '&') {
      if (current.endsWith('>') || command[i + 1] === '>') {
        startToken(i);
        current += c;
        i++;
      } else if (command.startsWith('&&', i)) {
        endSegment('&&', i);
        i += 2;
      } else if (tokens.length === 0 && !started) {
        tokens.push('&');
        rawTokens.push('&');
        tokenOffsets.push(i);
        prevTokenQuoted = false;
        i++;
      } else {
        endSegment('&', i);
        i++;
      }
    } else {
      markUnquotedScan(i, n);
      startToken(i);
      current += c;
      i++;
    }
  }
  endSegment(null, n);
  return {
    segments,
    separators,
    sawComment,
    hasRawNewline,
    hasSubexprInDoubleQuotes,
    hasExpandableHereStringWithDollar,
    hasBashSubst,
    hasPsSubexpr,
    hasEnvBraced,
    hasDotNetEnv,
    hasNonSemiSep,
    hasEnclosingOrPipeOrBg,
    hasControlKeyword,
  };
}

/**
 * The command as segments of tokens. Backwards-compatible public export.
 */
export function segmentsOf(command, bash) {
  return tokenizeMode(command, bash).segments.map(s => s.tokens);
}

// Words that only wrap the command that follows them.
const WRAPPERS = new Set(['&', 'time', 'call']);
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const ENV_BIN = /^env(?:\.exe)?$/i;
const MISE = /^mise(?:\.exe)?$/i;
const NPX = /^npx(?:\.cmd|\.exe)?$/i;
const base = t => t.slice(Math.max(t.lastIndexOf('/'), t.lastIndexOf('\\')) + 1);

/**
 * Parse `env` options starting at `start` (pointing to the `env` token).
 * Returns `{ next, dirs, cleared, unsets, inlineRawIdx, splitArg, unknownFlag }`.
 */
function scanEnvWrapper(tokens, start) {
  let i = start + 1;
  const dirs = [];
  let cleared = false;
  const unsets = [];
  const inlineIndices = [];
  let splitArg = null;
  let hasSplit = false;
  let unknownFlag = false;

  while (tokens[i] !== undefined) {
    const t = tokens[i];
    if (ASSIGNMENT.test(t)) {
      inlineIndices.push(i);
      i++;
      continue;
    }
    if (t === '--') {
      i++;
      break;
    }
    if (!t.startsWith('-')) break;
    if (t === '-' || t === '-i' || t === '--ignore-environment') {
      cleared = true;
      i++;
    } else if (t === '-0' || t === '--null' || t === '-v' || t === '--debug') {
      i++;
    } else if (t === '-u' || t === '--unset') {
      if (tokens[i + 1] !== undefined) unsets.push(tokens[i + 1]);
      i += 2;
    } else if (t.startsWith('--unset=')) {
      unsets.push(t.slice('--unset='.length));
      i++;
    } else if (t === '-C' || t === '--chdir') {
      if (tokens[i + 1] === undefined) {
        unknownFlag = true;
        break;
      }
      dirs.push(tokens[i + 1]);
      i += 2;
    } else if (t.startsWith('--chdir=')) {
      dirs.push(t.slice('--chdir='.length));
      i++;
    } else if (t === '-a' || t === '--argv0') {
      i += 2;
    } else if (t.startsWith('--argv0=')) {
      i++;
    } else if (t === '-S' || t === '--split-string') {
      hasSplit = true;
      splitArg = tokens[i + 1] ?? '';
      break;
    } else if (t.startsWith('--split-string=')) {
      hasSplit = true;
      splitArg = t.slice('--split-string='.length);
      break;
    } else if (/^-[A-Za-z0-9]+$/.test(t) || /^-[uCaS].+/.test(t)) {
      let k = 1;
      let bad = false;
      let step = 1;
      while (k < t.length) {
        const ch = t[k];
        if (ch === 'i' || ch === '0' || ch === 'v') {
          if (ch === 'i') cleared = true;
          k++;
        } else if (ch === 'u' || ch === 'C' || ch === 'a' || ch === 'S') {
          const val = k + 1 < t.length ? t.slice(k + 1) : tokens[i + 1];
          if (ch === 'u') {
            if (val !== undefined) unsets.push(val);
            if (k + 1 >= t.length) step = 2;
          } else if (ch === 'C') {
            if (val === undefined) {
              bad = true;
              break;
            }
            dirs.push(val);
            if (k + 1 >= t.length) step = 2;
          } else if (ch === 'a') {
            if (k + 1 >= t.length) step = 2;
          } else if (ch === 'S') {
            hasSplit = true;
            splitArg = val ?? '';
          }
          break;
        } else {
          bad = true;
          break;
        }
      }
      if (bad || hasSplit) {
        if (bad) unknownFlag = true;
        break;
      }
      i += step;
    } else {
      unknownFlag = true;
      break;
    }
  }
  return { next: i, dirs, cleared, unsets, inlineIndices, hasSplit, splitArg, unknownFlag };
}

const FAST_LOWER_PROG_RE = /^[a-z0-9-]+$/;
/** The index of the program a segment runs, past its wrappers; the segment's length when there is none. */
export function programAt(tokens) {
  let i = 0;
  // Once no `--` lies ahead, none will for a later `mise` either; without this a long line of them is quadratic.
  let noDashes = false;
  for (;;) {
    const t = tokens[i];
    if (t === undefined) return tokens.length;
    if (WRAPPERS.has(t) || (t.includes('=') && ASSIGNMENT.test(t))) i++;
    else if (t.length >= 3 && ENV_BIN.test(base(t))) {
      const ev = scanEnvWrapper(tokens, i);
      if (ev.hasSplit || ev.unknownFlag) return i;
      i = ev.next;
    } else if (t.charCodeAt(0) === 36 /* $ */ && tokens[i + 1] === '=') i += 2;
    else if (t === 'timeout') {
      i++;
      if (/^[\d.]+[smhd]?$/.test(tokens[i] ?? '')) i++;
    } else if (t.length >= 4 && MISE.test(base(t)) && /^(?:x|exec)$/.test(tokens[i + 1] ?? '')) {
      // The command is what follows mise's own `--`; without one, it follows
      // the options and the tool@version words.
      i += 2;
      const dashes = noDashes ? -1 : tokens.indexOf('--', i);
      if (dashes !== -1) i = dashes + 1;
      else {
        noDashes = true;
        while (tokens[i] !== undefined && (tokens[i].startsWith('-') || tokens[i].includes('@'))) i++;
      }
    } else if (t.length >= 3 && NPX.test(base(t))) {
      i++;
      while (tokens[i]?.startsWith('-')) i += tokens[i] === '-p' || tokens[i] === '--package' ? 2 : 1;
    } else return i;
  }
}

/** A program word as a rule names it: no folder, no `@version`, no Windows extension, lower case. */
const programName = t => (FAST_LOWER_PROG_RE.test(t) ? t : base(t).replace(/@[^@]*$/, '').replace(/\.(?:exe|cmd|bat|ps1)$/i, '').toLowerCase());

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

// ------------------------------------------------------------ rule table parsing

const ID_RE = /^[a-z0-9-]{1,64}$/;
const isWords = v => Array.isArray(v) && v.length > 0 && v.every(w => typeof w === 'string' && w !== '');
const isPlainObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isId = n => Number.isSafeInteger(n) && n > 0;
const sameKeys = (o, keys) => isPlainObject(o) && Object.keys(o).length === keys.length && keys.every(k => Object.hasOwn(o, k));

const SHAPES = {
  words: v => isWords(v) && v[0] !== '*' && v.at(-1) !== '*',
  contains: isWords,
};

function validateRules(rules) {
  if (!Array.isArray(rules)) fail('table');
  for (const r of rules) {
    const ok = isPlainObject(r) && typeof r.id === 'string' && ID_RE.test(r.id) && (r.decision === 'deny' || r.decision === 'ask');
    const kinds = ok ? Object.keys(SHAPES).filter(k => Object.hasOwn(r, k)) : [];
    if (kinds.length !== 1 || !SHAPES[kinds[0]](r[kinds[0]])) fail('table');
  }
  return rules;
}

/** The rule table's text as its rules; backwards-compatible with callers before Spec 0009. */
export function parseTable(text) {
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    fail('table');
  }
  if (!isPlainObject(doc)) fail('table');
  return validateRules(doc.rules);
}

/** Strict rule-table document parser validating `rules` and optional `identity` block. */
export function parseTableDoc(text) {
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    fail('table');
  }
  if (!isPlainObject(doc) || !Object.hasOwn(doc, 'rules')) fail('table');
  if (!Object.keys(doc).every(k => k === 'rules' || k === 'identity')) fail('table');
  const rules = validateRules(doc.rules);
  let identity = null;
  if (Object.hasOwn(doc, 'identity')) {
    const id = doc.identity;
    if (!sameKeys(id, ['enabled', 'posterOn']) || id.enabled !== true || typeof id.posterOn !== 'boolean') fail('table');
    identity = { enabled: true, posterOn: id.posterOn };
  }
  return { rules, identity };
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
  return firstMet(rules, rule => segments.some(s => (rule.words ? wordsMatch(s.tokens, s.at, rule.words) : containsMatch(s.text, rule.contains))));
}

/** `judgeBy` on the text and the table beside this file, once the text is one the guard reads. */
function against(text, judgeBy, tableFile) {
  if (typeof text !== 'string') fail('call');
  if (text.length > COMMAND_MAX) fail('size');
  let table;
  try {
    table = readFileSync(tableFile, 'utf8');
  } catch {
    fail('table');
  }
  return judgeBy(text, parseTable(table));
}

const TABLE = new URL('./rules.json', import.meta.url);
/** The answer to one command: null, or { decision, id }. */
export const answer = (command, tableFile = TABLE) => against(command, judge, tableFile);

// ------------------------------------------------------------ bounded file & pin reads

function readBounded(filePath, maxBytes) {
  let fd;
  try {
    fd = openSync(filePath, 'r');
    const buf = Buffer.allocUnsafe(maxBytes + 1);
    let total = 0;
    while (total <= maxBytes) {
      const n = readSync(fd, buf, total, maxBytes + 1 - total, total);
      if (n === 0) break;
      total += n;
    }
    if (total > maxBytes) return null;
    return buf.subarray(0, total).toString('utf8');
  } catch {
    return null;
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // ignore close failure
      }
    }
  }
}

function resolvePinPath(tableFile, pinFile) {
  if (pinFile !== undefined) return pinFile instanceof URL ? fileURLToPath(pinFile) : String(pinFile);
  const tbl = tableFile instanceof URL ? fileURLToPath(tableFile) : String(tableFile);
  return `${dirname(dirname(tbl))}/github.json`.replaceAll('\\', '/');
}

function readPinFile(pinPath) {
  let st;
  try {
    st = lstatSync(pinPath);
  } catch (e) {
    if (e?.code === 'ENOENT') return null;
    fail('pin');
  }
  if (st.isSymbolicLink() || !st.isFile()) fail('pin');
  const text = readBounded(pinPath, PIN_MAX);
  if (text === null) fail('pin');
  let pin;
  try {
    pin = JSON.parse(text);
  } catch {
    fail('pin');
  }
  if (!sameKeys(pin, ['owner', 'apps']) || !sameKeys(pin.owner, ['login', 'id']) || !LOGIN_RE.test(pin.owner.login ?? '') || !isId(pin.owner.id) || !isPlainObject(pin.apps)) {
    fail('pin');
  }
  for (const [p, a] of Object.entries(pin.apps)) {
    if (!PROVIDERS.includes(p) || !sameKeys(a, ['app_id', 'slug', 'bot_login', 'bot_id'])) fail('pin');
    if (!isId(a.app_id) || !isId(a.bot_id) || typeof a.slug !== 'string' || !SLUG_RE.test(a.slug) || a.bot_login !== `${a.slug}[bot]`) fail('pin');
  }
  return pin;
}

// ------------------------------------------------------------ env & path helpers

const getEnvVar = (env, name, isWin) => {
  if (!env || typeof env !== 'object') return undefined;
  if (!isWin) return typeof env[name] === 'string' ? env[name] : undefined;
  const upper = name.toUpperCase();
  for (const [k, v] of Object.entries(env)) {
    if (k.toUpperCase() === upper && typeof v === 'string') return v;
  }
  return undefined;
};

const normComparePath = (p, isWin) => {
  const slashed = p.replaceAll('\\', '/');
  const normalized = posix.normalize(slashed);
  const trimmed = normalized.length > 1 && normalized.endsWith('/') && !/^[A-Za-z]:\/$/.test(normalized) ? normalized.slice(0, -1) : normalized;
  return isWin ? trimmed.toLowerCase() : trimmed;
};

const isGitHubHost = host => host === 'github.com' || host.endsWith('.github.com');

function normalizeHost(raw) {
  if (typeof raw !== 'string') return null;
  const h = raw.toLowerCase().replace(/\.+$/, '');
  return HOST_RE.test(h) ? h : null;
}

// ------------------------------------------------------------ segment inspection (env / git / gh)

function inspectEnvSplitOrUnknown(tokens, envIdx) {
  const ev = scanEnvWrapper(tokens, envIdx);
  if (!ev.hasSplit && !ev.unknownFlag) return null;
  const tail = tokens.slice(ev.hasSplit ? envIdx + 1 : ev.next);
  const hasGhTok = tail.some(t => programName(t) === 'gh');
  const hasGitTok = tail.some(t => programName(t) === 'git');
  if (ev.hasSplit) {
    const arg = ev.splitArg ?? '';
    const badSplit = arg === '' || /[\\$'"`;|&(){}<>\r\n=]/.test(arg) || /\bgh\b/i.test(arg) || /\bgit\b/i.test(arg);
    const kind = hasGhTok || /\bgh\b/i.test(arg) ? 'gh' : hasGitTok || /\bgit\b/i.test(arg) ? 'git' : badSplit ? 'ambiguous' : null;
    return { type: 'env-split', kind, hasGhTok, hasGitTok, badSplit };
  }
  // Unknown env flag: scan remaining tokens in segment.
  if (hasGhTok) return { type: 'env-unknown', kind: 'gh' };
  if (hasGitTok) return { type: 'env-unknown', kind: 'git' };
  return null;
}

function parseGitSegment(tokens, at) {
  const args = tokens.slice(at + 1);
  if (args.length === 1 && (args[0] === '--version' || args[0] === '--help')) {
    return { isGuarded: false };
  }
  let i = 0;
  const dirs = [];
  const cOpts = [];
  let hasGitDirOpt = false;
  let hasConfigEnvOpt = false;
  let hasExecPathOpt = false;
  let hasUnknownLeadingOpt = false;

  while (i < args.length) {
    const t = args[i];
    if (!t.startsWith('-') || t === '-') break;
    if (t === '--') {
      hasUnknownLeadingOpt = true;
      break;
    }
    if (t === '-C') {
      if (i + 1 >= args.length) {
        hasUnknownLeadingOpt = true;
        break;
      }
      dirs.push(args[i + 1]);
      i += 2;
    } else if (t.startsWith('-C') && t.length > 2) {
      dirs.push(t.slice(2));
      i++;
    } else if (t === '-c') {
      if (i + 1 >= args.length) {
        hasUnknownLeadingOpt = true;
        break;
      }
      cOpts.push({ rawIdx: at + 1 + i + 1, val: args[i + 1] });
      i += 2;
    } else if (t.startsWith('-c') && t.length > 2) {
      cOpts.push({ rawIdx: at + 1 + i, val: t.slice(2) });
      i++;
    } else if (t === '--exec-path') {
      hasExecPathOpt = true;
      i++;
    } else if (t.startsWith('--exec-path=')) {
      hasExecPathOpt = true;
      i++;
    } else if (
      t === '--git-dir' || t === '--work-tree' || t === '--namespace' ||
      t === '--config-env' || t === '--super-prefix' || t === '--list-cmds' || t === '--attr-source'
    ) {
      if (t === '--git-dir') hasGitDirOpt = true;
      if (t === '--config-env') hasConfigEnvOpt = true;
      if (i + 1 >= args.length) {
        hasUnknownLeadingOpt = true;
        break;
      }
      i += 2;
    } else if (
      t.startsWith('--git-dir=') || t.startsWith('--work-tree=') || t.startsWith('--namespace=') ||
      t.startsWith('--config-env=') || t.startsWith('--super-prefix=') || t.startsWith('--list-cmds=') || t.startsWith('--attr-source=')
    ) {
      if (t.startsWith('--git-dir=')) hasGitDirOpt = true;
      if (t.startsWith('--config-env=')) hasConfigEnvOpt = true;
      i++;
    } else if (GIT_GLOBAL_NOARG_OPTS.has(t)) {
      i++;
    } else {
      hasUnknownLeadingOpt = true;
      break;
    }
  }

  const subcmd = !hasUnknownLeadingOpt && i < args.length && !args[i].startsWith('-') ? args[i] : null;
  const subArgs = subcmd ? args.slice(i + 1) : [];
  const isGuarded = hasUnknownLeadingOpt || (subcmd !== null && GIT_WRITE_SUBCOMMANDS.has(subcmd));
  return { isGuarded, dirs, cOpts, hasGitDirOpt, hasConfigEnvOpt, hasExecPathOpt, hasUnknownLeadingOpt, subcmd, subArgs };
}

function parseGitPushTarget(subArgs) {
  let i = 0;
  let repoOpt = null;
  let unknownFlag = false;
  let positionalRepo = null;
  let afterDashes = false;

  while (i < subArgs.length) {
    const t = subArgs[i];
    if (!afterDashes && t === '--') {
      afterDashes = true;
      i++;
      continue;
    }
    if (!afterDashes && t.startsWith('-') && t !== '-') {
      if (GIT_PUSH_NOARG_OPTS.has(t)) {
        i++;
      } else if (GIT_PUSH_EQ_ONLY_OPTS.has(t) || t.startsWith('--force-with-lease=') || t.startsWith('--recurse-submodules=') || t.startsWith('--signed=')) {
        i++;
      } else if (GIT_PUSH_VALUE_OPTS.has(t)) {
        if (i + 1 >= subArgs.length) {
          unknownFlag = true;
          break;
        }
        if (t === '--repo') repoOpt = subArgs[i + 1];
        i += 2;
      } else if (t.startsWith('-o') && t.length > 2) {
        i++;
      } else if (t.startsWith('--push-option=') || t.startsWith('--receive-pack=') || t.startsWith('--exec=') || t.startsWith('--repo=')) {
        if (t.startsWith('--repo=')) repoOpt = t.slice('--repo='.length);
        i++;
      } else {
        unknownFlag = true;
        break;
      }
    } else {
      positionalRepo = t;
      break;
    }
  }
  return { unknownFlag, target: positionalRepo ?? repoOpt, fromPositional: positionalRepo !== null };
}

// ------------------------------------------------------------ gh parsing

/** Shared `gh api` parser used by both `isGhWrite` and `ownerScope`. */
function parseGhApi(restArgs) {
  let i = 0;
  let afterDashes = false;
  let sawHelp = false;
  let unknownFlag = false;
  let endpoint = null;
  let lastMethod = null;
  let nonReadMethod = false;
  let hasWriteField = false;
  let hasInput = false;
  let hasAtFile = false;
  const fieldValues = [];
  const extraPositional = [];
  const apiHostnames = [];

  const recordMethod = val => {
    const m = val.toUpperCase();
    lastMethod = m;
    if (m !== 'GET' && m !== 'HEAD') nonReadMethod = true;
  };

  while (i < restArgs.length) {
    const t = restArgs[i];
    if (!afterDashes && t === '--') {
      afterDashes = true;
      i++;
      continue;
    }
    if (!afterDashes && t.startsWith('-') && t !== '-') {
      if (GH_API_NOARG_FLAGS.has(t)) {
        if (t === '--help') sawHelp = true;
        i++;
        continue;
      }
      if (GH_API_VALUE_FLAGS.has(t)) {
        if (i + 1 >= restArgs.length) {
          unknownFlag = true;
          break;
        }
        const val = restArgs[i + 1];
        if (t === '-X' || t === '--method') recordMethod(val);
        else if (t === '--hostname') apiHostnames.push(val);
        else if (GH_API_WRITE_FLAGS.has(t)) {
          hasWriteField = true;
          fieldValues.push(val);
          if (t === '--input') hasInput = true;
          if ((t === '-F' || t === '--field') && val.includes('@')) hasAtFile = true;
        }
        i += 2;
        continue;
      }
      // Attached short or `--opt=val` forms
      if (t.startsWith('-X') && t.length > 2) {
        recordMethod(t.slice(2));
        i++;
      } else if (t.startsWith('--method=')) {
        recordMethod(t.slice('--method='.length));
        i++;
      } else if (t.startsWith('--hostname=')) {
        apiHostnames.push(t.slice('--hostname='.length));
        i++;
      } else if (t.startsWith('-f') && t.length > 2) {
        hasWriteField = true;
        fieldValues.push(t.slice(2));
        i++;
      } else if (t.startsWith('--raw-field=')) {
        hasWriteField = true;
        fieldValues.push(t.slice('--raw-field='.length));
        i++;
      } else if (t.startsWith('-F') && t.length > 2) {
        const val = t.slice(2);
        hasWriteField = true;
        fieldValues.push(val);
        if (val.includes('@')) hasAtFile = true;
        i++;
      } else if (t.startsWith('--field=')) {
        const val = t.slice('--field='.length);
        hasWriteField = true;
        fieldValues.push(val);
        if (val.includes('@')) hasAtFile = true;
        i++;
      } else if (t.startsWith('--input=')) {
        hasWriteField = true;
        hasInput = true;
        fieldValues.push(t.slice('--input='.length));
        i++;
      } else if (
        (t.startsWith('-H') && t.length > 2) || (t.startsWith('-q') && t.length > 2) ||
        (t.startsWith('-t') && t.length > 2) || t.startsWith('--header=') ||
        t.startsWith('--jq=') || t.startsWith('--template=') ||
        t.startsWith('--cache=') || t.startsWith('--preview=')
      ) {
        i++;
      } else if (/^-[pih]+$/.test(t)) {
        // Pure short no-arg flags bundled cleanly
        i++;
      } else {
        unknownFlag = true;
        i++;
      }
      continue;
    }

    if (endpoint === null) endpoint = t;
    else extraPositional.push(t);
    i++;
  }

  return { sawHelp, unknownFlag, endpoint, lastMethod, nonReadMethod, hasWriteField, hasInput, hasAtFile, fieldValues, extraPositional, apiHostnames };
}

function consumeGhGlobalFlag(args, idx, repos, hostnames) {
  const t = args[idx];
  if (t === '-R' || t === '--repo') {
    if (idx + 1 >= args.length) return { matched: true, ok: false, next: idx + 1 };
    repos.push(args[idx + 1]);
    return { matched: true, ok: true, next: idx + 2 };
  }
  if (t.startsWith('-R') && t.length > 2) {
    repos.push(t.slice(2));
    return { matched: true, ok: true, next: idx + 1 };
  }
  if (t.startsWith('--repo=')) {
    repos.push(t.slice('--repo='.length));
    return { matched: true, ok: true, next: idx + 1 };
  }
  if (t === '--hostname') {
    if (idx + 1 >= args.length) return { matched: true, ok: false, next: idx + 1 };
    hostnames.push(args[idx + 1]);
    return { matched: true, ok: true, next: idx + 2 };
  }
  if (t.startsWith('--hostname=')) {
    hostnames.push(t.slice('--hostname='.length));
    return { matched: true, ok: true, next: idx + 1 };
  }
  return { matched: false };
}

function parseGhSegment(tokens, at) {
  const args = tokens.slice(at + 1);
  if (args.length === 0) return { isWrite: false };

  const globalRepos = [];
  const globalHostnames = [];
  let idx = 0;

  while (idx < args.length) {
    const g = consumeGhGlobalFlag(args, idx, globalRepos, globalHostnames);
    if (g.matched) {
      if (!g.ok) return { isWrite: true, accountScoped: true, unknownFlag: true };
      idx = g.next;
      continue;
    }
    break;
  }

  if (idx >= args.length) return { isWrite: false };
  if (args[idx] === '-h' && idx === args.length - 1) return { isWrite: false };
  if (args[idx] === '--help' || args[idx] === '--version') return { isWrite: false };
  if (args[idx].startsWith('-')) return { isWrite: true, accountScoped: true, unknownFlag: true };

  const group = args[idx];
  if (GH_READ_ONLY_GROUPS.has(group) || GH_EXEMPT_GROUPS.has(group)) return { isWrite: false };

  const restArgs = args.slice(idx + 1);
  if (group === 'api') {
    const api = parseGhApi(restArgs);
    if (api.sawHelp && !api.unknownFlag) return { isWrite: false };
    let isWrite;
    if (api.unknownFlag || api.endpoint === null) {
      isWrite = true;
    } else {
      const epNoQf = api.endpoint.split(/[?#]/, 1)[0];
      if (/^\/?graphql$/.test(epNoQf)) {
        isWrite = api.nonReadMethod || api.hasInput || api.hasAtFile || [api.endpoint, ...api.fieldValues, ...api.extraPositional].some(v => /\bmutation\b/i.test(v));
      } else if (api.nonReadMethod || (api.lastMethod !== null && api.lastMethod !== 'GET' && api.lastMethod !== 'HEAD')) {
        isWrite = true;
      } else if (api.lastMethod !== null) {
        isWrite = false;
      } else {
        isWrite = api.hasWriteField;
      }
    }
    if (!isWrite) return { isWrite: false };
    return {
      isWrite: true,
      group: 'api',
      verb: null,
      isFreeText: false,
      api,
      globalRepos,
      hostnames: [...globalHostnames, ...api.apiHostnames],
      unknownFlag: api.unknownFlag,
    };
  }

  // Group with verb
  const readVerbs = GH_READ_VERBS[group];
  if (!readVerbs) {
    // Strict -h / --help directly after unlisted group
    if (restArgs.length === 1 && restArgs[0] === '-h' && group !== 'auth') return { isWrite: false };
    if (restArgs.length >= 1 && restArgs[0] === '--help') return { isWrite: false };
    return { isWrite: true, group, verb: null, isFreeText: false, accountScoped: true, globalRepos, hostnames: globalHostnames, restArgs };
  }

  let k = 0;
  while (k < restArgs.length) {
    const g = consumeGhGlobalFlag(restArgs, k, globalRepos, globalHostnames);
    if (g.matched) {
      if (!g.ok) return { isWrite: true, group, verb: null, isFreeText: false, accountScoped: true, unknownFlag: true };
      k = g.next;
      continue;
    }
    break;
  }

  if (k >= restArgs.length) return { isWrite: true, group, verb: null, isFreeText: false, accountScoped: true };
  if (restArgs[k] === '-h' && k === restArgs.length - 1 && group !== 'auth') return { isWrite: false };
  if (restArgs[k] === '--help') return { isWrite: false };
  if (restArgs[k].startsWith('-')) return { isWrite: true, group, verb: null, isFreeText: false, accountScoped: true, unknownFlag: true };

  const verb = restArgs[k];
  const afterVerb = restArgs.slice(k + 1);

  // Strict -h / --help immediately after verb (skipping only GH_GLOBAL_VALUE_FLAGS)
  let hIdx = 0;
  const checkRepos = [...globalRepos];
  const checkHosts = [...globalHostnames];
  while (hIdx < afterVerb.length) {
    const g = consumeGhGlobalFlag(afterVerb, hIdx, checkRepos, checkHosts);
    if (g.matched && g.ok) {
      hIdx = g.next;
      continue;
    }
    break;
  }
  if (hIdx < afterVerb.length) {
    if (afterVerb[hIdx] === '-h' && hIdx === afterVerb.length - 1 && group !== 'auth') return { isWrite: false };
    if (afterVerb[hIdx] === '--help') return { isWrite: false };
  }

  if (readVerbs.has(verb)) {
    if (group === 'auth' && verb === 'status') {
      const hasShowToken = restArgs.slice(0, restArgs.includes('--') ? restArgs.indexOf('--') : restArgs.length)
        .some(tok => /^-[A-Za-z]*t/.test(tok) || tok === '--show-token' || tok.startsWith('--show-token='));
      if (hasShowToken) {
        return { isWrite: true, group, verb, isFreeText: false, accountScoped: true, globalRepos, hostnames: globalHostnames, afterVerb };
      }
    }
    return { isWrite: false };
  }

  const isFreeText = Boolean(GH_FREE_TEXT_WRITES[group]?.has(verb));
  return { isWrite: true, group, verb, isFreeText, accountScoped: false, globalRepos, hostnames: globalHostnames, restArgs, afterVerb };
}

// ------------------------------------------------------------ URL, shorthand & repo-owner scoping

function resolveOwnerMatch(host, owner, ownerLogin) {
  if (!isGitHubHost(host)) return false;
  if (!LOGIN_RE.test(owner)) return true;
  return owner.toLowerCase() === ownerLogin.toLowerCase();
}

function evalRepoUrl(raw, ownerLogin) {
  if (typeof raw !== 'string' || raw === '' || /\s/.test(raw)) return { ok: false };
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    if (!/^(?:https?|ssh|git):\/\//i.test(raw)) return { ok: false };
    const afterScheme = raw.slice(raw.indexOf('://') + 3);
    const slashIdx = afterScheme.indexOf('/');
    if (slashIdx === -1) return { ok: false };
    const rawPath = afterScheme.slice(slashIdx).split(/[?#]/, 1)[0];
    if (rawPath.includes('//') || rawPath.includes('%')) return { ok: false };
    const trimmed = rawPath.endsWith('/') && rawPath.length > 1 ? rawPath.slice(1, -1) : rawPath.slice(1);
    const segs = trimmed.split('/');
    if (segs.length < 2 || segs.some(s => s === '' || s === '.' || s === '..')) return { ok: false };
    let u;
    try {
      u = new URL(raw);
    } catch {
      return { ok: false };
    }
    const host = u.hostname.toLowerCase().replace(/\.+$/, '');
    if (!host) return { ok: false };
    return { ok: true, host, owner: segs[0], match: resolveOwnerMatch(host, segs[0], ownerLogin) };
  }
  const scp = /^[^@/\s]+@([^:@/\s]+):([^/\s].*)$/.exec(raw);
  if (scp) {
    const host = scp[1].toLowerCase().replace(/\.+$/, '');
    const rawPath = scp[2];
    if (!host || rawPath.includes('//') || rawPath.includes('%')) return { ok: false };
    const trimmed = rawPath.endsWith('/') && rawPath.length > 1 ? rawPath.slice(0, -1) : rawPath;
    const segs = trimmed.split('/');
    if (segs.length < 2 || segs.some(s => s === '' || s === '.' || s === '..')) return { ok: false };
    return { ok: true, host, owner: segs[0], match: resolveOwnerMatch(host, segs[0], ownerLogin) };
  }
  return { ok: false };
}

function evalRepoShorthand(raw, ownerLogin) {
  if (typeof raw !== 'string' || raw === '' || /\s/.test(raw)) return { ok: false };
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) || /^[^@/\s]+@[^:@/\s]+:/.test(raw)) {
    return evalRepoUrl(raw, ownerLogin);
  }
  if (raw.includes('%') || raw.includes('//')) return { ok: false };
  const segs = raw.split('/');
  if (segs.some(s => s === '' || s === '.' || s === '..')) return { ok: false };
  if (segs.length === 2) {
    if (!LOGIN_RE.test(segs[0])) return { ok: false };
    return { ok: true, host: 'github.com', owner: segs[0], match: segs[0].toLowerCase() === ownerLogin.toLowerCase() };
  }
  if (segs.length === 3) {
    const host = normalizeHost(segs[0]);
    if (!host || !LOGIN_RE.test(segs[1])) return { ok: false };
    return { ok: true, host, owner: segs[1], match: resolveOwnerMatch(host, segs[1], ownerLogin) };
  }
  return { ok: false };
}

// ------------------------------------------------------------ Step 2: plain-text .git/config & symlink guard

function rejectUnsafePathShape(rawPath, isWin) {
  if (typeof rawPath !== 'string' || rawPath === '' || /\0/.test(rawPath)) return true;
  if (/^[\\/]{2}/.test(rawPath) || /^[\\/]\?\?[\\/]/.test(rawPath)) return true;
  if (/^[A-Za-z]:(?![\\/])/.test(rawPath)) return true;
  if (isWin && /^[\\/]/.test(rawPath)) return true;
  return false;
}

function parseRootAndParts(rawPath, isWin) {
  if (isWin) {
    const m = /^([A-Za-z]:)[\\/](.*)$/.exec(rawPath);
    if (m) return { isAbs: true, root: `${m[1]}/`, parts: m[2].split(/[\\/]+/) };
    return { isAbs: false, root: null, parts: rawPath.split(/[\\/]+/) };
  }
  if (rawPath.startsWith('/')) return { isAbs: true, root: '/', parts: rawPath.slice(1).split(/\/+/) };
  return { isAbs: false, root: null, parts: rawPath.split(/\/+/) };
}

function splitAbsPath(absPath, isWin) {
  const { root, parts } = parseRootAndParts(absPath, isWin);
  return { root, parts: parts.filter(p => p !== '' && p !== '.') };
}

function buildAbsPath(root, parts) {
  if (parts.length === 0) return root;
  return root.endsWith('/') ? `${root}${parts.join('/')}` : `${root}/${parts.join('/')}`;
}

/**
 * Resolve `rawPath` relative to `baseAbs` checking every directory component
 * via `lstatSync` BEFORE collapsing `..`, rejecting symlinks/junctions/UNC paths.
 */
function resolveNoSymlinks(baseAbs, rawPath, platform, { expectDir = false, expectFile = false } = {}) {
  const isWin = platform === 'win32';
  if (rejectUnsafePathShape(rawPath, isWin)) return null;
  const parsed = parseRootAndParts(rawPath, isWin);
  let root;
  let curParts;

  if (parsed.isAbs) {
    root = parsed.root;
    curParts = [];
  } else {
    if (typeof baseAbs !== 'string' || rejectUnsafePathShape(baseAbs, isWin)) return null;
    const baseParsed = parseRootAndParts(baseAbs, isWin);
    if (!baseParsed.isAbs) return null;
    // Verify baseAbs itself from root down first
    const verifiedBase = resolveNoSymlinks(null, baseAbs, platform, { expectDir: true });
    if (!verifiedBase) return null;
    const split = splitAbsPath(verifiedBase, isWin);
    root = split.root;
    curParts = split.parts;
  }

  // Verify starting root directory
  try {
    const rst = lstatSync(root);
    if (rst.isSymbolicLink() || !rst.isDirectory()) return null;
  } catch {
    return null;
  }

  const meaningful = parsed.parts.filter(p => p !== '' && p !== '.');
  for (let i = 0; i < meaningful.length; i++) {
    const seg = meaningful[i];
    const isLast = i === meaningful.length - 1;
    if (seg === '..') {
      const curPath = buildAbsPath(root, curParts);
      try {
        const st = lstatSync(curPath);
        if (st.isSymbolicLink() || !st.isDirectory()) return null;
      } catch {
        return null;
      }
      if (curParts.length > 0) curParts.pop();
    } else {
      curParts.push(seg);
      const nextPath = buildAbsPath(root, curParts);
      let st;
      try {
        st = lstatSync(nextPath);
      } catch {
        return null;
      }
      if (st.isSymbolicLink()) return null;
      if (!isLast) {
        if (!st.isDirectory()) return null;
      } else {
        if (expectDir && !st.isDirectory()) return null;
        if (expectFile && !st.isFile()) return null;
      }
    }
  }

  const finalPath = buildAbsPath(root, curParts);
  try {
    const fst = lstatSync(finalPath);
    if (fst.isSymbolicLink()) return null;
    if (expectDir && !fst.isDirectory()) return null;
    if (expectFile && !fst.isFile()) return null;
    const real = realpathSync(finalPath);
    if (/^[\\/]{2}/.test(real)) return null;
  } catch {
    return null;
  }
  return finalPath;
}

function parentOf(dirPath, isWin) {
  const { root, parts } = splitAbsPath(dirPath, isWin);
  if (parts.length === 0) return dirPath;
  return buildAbsPath(root, parts.slice(0, -1));
}

function parseGitIni(text) {
  let hasInclude = false;
  let hasUrlRewrite = false;
  let worktreeConfigRaw;
  let remotePushDefault = false;
  let hasBranchRemote = false;
  let hasGhResolved = false;
  const remotes = new Map();

  const ensureRemote = name => {
    let r = remotes.get(name);
    if (!r) {
      r = { urls: [], pushurls: [] };
      remotes.set(name, r);
    }
    return r;
  };

  let curSection = '';
  let curSub = '';
  const lines = text.split(/\r?\n/);

  for (let li = 0; li < lines.length; li++) {
    let line = lines[li];
    // Handle trailing line continuation outside comments
    while (line.endsWith('\\') && li + 1 < lines.length) {
      line = line.slice(0, -1) + lines[++li];
    }
    const trimmed = line.trim();
    if (!trimmed || trimmed[0] === '#' || trimmed[0] === ';') continue;

    if (trimmed[0] === '[') {
      const closeIdx = trimmed.indexOf(']');
      if (closeIdx === -1) return { invalid: true };
      const header = trimmed.slice(1, closeIdx).trim();
      const qStart = header.indexOf('"');
      if (qStart === -1) {
        const dot = header.indexOf('.');
        if (dot === -1) {
          curSection = header.toLowerCase();
          curSub = '';
        } else {
          curSection = header.slice(0, dot).trim().toLowerCase();
          curSub = header.slice(dot + 1).trim();
        }
      } else {
        curSection = header.slice(0, qStart).trim().toLowerCase();
        const qEnd = header.lastIndexOf('"');
        if (qEnd <= qStart) return { invalid: true };
        curSub = header.slice(qStart + 1, qEnd).replace(/\\(.)/g, '$1');
      }
      if (curSection === 'include' || curSection === 'includeif') hasInclude = true;
      if (curSection === 'remote' && curSub) ensureRemote(curSub);
      continue;
    }

    const eqIdx = trimmed.indexOf('=');
    const key = (eqIdx === -1 ? trimmed : trimmed.slice(0, eqIdx)).trim().toLowerCase();
    let val = '';
    if (eqIdx === -1) {
      val = null;
    } else {
      const rawVal = trimmed.slice(eqIdx + 1).trimStart();
      if (rawVal.startsWith('"')) {
        let out = '';
        let k = 1;
        while (k < rawVal.length && rawVal[k] !== '"') {
          if (rawVal[k] === '\\' && k + 1 < rawVal.length) {
            const esc = rawVal[k + 1];
            out += esc === 'n' ? '\n' : esc === 't' ? '\t' : esc === 'b' ? '\b' : esc;
            k += 2;
          } else {
            out += rawVal[k++];
          }
        }
        val = out;
      } else {
        // Strip unquoted inline comment (# or ;)
        let end = rawVal.length;
        for (let k = 0; k < rawVal.length; k++) {
          if (rawVal[k] === '#' || rawVal[k] === ';') {
            end = k;
            break;
          }
        }
        val = rawVal.slice(0, end).trimEnd();
      }
    }

    if (curSection === 'url' && (key === 'insteadof' || key === 'pushinsteadof')) hasUrlRewrite = true;
    if (curSection === 'extensions' && key === 'worktreeconfig') worktreeConfigRaw = val;
    if (curSection === 'remote' && !curSub && key === 'pushdefault') remotePushDefault = true;
    if (curSection === 'branch' && (key === 'remote' || key === 'pushremote')) hasBranchRemote = true;
    if (curSection === 'remote' && curSub) {
      const rem = ensureRemote(curSub);
      if (key === 'url' && val) rem.urls.push(val);
      else if (key === 'pushurl' && val) rem.pushurls.push(val);
      else if (key === 'gh-resolved') hasGhResolved = true;
    }
  }

  return { invalid: false, hasInclude, hasUrlRewrite, worktreeConfigRaw, remotePushDefault, hasBranchRemote, hasGhResolved, remotes };
}

const isGitTruthy = v => v === null || /^(?:true|yes|on|1)$/i.test(String(v).trim());

function resolveCwdRepoScope({ cwd, dirs, explicitRemoteName, isGitPush, isGh, ownerLogin, platform }) {
  const isWin = platform === 'win32';
  if (typeof cwd !== 'string' || (isWin ? !/^[A-Za-z]:[\\/]/.test(cwd) : !cwd.startsWith('/'))) {
    return { match: true };
  }
  let targetDir = resolveNoSymlinks(null, cwd, platform, { expectDir: true });
  if (!targetDir) return { match: true };

  for (const d of dirs) {
    targetDir = resolveNoSymlinks(targetDir, d, platform, { expectDir: true });
    if (!targetDir) return { match: true };
  }

  // Walk upward to filesystem root for `.git` (continue ONLY on ENOENT)
  let dir = targetDir;
  let gitdir = null;
  let common = null;
  for (;;) {
    const sp = splitAbsPath(dir, isWin);
    const dotGit = buildAbsPath(sp.root, [...sp.parts, '.git']);
    let st;
    try {
      st = lstatSync(dotGit);
    } catch (e) {
      if (e?.code === 'ENOENT') {
        const parent = parentOf(dir, isWin);
        if (parent === dir) return { match: true };
        dir = parent;
        continue;
      }
      return { match: true };
    }
    if (st.isSymbolicLink()) return { match: true };
    if (st.isDirectory()) {
      const verified = resolveNoSymlinks(null, dotGit, platform, { expectDir: true });
      if (!verified) return { match: true };
      gitdir = verified;
      common = verified;
      break;
    }
    if (st.isFile()) {
      const content = readBounded(dotGit, GITCONFIG_MAX);
      if (content === null) return { match: true };
      const firstLine = content.split(/\r?\n/, 1)[0];
      const gm = /^gitdir:\s*(.+?)\s*$/.exec(firstLine);
      if (!gm) return { match: true };
      gitdir = resolveNoSymlinks(dir, gm[1], platform, { expectDir: true });
      if (!gitdir) return { match: true };
      const commondirFile = `${gitdir}/commondir`;
      let cst;
      try {
        cst = lstatSync(commondirFile);
      } catch (e) {
        if (e?.code === 'ENOENT') {
          common = gitdir;
          break;
        }
        return { match: true };
      }
      if (cst.isSymbolicLink() || !cst.isFile()) return { match: true };
      const cText = readBounded(commondirFile, GITCONFIG_MAX);
      if (cText === null) return { match: true };
      const cLine = cText.split(/\r?\n/, 1)[0].trim();
      common = resolveNoSymlinks(gitdir, cLine, platform, { expectDir: true });
      if (!common) return { match: true };
      break;
    }
    return { match: true };
  }

  const commonCfgPath = resolveNoSymlinks(common, 'config', platform, { expectFile: true });
  if (!commonCfgPath) return { match: true };
  const commonText = readBounded(commonCfgPath, GITCONFIG_MAX);
  if (commonText === null) return { match: true };
  const cfg = parseGitIni(commonText);
  if (cfg.invalid || cfg.hasInclude || cfg.hasUrlRewrite) return { match: true };

  if (cfg.worktreeConfigRaw !== undefined && cfg.worktreeConfigRaw !== '' && isGitTruthy(cfg.worktreeConfigRaw)) {
    const wtPath = `${gitdir}/config.worktree`;
    let wst;
    try {
      wst = lstatSync(wtPath);
    } catch (e) {
      wst = e?.code === 'ENOENT' ? null : false;
    }
    if (wst === false) return { match: true };
    if (wst !== null) {
      const verifiedWt = resolveNoSymlinks(gitdir, 'config.worktree', platform, { expectFile: true });
      if (!verifiedWt) return { match: true };
      const wtText = readBounded(verifiedWt, GITCONFIG_MAX);
      if (wtText === null) return { match: true };
      const wtCfg = parseGitIni(wtText);
      if (wtCfg.invalid || wtCfg.hasInclude || wtCfg.hasUrlRewrite) return { match: true };
      if (wtCfg.remotePushDefault) cfg.remotePushDefault = true;
      if (wtCfg.hasBranchRemote) cfg.hasBranchRemote = true;
      if (wtCfg.hasGhResolved) cfg.hasGhResolved = true;
      for (const [name, r] of wtCfg.remotes) {
        const dest = cfg.remotes.get(name) ?? { urls: [], pushurls: [] };
        dest.urls.push(...r.urls);
        dest.pushurls.push(...r.pushurls);
        cfg.remotes.set(name, dest);
      }
    }
  }

  const remoteNames = [...cfg.remotes.keys()];
  const hasNonOrigin = remoteNames.some(r => r !== 'origin');

  if (isGitPush && !explicitRemoteName) {
    if (hasNonOrigin || cfg.remotePushDefault || cfg.hasBranchRemote) return { match: true };
  }

  if (isGh && (hasNonOrigin || cfg.hasGhResolved)) {
    if (remoteNames.length === 0) return { match: true };
    for (const r of cfg.remotes.values()) {
      if (r.urls.length === 0) return { match: true };
      for (const u of r.urls) {
        const res = evalRepoUrl(u, ownerLogin);
        if (!res.ok || res.match) return { match: true };
      }
    }
    return { match: false };
  }

  const targetName = explicitRemoteName ?? 'origin';
  const targetRem = cfg.remotes.get(targetName);
  if (!targetRem) return { match: true };

  let urls;
  if (isGh) urls = targetRem.urls;
  else if (isGitPush) urls = targetRem.pushurls.length > 0 ? targetRem.pushurls : targetRem.urls;
  else urls = [...targetRem.urls, ...targetRem.pushurls];

  if (urls.length === 0) return { match: true };
  for (const u of urls) {
    const res = evalRepoUrl(u, ownerLogin);
    if (!res.ok || res.match) return { match: true };
  }
  return { match: false };
}

// ------------------------------------------------------------ Step 4: mode analysis (assignments, disqualifiers, GH_REPO, GIT_CONFIG_GLOBAL)

function unquoteBashLiteral(raw) {
  if (raw.startsWith("'") && raw.endsWith("'") && raw.length >= 2) {
    const body = raw.slice(1, -1);
    return body.includes("'") ? null : { kind: 'single', val: body };
  }
  if (raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2) {
    const body = raw.slice(1, -1);
    let out = '';
    for (let i = 0; i < body.length; i++) {
      if (body[i] === '\\' && i + 1 < body.length) {
        const nxt = body[i + 1];
        if (nxt === '"' || nxt === '\\') {
          out += nxt;
          i++;
        } else if (nxt === '$' || nxt === '`') {
          return null;
        } else {
          out += '\\';
        }
      } else if (body[i] === '`') {
        return null;
      } else {
        out += body[i];
      }
    }
    return { kind: 'double', val: out };
  }
  if (/['"`]/.test(raw) || /\\[$`]/.test(raw)) return null;
  return { kind: 'unquoted', val: raw };
}

function unquotePsLiteral(raw) {
  if (raw.startsWith("'") && raw.endsWith("'") && raw.length >= 2) {
    const body = raw.slice(1, -1);
    return { kind: 'single', val: body.replaceAll("''", "'") };
  }
  if (raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2) {
    const body = raw.slice(1, -1);
    let out = '';
    for (let i = 0; i < body.length; i++) {
      if (body[i] === '`') {
        if (i + 1 < body.length && body[i + 1] === '$') return null;
        if (i + 1 < body.length) {
          out += body[i + 1];
          i++;
        } else {
          return null;
        }
      } else if (body[i] === '"' && body[i + 1] === '"') {
        out += '"';
        i++;
      } else if (body[i] === '$' && body[i + 1] === '(') {
        return null;
      } else {
        out += body[i];
      }
    }
    return { kind: 'double', val: out };
  }
  return null;
}

function evalGitConfigRhs(rawRhs, bash, { fromEnvWrapper, expectedPath, homeDir, envHome, envUserProfile, homeTainted, userProfileTainted, isWin }) {
  if (typeof rawRhs !== 'string' || rawRhs === '') return false;
  const want = normComparePath(expectedPath, isWin);

  if (bash) {
    const uq = unquoteBashLiteral(rawRhs);
    if (!uq) return false;
    if (uq.kind === 'single') {
      if (uq.val.includes('$') || uq.val.startsWith('~')) return false;
      return normComparePath(uq.val, isWin) === want;
    }
    if (uq.val.startsWith('$HOME/') || uq.val.startsWith('$HOME\\')) {
      const rest = uq.val.slice('$HOME'.length);
      if (rest.includes('$') || !envHome || !homeDir || homeTainted) return false;
      if (normComparePath(envHome, isWin) !== normComparePath(homeDir, isWin)) return false;
      return normComparePath(`${envHome}${rest}`, isWin) === want;
    }
    if (uq.kind === 'unquoted' && uq.val.startsWith('~/')) {
      if (fromEnvWrapper) return false;
      const rest = uq.val.slice(1);
      if (rest.includes('$') || !envHome || !homeDir || homeTainted) return false;
      if (normComparePath(envHome, isWin) !== normComparePath(homeDir, isWin)) return false;
      return normComparePath(`${envHome}${rest}`, isWin) === want;
    }
    if (uq.val.includes('$')) return false;
    return normComparePath(uq.val, isWin) === want;
  }

  // PowerShell: reject all unquoted RHS paths/variables
  const uq = unquotePsLiteral(rawRhs);
  if (!uq) return false;
  if (uq.kind === 'single') {
    if (uq.val.includes('$') || uq.val.startsWith('~')) return false;
    return normComparePath(uq.val, isWin) === want;
  }
  // Double-quoted PowerShell
  if (/^\$env:userprofile(?:[\\/])/i.test(uq.val)) {
    const rest = uq.val.slice('$env:userprofile'.length);
    if (rest.includes('$') || !envUserProfile || !homeDir || userProfileTainted) return false;
    if (normComparePath(envUserProfile, isWin) !== normComparePath(homeDir, isWin)) return false;
    return normComparePath(`${envUserProfile}${rest}`, isWin) === want;
  }
  if (/^\$home(?:[\\/])/i.test(uq.val)) {
    const rest = uq.val.slice('$home'.length);
    if (rest.includes('$') || !envHome || !homeDir || homeTainted) return false;
    if (normComparePath(envHome, isWin) !== normComparePath(homeDir, isWin)) return false;
    return normComparePath(`${envHome}${rest}`, isWin) === want;
  }
  if (uq.val.includes('$')) return false;
  return normComparePath(uq.val, isWin) === want;
}

function evalGhRepoRhs(rawRhs, bash) {
  if (typeof rawRhs !== 'string') return { ok: false };
  if (bash) {
    const uq = unquoteBashLiteral(rawRhs);
    if (!uq) return { ok: false };
    if (uq.kind !== 'single' && uq.val.includes('$')) return { ok: false };
    return { ok: true, val: uq.val };
  }
  if (rawRhs.toLowerCase() === '$null') return { ok: true, val: '' };
  if (/[\$%`]/.test(rawRhs)) return { ok: false };
  const uq = unquotePsLiteral(rawRhs);
  if (!uq) return { ok: false };
  return { ok: true, val: uq.val };
}

function splitAssign(tok, rawTok) {
  const eq = tok.indexOf('=');
  const rawEq = rawTok.indexOf('=');
  if (eq === -1 || rawEq === -1) return null;
  return { name: tok.slice(0, eq), val: tok.slice(eq + 1), rawRhs: rawTok.slice(rawEq + 1) };
}

/**
 * Analyze a single shell mode linearly, computing per-segment state for
 * `GIT_CONFIG_GLOBAL`, `GH_REPO`, `GIT_DIR` / `GIT_CONFIG*`, and prior `cd`/`env -S`.
 */
function analyzeMode(modeInfo, bash, { env, platform, expectedGitconfig, homeDir }) {
  const isWin = platform === 'win32';
  const envHome = getEnvVar(env, 'HOME', isWin);
  const envUserProfile = getEnvVar(env, 'USERPROFILE', isWin);
  const envGitConfigGlobal = getEnvVar(env, 'GIT_CONFIG_GLOBAL', isWin);
  const envGitConfigCount = getEnvVar(env, 'GIT_CONFIG_COUNT', isWin);
  const envGitConfigParams = getEnvVar(env, 'GIT_CONFIG_PARAMETERS', isWin);
  const envGitDir = getEnvVar(env, 'GIT_DIR', isWin);
  const envGitConfig = getEnvVar(env, 'GIT_CONFIG', isWin);
  const envGitCommonDir = getEnvVar(env, 'GIT_COMMON_DIR', isWin);
  const envGhRepo = getEnvVar(env, 'GH_REPO', isWin);

  const globalModeDisqualified =
    modeInfo.hasSubexprInDoubleQuotes ||
    modeInfo.hasExpandableHereStringWithDollar ||
    modeInfo.hasEnvBraced ||
    modeInfo.hasDotNetEnv ||
    (!bash && modeInfo.hasPsSubexpr);

  const exportsAllowed = !globalModeDisqualified && !modeInfo.hasNonSemiSep && !modeInfo.hasControlKeyword && !modeInfo.hasBashSubst;
  const envVarAllowed = !globalModeDisqualified && !modeInfo.hasEnclosingOrPipeOrBg && !modeInfo.hasBashSubst;

  let curExportGitConfigOk = false;
  let gitConfigDisqualified = globalModeDisqualified;
  let envGitConfigOk = envVarAllowed && Boolean(expectedGitconfig && envGitConfigGlobal && normComparePath(envGitConfigGlobal, isWin) === normComparePath(expectedGitconfig, isWin));

  let curGhRepo = envGhRepo ?? '';
  let ghRepoTainted = globalModeDisqualified || !envVarAllowed && Boolean(envGhRepo);
  let gitDirTainted = Boolean(envGitDir || envGitConfig || envGitCommonDir);
  let gitConfigCountTainted = Boolean((envGitConfigCount !== undefined && envGitConfigCount !== '') || (envGitConfigParams !== undefined && envGitConfigParams !== ''));
  let homeTainted = globalModeDisqualified;
  let userProfileTainted = globalModeDisqualified;
  let sawCd = false;
  let sawEnvSplitBefore = false;

  const isNameMatch = (a, target) => (isWin || !bash ? a.toUpperCase() === target : a === target);

  // First pass checks whether any segment has `cmd /c` / `/d`, PS env: cmdlets, or PS variable cmdlets
  const segStates = [];
  for (let idx = 0; idx < modeInfo.segments.length; idx++) {
    const seg = modeInfo.segments[idx];
    const { tokens, rawTokens } = seg;
    const at = programAt(tokens);
    const prog = at < tokens.length ? programName(tokens[at]) : '';

    // Check cmd /c or /d anywhere in mode (Step 4 disqualifier)
    if (prog === 'cmd' && tokens.slice(at + 1).some(t => /^\/[cd](?:$|:)/i.test(t))) {
      gitConfigDisqualified = true;
      ghRepoTainted = true;
      homeTainted = true;
      userProfileTainted = true;
    }

    // PowerShell env: item & variable cmdlets
    if (!bash) {
      if (PS_ENV_ITEM_CMDS.has(prog) && tokens.slice(at + 1).some(t => /(?:^|[^A-Za-z0-9_])env:/i.test(t))) {
        gitConfigDisqualified = true;
        ghRepoTainted = true;
        homeTainted = true;
        userProfileTainted = true;
      }
      if (PS_VAR_CMDS.has(prog) && tokens.slice(at + 1).some(t => /^\$?(?:home|userprofile|git_config_global|gh_repo|git_dir|git_config_count|git_config_parameters)$/i.test(t))) {
        gitConfigDisqualified = true;
        ghRepoTainted = true;
        homeTainted = true;
        userProfileTainted = true;
      }
    }

    // Check Bash unset / export / declare / typeset / readonly
    if (bash && prog === 'unset') {
      for (const arg of tokens.slice(at + 1)) {
        if (arg.startsWith('-')) continue;
        if (isNameMatch(arg, 'GIT_CONFIG_GLOBAL') || isNameMatch(arg, 'GIT_TERMINAL_PROMPT')) {
          curExportGitConfigOk = false;
          envGitConfigOk = false;
        }
        if (isNameMatch(arg, 'GH_REPO')) {
          curGhRepo = '';
          ghRepoTainted = true;
        }
        if (isNameMatch(arg, 'HOME')) homeTainted = true;
        if (isNameMatch(arg, 'USERPROFILE')) userProfileTainted = true;
        if (isNameMatch(arg, 'GIT_DIR') || isNameMatch(arg, 'GIT_CONFIG') || isNameMatch(arg, 'GIT_COMMON_DIR')) gitDirTainted = false;
        if (isNameMatch(arg, 'GIT_CONFIG_COUNT') || isNameMatch(arg, 'GIT_CONFIG_PARAMETERS')) gitConfigCountTainted = true;
      }
    }

    if (bash && (prog === 'export' || prog === 'declare' || prog === 'typeset' || prog === 'readonly')) {
      const args = tokens.slice(at + 1);
      const hasFlag = args.some(a => a.startsWith('-') || a.startsWith('+'));
      const isExactExport = prog === 'export' && tokens.length === 2 && !hasFlag && ASSIGNMENT.test(tokens[1]);
      if (isExactExport) {
        const asg = splitAssign(tokens[1], rawTokens[1]);
        if (asg) {
          if (asg.name === 'GIT_CONFIG_GLOBAL') {
            if (exportsAllowed && !gitConfigDisqualified && expectedGitconfig) {
              curExportGitConfigOk = evalGitConfigRhs(asg.rawRhs, true, {
                fromEnvWrapper: false, expectedPath: expectedGitconfig, homeDir, envHome, envUserProfile, homeTainted, userProfileTainted, isWin,
              });
              if (!curExportGitConfigOk) envGitConfigOk = false;
            } else {
              curExportGitConfigOk = false;
              envGitConfigOk = false;
            }
          } else if (asg.name === 'GH_REPO') {
            if (exportsAllowed && !globalModeDisqualified) {
              const r = evalGhRepoRhs(asg.rawRhs, true);
              if (r.ok) {
                curGhRepo = r.val;
                ghRepoTainted = false;
              } else {
                ghRepoTainted = true;
              }
            } else {
              ghRepoTainted = true;
            }
          } else if (asg.name === 'HOME') {
            homeTainted = true;
          } else if (asg.name === 'USERPROFILE') {
            userProfileTainted = true;
          } else if (asg.name === 'GIT_CONFIG_COUNT' || asg.name === 'GIT_CONFIG_PARAMETERS') {
            gitConfigCountTainted = true;
          } else if (asg.name === 'GIT_DIR' || asg.name === 'GIT_CONFIG' || asg.name === 'GIT_COMMON_DIR') {
            gitDirTainted = true;
          }
        }
      } else {
        for (const a of args) {
          const name = a.includes('=') ? a.slice(0, a.indexOf('=')) : a;
          if (a.startsWith('-') || a.startsWith('+')) continue;
          if (name === 'GIT_CONFIG_GLOBAL') {
            curExportGitConfigOk = false;
            envGitConfigOk = false;
          }
          if (name === 'GH_REPO') ghRepoTainted = true;
          if (name === 'HOME') homeTainted = true;
          if (name === 'USERPROFILE') userProfileTainted = true;
          if (name === 'GIT_CONFIG_COUNT' || name === 'GIT_CONFIG_PARAMETERS') gitConfigCountTainted = true;
          if (name === 'GIT_DIR' || name === 'GIT_CONFIG' || name === 'GIT_COMMON_DIR') gitDirTainted = true;
        }
        if (hasFlag && args.some(a => a === 'GIT_CONFIG_GLOBAL' || a.startsWith('GIT_CONFIG_GLOBAL='))) {
          curExportGitConfigOk = false;
          envGitConfigOk = false;
          gitConfigDisqualified = true;
        }
        if (hasFlag && args.some(a => a === 'HOME' || a.startsWith('HOME='))) homeTainted = true;
        if (hasFlag && args.some(a => a === 'GH_REPO' || a.startsWith('GH_REPO='))) ghRepoTainted = true;
      }
    }

    // PowerShell `$env:VAR = <val>`
    if (!bash && tokens[0]?.toLowerCase().startsWith('$env:') && tokens[1] === '=') {
      const varName = tokens[0].slice(5);
      const isExact3 = tokens.length === 3;
      if (isNameMatch(varName, 'GIT_CONFIG_GLOBAL')) {
        if (isExact3 && exportsAllowed && !gitConfigDisqualified && expectedGitconfig) {
          curExportGitConfigOk = evalGitConfigRhs(rawTokens[2], false, {
            fromEnvWrapper: false, expectedPath: expectedGitconfig, homeDir, envHome, envUserProfile, homeTainted, userProfileTainted, isWin,
          });
          if (!curExportGitConfigOk) envGitConfigOk = false;
        } else {
          curExportGitConfigOk = false;
          envGitConfigOk = false;
        }
      } else if (isNameMatch(varName, 'GH_REPO')) {
        if (isExact3 && exportsAllowed && !globalModeDisqualified) {
          const r = evalGhRepoRhs(rawTokens[2], false);
          if (r.ok) {
            curGhRepo = r.val;
            ghRepoTainted = false;
          } else {
            ghRepoTainted = true;
          }
        } else {
          ghRepoTainted = true;
        }
      } else if (isNameMatch(varName, 'HOME')) {
        homeTainted = true;
      } else if (isNameMatch(varName, 'USERPROFILE')) {
        userProfileTainted = true;
      } else if (isNameMatch(varName, 'GIT_CONFIG_COUNT') || isNameMatch(varName, 'GIT_CONFIG_PARAMETERS')) {
        gitConfigCountTainted = true;
      } else if (isNameMatch(varName, 'GIT_DIR') || isNameMatch(varName, 'GIT_CONFIG') || isNameMatch(varName, 'GIT_COMMON_DIR')) {
        gitDirTainted = true;
      }
    }

    // Inspect inline assignments and `env` wrapper on THIS segment
    let segEnvDirs = [];
    let segEnvCleared = false;
    let segEnvUnsets = [];
    let segSplitOrUnknown = null;
    let inlineGitConfigLast = null;
    let inlineGhRepoLast = null;
    let inlineOverridesCount = false;
    let inlineOverridesGitDir = false;
    let inlineTaintsHome = false;

    let j = 0;
    let noDashes = false;
    while (j < at) {
      const t = tokens[j];
      const rt = rawTokens[j];
      if (ASSIGNMENT.test(t)) {
        const asg = splitAssign(t, rt);
        if (asg) {
          if (asg.name === 'GIT_CONFIG_GLOBAL') inlineGitConfigLast = { rawRhs: asg.rawRhs, fromEnvWrapper: false };
          else if (asg.name === 'GH_REPO') inlineGhRepoLast = asg.rawRhs;
          else if (asg.name === 'GIT_CONFIG_COUNT' || asg.name === 'GIT_CONFIG_PARAMETERS') inlineOverridesCount = true;
          else if (asg.name === 'GIT_DIR' || asg.name === 'GIT_CONFIG' || asg.name === 'GIT_COMMON_DIR') inlineOverridesGitDir = true;
          else if (asg.name === 'HOME' || asg.name === 'USERPROFILE') inlineTaintsHome = true;
        }
        j++;
      } else if (ENV_BIN.test(base(t))) {
        const probe = inspectEnvSplitOrUnknown(tokens, j);
        if (probe) {
          segSplitOrUnknown = probe;
          break;
        }
        const ev = scanEnvWrapper(tokens, j);
        segEnvDirs.push(...ev.dirs);
        if (ev.cleared) segEnvCleared = true;
        segEnvUnsets.push(...ev.unsets);
        for (const ii of ev.inlineIndices) {
          const asg = splitAssign(tokens[ii], rawTokens[ii]);
          if (asg) {
            if (asg.name === 'GIT_CONFIG_GLOBAL') inlineGitConfigLast = { rawRhs: asg.rawRhs, fromEnvWrapper: true };
            else if (asg.name === 'GH_REPO') inlineGhRepoLast = asg.rawRhs;
            else if (asg.name === 'GIT_CONFIG_COUNT' || asg.name === 'GIT_CONFIG_PARAMETERS') inlineOverridesCount = true;
            else if (asg.name === 'GIT_DIR' || asg.name === 'GIT_CONFIG' || asg.name === 'GIT_COMMON_DIR') inlineOverridesGitDir = true;
            else if (asg.name === 'HOME' || asg.name === 'USERPROFILE') inlineTaintsHome = true;
          }
        }
        j = ev.next;
      } else if (WRAPPERS.has(t)) {
        j++;
      } else if (t.startsWith('$') && tokens[j + 1] === '=') {
        j += 2;
      } else if (t === 'timeout') {
        j++;
        if (/^[\d.]+[smhd]?$/.test(tokens[j] ?? '')) j++;
      } else if (MISE.test(base(t)) && /^(?:x|exec)$/.test(tokens[j + 1] ?? '')) {
        j += 2;
        const dashes = noDashes ? -1 : tokens.indexOf('--', j);
        if (dashes !== -1) j = dashes + 1;
        else {
          noDashes = true;
          while (tokens[j] !== undefined && (tokens[j].startsWith('-') || tokens[j].includes('@'))) j++;
        }
      } else if (NPX.test(base(t))) {
        j++;
        while (tokens[j]?.startsWith('-')) j += tokens[j] === '-p' || tokens[j] === '--package' ? 2 : 1;
      } else {
        break;
      }
    }
    if (!segSplitOrUnknown && at < tokens.length && ENV_BIN.test(base(tokens[at]))) {
      segSplitOrUnknown = inspectEnvSplitOrUnknown(tokens, at);
    }

    // Standalone Bash assignment `VAR=val` (with no command after it)
    const isStandaloneAssign = at === tokens.length && tokens.every(t => ASSIGNMENT.test(t));
    if (bash && isStandaloneAssign) {
      for (let ti = 0; ti < tokens.length; ti++) {
        const asg = splitAssign(tokens[ti], rawTokens[ti]);
        if (!asg) continue;
        if (asg.name === 'GIT_CONFIG_GLOBAL') {
          curExportGitConfigOk = false;
          envGitConfigOk = false;
        } else if (asg.name === 'GH_REPO') {
          if (curGhRepo) ghRepoTainted = true;
          curGhRepo = '';
        } else if (asg.name === 'HOME') homeTainted = true;
        else if (asg.name === 'USERPROFILE') userProfileTainted = true;
        else if (asg.name === 'GIT_CONFIG_COUNT' || asg.name === 'GIT_CONFIG_PARAMETERS') gitConfigCountTainted = true;
        else if (asg.name === 'GIT_DIR' || asg.name === 'GIT_CONFIG' || asg.name === 'GIT_COMMON_DIR') gitDirTainted = true;
      }
    }

    // Compute per-segment effective state
    const envUnsetGitConfig = segEnvUnsets.some(u => isNameMatch(u, 'GIT_CONFIG_GLOBAL') || isNameMatch(u, 'GIT_TERMINAL_PROMPT'));
    const envUnsetHome = segEnvUnsets.some(u => isNameMatch(u, 'HOME'));
    const envUnsetUp = segEnvUnsets.some(u => isNameMatch(u, 'USERPROFILE'));
    const envUnsetGhRepo = segEnvUnsets.some(u => isNameMatch(u, 'GH_REPO'));

    const envDisqualifiesGitConfig = segEnvCleared || envUnsetGitConfig;

    let inlineGitConfigOk = false;
    if (bash && inlineGitConfigLast && expectedGitconfig && !gitConfigDisqualified && !envDisqualifiesGitConfig && !gitConfigCountTainted && !inlineOverridesCount) {
      inlineGitConfigOk = evalGitConfigRhs(inlineGitConfigLast.rawRhs, true, {
        fromEnvWrapper: inlineGitConfigLast.fromEnvWrapper,
        expectedPath: expectedGitconfig,
        homeDir,
        envHome,
        envUserProfile,
        homeTainted: homeTainted || inlineTaintsHome || envUnsetHome,
        userProfileTainted: userProfileTainted || inlineTaintsHome || envUnsetUp,
        isWin,
      });
    }

    const baseGitConfigOk =
      !gitConfigDisqualified &&
      !envDisqualifiesGitConfig &&
      !gitConfigCountTainted &&
      !inlineOverridesCount &&
      (curExportGitConfigOk || envGitConfigOk) &&
      !inlineGitConfigLast;

    // Effective GH_REPO for this segment
    let effectiveGhRepo = curGhRepo;
    let effectiveGhRepoTainted = ghRepoTainted;
    if (segEnvCleared || envUnsetGhRepo) {
      effectiveGhRepo = '';
      effectiveGhRepoTainted = false;
    }
    if (bash && inlineGhRepoLast !== null) {
      const r = evalGhRepoRhs(inlineGhRepoLast, true);
      if (r.ok) {
        effectiveGhRepo = r.val;
        effectiveGhRepoTainted = false;
      } else {
        effectiveGhRepoTainted = true;
      }
    }

    segStates.push({
      tokens,
      rawTokens,
      tokenOffsets: seg.tokenOffsets,
      at,
      prog,
      startsWithAssign: ASSIGNMENT.test(tokens[0] ?? ''),
      segSplitOrUnknown,
      segEnvDirs,
      sawCdBefore: sawCd,
      sawEnvSplitBefore,
      gitConfigSatisfied: inlineGitConfigOk || baseGitConfigOk,
      usedModeAssign: inlineGitConfigOk || (baseGitConfigOk && curExportGitConfigOk && !envGitConfigOk),
      gitConfigOverrideInSeg: gitConfigCountTainted || inlineOverridesCount || gitConfigDisqualified,
      gitCountOrParamsTainted: gitConfigCountTainted || inlineOverridesCount,
      gitDirTainted: gitDirTainted || inlineOverridesGitDir,
      effectiveGhRepo,
      effectiveGhRepoTainted,
      usedModeGhRepo: effectiveGhRepo !== '' && effectiveGhRepo !== (envGhRepo ?? ''),
    });

    if (CD_PROGRAMS.has(prog)) sawCd = true;
    if (segSplitOrUnknown?.type === 'env-split') sawEnvSplitBefore = true;
  }

  return segStates;
}

// ------------------------------------------------------------ scope & decision helpers

function checkGhOwnerScope(ghInfo, segState, { ownerLogin, cwd, platform }) {
  if (ghInfo.unknownFlag || segState.sawCdBefore || segState.sawEnvSplitBefore) return { match: true };

  // Handle `gh api`
  if (ghInfo.group === 'api') {
    const { endpoint } = ghInfo.api;
    if (!endpoint) return { match: true };

    // --hostname exemption for GHES
    if (ghInfo.hostnames.length > 0 && !/^[a-z][a-z0-9+.-]*:\/\//i.test(endpoint)) {
      const normalized = ghInfo.hostnames.map(normalizeHost);
      if (normalized.some(h => h === null || isGitHubHost(h))) return { match: true };
      const first = normalized[0];
      if (!normalized.every(h => h === first)) return { match: true };
      // Ensure no global -R points to owner or fails
      for (const r of ghInfo.globalRepos) {
        const res = evalRepoShorthand(r, ownerLogin);
        if (!res.ok || res.match) return { match: true };
      }
      return { match: false };
    }
    if (ghInfo.hostnames.length > 0) return { match: true };

    const epNoQf = endpoint.split(/[?#]/, 1)[0];
    if (/%|\.\.(?:\/|$)|(?:^|\/)\.(?:\/|$)|\/\//.test(epNoQf)) return { match: true };
    const m = /^\/?repos\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38})|\{owner\}|:owner)\/([^/]+)(?:\/|$)/.exec(epNoQf);
    if (!m) return { match: true }; // Non-repos/ endpoint is account-scoped
    if (m[1] !== '{owner}' && m[1] !== ':owner') {
      const epOwner = m[1];
      if (!LOGIN_RE.test(epOwner)) return { match: true };
      const epMatch = epOwner.toLowerCase() === ownerLogin.toLowerCase();
      if (epMatch) return { match: true };
      // Check agreement with any -R / GH_REPO
      for (const r of ghInfo.globalRepos) {
        const res = evalRepoShorthand(r, ownerLogin);
        if (!res.ok || res.match || res.owner.toLowerCase() !== epOwner.toLowerCase()) return { match: true };
      }
      return { match: false };
    }
    // {owner}/:owner falls through to -R / GH_REPO / cwd
  }

  // Handle `gh` account-scoped groups and special `repo` / `project` / `secret` / `variable` rules
  if (ghInfo.accountScoped) return { match: true };
  if (ghInfo.group === 'gist') return { match: true };

  if (ghInfo.group === 'secret' || ghInfo.group === 'variable') {
    const beforeDashes = ghInfo.restArgs.includes('--') ? ghInfo.restArgs.slice(0, ghInfo.restArgs.indexOf('--')) : ghInfo.restArgs;
    for (const tok of beforeDashes) {
      if (
        tok === '-u' || tok === '--user' || tok.startsWith('--user=') ||
        tok === '-o' || tok.startsWith('-o') || tok === '--org' || tok.startsWith('--org=') ||
        /^-[A-Za-z]*[uo]/.test(tok)
      ) {
        return { match: true };
      }
    }
  }

  if (ghInfo.group === 'repo') {
    if (ghInfo.verb === 'fork') {
      // Exempt ONLY on clean non-@me non-owner `--org <org>` before unknown flag, with all `--org` flags agreeing
      const orgVals = [];
      let i = 0;
      while (i < ghInfo.afterVerb.length) {
        const t = ghInfo.afterVerb[i];
        if (t === '--') break;
        if (t === '--org') {
          if (i + 1 >= ghInfo.afterVerb.length) return { match: true };
          orgVals.push(ghInfo.afterVerb[i + 1]);
          i += 2;
        } else if (t.startsWith('--org=')) {
          orgVals.push(t.slice('--org='.length));
          i++;
        } else if (t.startsWith('-')) {
          break;
        } else {
          i++;
        }
      }
      if (orgVals.length === 0) return { match: true };
      for (const o of orgVals) {
        if (!o || o.toLowerCase() === '@me' || !LOGIN_RE.test(o) || o.toLowerCase() === ownerLogin.toLowerCase()) return { match: true };
      }
      const firstOrg = orgVals[0].toLowerCase();
      if (!orgVals.every(o => o.toLowerCase() === firstOrg)) return { match: true };
      return { match: false };
    }

    if (ghInfo.verb === 'create') {
      // Exempt ONLY on clean positional `<org>/<name>` before any unknown flag (NEVER -R or GH_REPO or cwd)
      if (ghInfo.globalRepos.length > 0) return { match: true };
      let pos = null;
      for (let i = 0; i < ghInfo.afterVerb.length; i++) {
        const t = ghInfo.afterVerb[i];
        if (t === '--') break;
        if (t.startsWith('-')) break;
        pos = t;
        break;
      }
      if (!pos || !pos.includes('/')) return { match: true };
      const res = evalRepoShorthand(pos, ownerLogin);
      if (!res.ok || res.host !== 'github.com' || res.match) return { match: true };
      return { match: false };
    }

    if (!GH_REPO_POSITIONAL_EXEMPT_VERBS.has(ghInfo.verb)) {
      return { match: true };
    }
  }

  if (ghInfo.group === 'project') {
    const ownerVals = [];
    let i = 0;
    while (i < ghInfo.afterVerb.length) {
      const t = ghInfo.afterVerb[i];
      if (t === '--') break;
      const g = consumeGhGlobalFlag(ghInfo.afterVerb, i, [], []);
      if (g.matched && g.ok) {
        i = g.next;
        continue;
      }
      if (t === '--owner') {
        if (i + 1 >= ghInfo.afterVerb.length) return { match: true };
        ownerVals.push(ghInfo.afterVerb[i + 1]);
        i += 2;
      } else if (t.startsWith('--owner=')) {
        ownerVals.push(t.slice('--owner='.length));
        i++;
      } else if (t.startsWith('-')) {
        break;
      } else {
        i++;
      }
    }
    if (ownerVals.length === 0) return { match: true };
    for (const o of ownerVals) {
      if (!o || o.toLowerCase() === '@me' || !LOGIN_RE.test(o) || o.toLowerCase() === ownerLogin.toLowerCase()) return { match: true };
    }
    const firstOwner = ownerVals[0].toLowerCase();
    if (!ownerVals.every(o => o.toLowerCase() === firstOwner)) return { match: true };
    return { match: false };
  }

  // Validate --hostname if passed on non-api gh commands (github.com is default; non-github.com without matching host is checked below)
  if (ghInfo.hostnames.length > 0) {
    const normalized = ghInfo.hostnames.map(normalizeHost);
    if (normalized.some(h => h === null)) return { match: true };
    const first = normalized[0];
    if (!normalized.every(h => h === first)) return { match: true };
    if (!isGitHubHost(first)) return { match: false };
  }

  // Collect explicit command-line targets before any unrecognized flag in `afterVerb`
  const cliTargets = [...ghInfo.globalRepos];
  let sawUnrecognizedBeforeTarget = false;
  if (ghInfo.afterVerb) {
    let i = 0;
    let hitUnknown = false;
    while (i < ghInfo.afterVerb.length) {
      const t = ghInfo.afterVerb[i];
      if (t === '--') break;
      const g = consumeGhGlobalFlag(ghInfo.afterVerb, i, hitUnknown ? [] : cliTargets, []);
      if (g.matched) {
        if (!g.ok) return { match: true };
        if (hitUnknown) sawUnrecognizedBeforeTarget = true;
        i = g.next;
        continue;
      }
      if (t.startsWith('-') && t !== '-') {
        hitUnknown = true;
        i++;
        continue;
      }
      if (!hitUnknown) {
        if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t) || /^[^@/\s]+@[^:@/\s]+:/.test(t)) {
          cliTargets.push(t);
        } else if (ghInfo.group === 'repo' && GH_REPO_POSITIONAL_EXEMPT_VERBS.has(ghInfo.verb) && t.includes('/')) {
          cliTargets.push(t);
        }
      }
      i++;
    }
  }

  if (sawUnrecognizedBeforeTarget) return { match: true };

  if (cliTargets.length > 0) {
    const parsed = cliTargets.map(t => evalRepoShorthand(t, ownerLogin));
    if (parsed.some(p => !p.ok || p.match)) return { match: true };
    const first = parsed[0];
    if (!parsed.every(p => p.host === first.host && p.owner.toLowerCase() === first.owner.toLowerCase())) return { match: true };
    return { match: false };
  }

  // Precedence: GH_REPO overrides cwd
  if (segState.effectiveGhRepoTainted) return { match: true };
  if (segState.effectiveGhRepo) {
    const res = evalRepoShorthand(segState.effectiveGhRepo, ownerLogin);
    if (!res.ok || res.match) return { match: true };
    return { match: false };
  }

  // `gh repo delete <name>` without `/` targets @me, never cwd
  if (ghInfo.group === 'repo') return { match: true };

  // Fall back to Step 2 `.git/config`
  if (segState.gitDirTainted) return { match: true };
  return resolveCwdRepoScope({
    cwd,
    dirs: segState.segEnvDirs,
    explicitRemoteName: null,
    isGitPush: false,
    isGh: true,
    ownerLogin,
    platform,
  });
}

function checkGitOwnerScope(gitInfo, segState, { ownerLogin, cwd, platform }) {
  if (segState.sawCdBefore || segState.sawEnvSplitBefore) return { match: true };
  if (gitInfo.hasUnknownLeadingOpt) return { match: true };

  let explicitRemoteName = null;
  if (gitInfo.subcmd === 'push') {
    const pushTarget = parseGitPushTarget(gitInfo.subArgs);
    if (pushTarget.unknownFlag) return { match: true };
    if (pushTarget.target !== null) {
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(pushTarget.target) || /^[^@/\s]+@[^:@/\s]+:/.test(pushTarget.target)) {
        const res = evalRepoUrl(pushTarget.target, ownerLogin);
        return { match: !res.ok || res.match };
      }
      explicitRemoteName = pushTarget.target;
    }
  }

  // Step 2 disqualifiers
  if (gitInfo.hasGitDirOpt || gitInfo.hasConfigEnvOpt || gitInfo.hasExecPathOpt || segState.gitDirTainted || segState.gitCountOrParamsTainted) {
    return { match: true };
  }
  for (const co of gitInfo.cOpts) {
    const key = co.val.includes('=') ? co.val.slice(0, co.val.indexOf('=')) : co.val;
    if (GIT_SCOPE_OVERRIDE_KEY_RE.test(key)) return { match: true };
  }

  return resolveCwdRepoScope({
    cwd,
    dirs: [...segState.segEnvDirs, ...gitInfo.dirs],
    explicitRemoteName,
    isGitPush: gitInfo.subcmd === 'push',
    isGh: false,
    ownerLogin,
    platform,
  });
}

// ------------------------------------------------------------ entry point: answerCall

function buildGhReason(provider, posterOn, isFreeText) {
  if (posterOn && isFreeText) {
    return `Plain gh writes are blocked while agent-identity is on for ${provider}. Use node "$HOME/.pact/tools/poster.mjs" for free-text GitHub posts, or node "$HOME/.pact/tools/gh-app.mjs" gh --provider ${provider} -R <owner>/<repo> -- <args> for other writes (for assignees, pass --add-assignee <owner> explicitly; @me resolves to the app).`;
  }
  return `Plain gh writes are blocked while agent-identity is on for ${provider}. Use node "$HOME/.pact/tools/gh-app.mjs" gh --provider ${provider} -R <owner>/<repo> -- <args> (for assignees, pass --add-assignee <owner> explicitly; @me resolves to the app).`;
}

function buildGitconfigReason(provider) {
  return `The pinned gitconfig for ${provider} is missing or unreadable; run node "$HOME/.pact/tools/gh-app.mjs" setup --provider ${provider} (or refresh).`;
}

function buildGitDenyReason(provider, platform) {
  if (platform === 'win32') {
    return `Plain git writes are blocked while agent-identity is on for ${provider}. Prefix with $env:GIT_CONFIG_GLOBAL = "$env:USERPROFILE/.pact/gh-app-${provider}.gitconfig"; $env:GIT_TERMINAL_PROMPT = '0'; <command> so git writes use the pinned app.`;
  }
  return `Plain git writes are blocked while agent-identity is on for ${provider}. Prefix with GIT_CONFIG_GLOBAL="$HOME/.pact/gh-app-${provider}.gitconfig" GIT_TERMINAL_PROMPT=0 <command> so git writes use the pinned app.`;
}

function isOverwriteEligible(command, bashMode, psMode, bashSegState, psSegState, bashGitInfo, psGitInfo, expectedGitconfig, env, platform) {
  const isWin = platform === 'win32';
  if (/[\r\n\0\p{Cc}]/u.test(expectedGitconfig)) return false;
  if (isWin && WIN_PATH_BAD.test(expectedGitconfig)) return false;

  if (bashMode.hasRawNewline || psMode.hasRawNewline) return false;
  if (bashMode.sawComment || psMode.sawComment) return false;
  if (bashMode.hasNonSemiSep || psMode.hasNonSemiSep) return false;
  if (bashMode.separators.length > 0 || psMode.separators.length > 0) return false;
  if (bashMode.segments.length !== 1 || psMode.segments.length !== 1) return false;
  if (bashSegState.at !== 0 || psSegState.at !== 0) return false;
  if (programName(bashSegState.tokens[0]) !== 'git' || programName(psSegState.tokens[0]) !== 'git') return false;
  if (command.includes('$(')) return false;

  if (isWin && (/^\s*set\s+/i.test(command) || /^\s*[A-Za-z_][A-Za-z0-9_]*=/.test(command))) return false;
  if (bashSegState.gitConfigOverrideInSeg || psSegState.gitConfigOverrideInSeg) return false;
  if (bashGitInfo.hasConfigEnvOpt || psGitInfo.hasConfigEnvOpt) return false;

  const envCount = getEnvVar(env, 'GIT_CONFIG_COUNT', isWin);
  const envParams = getEnvVar(env, 'GIT_CONFIG_PARAMETERS', isWin);
  if ((envCount !== undefined && envCount !== '') || (envParams !== undefined && envParams !== '')) return false;

  for (const [info, segState] of [[bashGitInfo, bashSegState], [psGitInfo, psSegState]]) {
    for (const co of info.cOpts) {
      const key = co.val.includes('=') ? co.val.slice(0, co.val.indexOf('=')) : co.val;
      if (GIT_CONFIG_OVERRIDE_KEY_RE.test(key)) return false;
      const rawTok = segState.rawTokens[co.rawIdx] ?? '';
      if (rawTok.includes('`')) return false;
    }
  }
  return true;
}

/**
 * Evaluate one hook call against rules and (lazily) identity pins.
 */
export function answerCall({ command, provider, cwd, canOverwrite = false, env = process.env, tableFile = TABLE, pinFile, platform = process.platform } = {}) {
  if (typeof command !== 'string' || !PROVIDERS.includes(provider) || typeof canOverwrite !== 'boolean') fail('call');
  if (command.length > COMMAND_MAX) fail('size');

  let tableText;
  try {
    tableText = readFileSync(tableFile, 'utf8');
  } catch {
    fail('table');
  }
  const doc = parseTableDoc(tableText);

  const bashMode = tokenizeMode(command, true);
  const psMode = tokenizeMode(command, false);

  // 1. Cleaner rules first (non-Claude providers) + single-pass identity candidate scan
  const checkCleaner = provider !== 'claude' && doc.rules.length > 0;
  const denyRulesByWord = new Map();
  const askRulesByWord = new Map();
  const denyContains = [];
  const askContains = [];
  if (checkCleaner) {
    for (let ri = 0; ri < doc.rules.length; ri++) {
      const r = doc.rules[ri];
      if (r.words) {
        const map = r.decision === 'deny' ? denyRulesByWord : askRulesByWord;
        let list = map.get(r.words[0]);
        if (!list) {
          list = [];
          map.set(r.words[0], list);
        }
        list.push({ ri, r });
      } else {
        (r.decision === 'deny' ? denyContains : askContains).push({ ri, r });
      }
    }
  }

  let bestDenyIdx = Infinity;
  let bestAskIdx = Infinity;
  let hasCandidate = false;
  const identityEnabled = Boolean(doc.identity?.enabled);

  for (const modeInfo of [bashMode, psMode]) {
    for (const seg of modeInfo.segments) {
      const tokens = seg.tokens;
      const at = programAt(tokens);
      const prog = at < tokens.length ? programName(tokens[at]) : '';

      if (checkCleaner) {
        if (prog) {
          const dList = denyRulesByWord.get(prog);
          if (dList) {
            for (const { ri, r } of dList) {
              if (ri < bestDenyIdx && wordsMatch(tokens, at, r.words)) bestDenyIdx = ri;
            }
          }
          if (bestDenyIdx === Infinity) {
            const aList = askRulesByWord.get(prog);
            if (aList) {
              for (const { ri, r } of aList) {
                if (ri < bestAskIdx && wordsMatch(tokens, at, r.words)) bestAskIdx = ri;
              }
            }
          }
        }
        if (denyContains.length > 0 || (bestDenyIdx === Infinity && askContains.length > 0)) {
          const segText = tokens.join(' ');
          for (const { ri, r } of denyContains) {
            if (ri < bestDenyIdx && containsMatch(segText, r.contains)) bestDenyIdx = ri;
          }
          if (bestDenyIdx === Infinity) {
            for (const { ri, r } of askContains) {
              if (ri < bestAskIdx && containsMatch(segText, r.contains)) bestAskIdx = ri;
            }
          }
        }
      }

      if (identityEnabled && !hasCandidate && at < tokens.length) {
        if (prog === 'gh') hasCandidate = true;
        else if (prog === 'git' && provider !== 'claude' && parseGitSegment(tokens, at).isGuarded) hasCandidate = true;
        else if (ENV_BIN.test(base(tokens[at])) && inspectEnvSplitOrUnknown(tokens, at)) hasCandidate = true;
      }
    }
  }

  if (bestDenyIdx < Infinity) return { decision: 'deny', id: doc.rules[bestDenyIdx].id };
  if (bestAskIdx < Infinity) return { decision: 'ask', id: doc.rules[bestAskIdx].id };

  // 2. Lazy identity pin gate
  if (!identityEnabled || !hasCandidate) return null;

  const resolvedPinFile = resolvePinPath(tableFile, pinFile);
  const pin = readPinFile(resolvedPinFile);
  if (!pin || !Object.hasOwn(pin.apps, provider)) return null;

  const ownerLogin = pin.owner.login;
  const pactDir = dirname(resolvedPinFile);
  const homeDir = dirname(pactDir);
  const expectedGitconfig = `${pactDir}/gh-app-${provider}.gitconfig`.replaceAll('\\', '/');

  const analyzeOpts = { env, platform, expectedGitconfig, homeDir };
  const bashStates = analyzeMode(bashMode, true, analyzeOpts);
  const psStates = analyzeMode(psMode, false, analyzeOpts);
  const modes = [
    { states: bashStates, bash: true },
    { states: psStates, bash: false },
  ];

  // 3. Plain gh write check (all providers; beats any git identity match)
  const segKey = st => `${st.tokenOffsets[st.at] ?? -1}:${JSON.stringify(st.tokens.slice(st.at))}`;
  const evalGhMode = (states, isBash) => {
    const hits = [];
    const satisfiedKeys = new Set();
    let usedModeGhRepo = false;
    for (const st of states) {
      if (!isBash && st.startsWithAssign) continue;
      if (st.segSplitOrUnknown?.kind === 'gh') {
        hits.push({ key: null, answer: { decision: 'deny', id: 'identity-gh', reason: buildGhReason(provider, doc.identity.posterOn, false) } });
        continue;
      }
      if (st.segSplitOrUnknown?.type === 'env-split' && st.segSplitOrUnknown.badSplit && provider === 'claude') {
        hits.push({ key: null, answer: { decision: 'deny', id: 'identity-gh', reason: buildGhReason(provider, doc.identity.posterOn, false) } });
        continue;
      }
      if (st.prog === 'gh') {
        const ghInfo = parseGhSegment(st.tokens, st.at);
        if (ghInfo.isWrite) {
          const scope = checkGhOwnerScope(ghInfo, st, { ownerLogin, cwd, platform });
          if (scope.match) {
            hits.push({ key: segKey(st), answer: { decision: 'deny', id: 'identity-gh', reason: buildGhReason(provider, doc.identity.posterOn, ghInfo.isFreeText) } });
          } else if (st.usedModeGhRepo) {
            usedModeGhRepo = true;
            satisfiedKeys.add(segKey(st));
          }
        }
      }
    }
    return { hits, satisfiedKeys, usedModeGhRepo };
  };

  const bashGh = evalGhMode(bashStates, true);
  const psGh = evalGhMode(psStates, false);
  const bashGhExemptsPs = bashGh.hits.length === 0 && bashGh.usedModeGhRepo && !psMode.sawComment && psGh.hits.every(h => h.key !== null && bashGh.satisfiedKeys.has(h.key));
  const psGhExemptsBash = psGh.hits.length === 0 && psGh.usedModeGhRepo && !bashMode.sawComment && bashGh.hits.every(h => h.key !== null && psGh.satisfiedKeys.has(h.key));
  if (bashGh.hits.length > 0 && !psGhExemptsBash) return bashGh.hits[0].answer;
  if (psGh.hits.length > 0 && !bashGhExemptsPs) return psGh.hits[0].answer;

  // 4. Plain git write check (`antigravity` and `codex` only)
  if (provider !== 'antigravity' && provider !== 'codex') return null;

  const verifyGitconfig = () => {
    let gst;
    try {
      gst = lstatSync(expectedGitconfig);
    } catch {
      return false;
    }
    return !gst.isSymbolicLink() && gst.isFile();
  };

  const evalGitMode = (states, isBash) => {
    const hits = [];
    const satisfiedKeys = new Set();
    let guardedCount = 0;
    let usedModeAssign = false;
    let missingGitconfig = false;
    for (const st of states) {
      if (!isBash && st.startsWithAssign) continue;
      if (st.segSplitOrUnknown && (st.segSplitOrUnknown.kind === 'git' || st.segSplitOrUnknown.kind === 'ambiguous')) {
        guardedCount++;
        if (!verifyGitconfig()) {
          missingGitconfig = true;
          break;
        }
        hits.push({ key: null, forceDeny: true, gitInfo: null, st });
        continue;
      }
      if (st.prog === 'git') {
        const gitInfo = parseGitSegment(st.tokens, st.at);
        if (!gitInfo.isGuarded) continue;
        const scope = checkGitOwnerScope(gitInfo, st, { ownerLogin, cwd, platform });
        if (!scope.match) continue;
        guardedCount++;
        if (!verifyGitconfig()) {
          missingGitconfig = true;
          break;
        }
        const hasCOverride = gitInfo.hasConfigEnvOpt || gitInfo.cOpts.some(co => {
          const key = co.val.includes('=') ? co.val.slice(0, co.val.indexOf('=')) : co.val;
          return GIT_CONFIG_OVERRIDE_KEY_RE.test(key);
        });
        if (st.gitConfigSatisfied && !hasCOverride) {
          if (st.usedModeAssign) {
            usedModeAssign = true;
            satisfiedKeys.add(segKey(st));
          }
          continue;
        }
        hits.push({ key: segKey(st), forceDeny: hasCOverride, gitInfo, st });
      }
    }
    return { hits, satisfiedKeys, guardedCount, usedModeAssign, missingGitconfig };
  };

  const bashGit = evalGitMode(bashStates, true);
  if (bashGit.missingGitconfig) return { decision: 'deny', id: 'identity-gitconfig', reason: buildGitconfigReason(provider) };
  const psGit = evalGitMode(psStates, false);
  if (psGit.missingGitconfig) return { decision: 'deny', id: 'identity-gitconfig', reason: buildGitconfigReason(provider) };

  const bashGitExemptsPs = bashGit.hits.length === 0 && bashGit.usedModeAssign && !psMode.sawComment && psGit.hits.every(h => h.key !== null && bashGit.satisfiedKeys.has(h.key));
  const psGitExemptsBash = psGit.hits.length === 0 && psGit.usedModeAssign && !bashMode.sawComment && bashGit.hits.every(h => h.key !== null && psGit.satisfiedKeys.has(h.key));

  const activeHit = bashGit.hits.length > 0 && !psGitExemptsBash
    ? bashGit.hits[0]
    : psGit.hits.length > 0 && !bashGitExemptsPs
      ? psGit.hits[0]
      : null;

  if (!activeHit) return null;

  const multiGuarded = bashGit.guardedCount > 1 || psGit.guardedCount > 1;
  if (
    canOverwrite &&
    !activeHit.forceDeny &&
    !multiGuarded &&
    activeHit.gitInfo &&
    bashStates.length === 1 &&
    psStates.length === 1
  ) {
    const bashGitInfo = parseGitSegment(bashStates[0].tokens, bashStates[0].at);
    const psGitInfo = parseGitSegment(psStates[0].tokens, psStates[0].at);
    if (isOverwriteEligible(command, bashMode, psMode, bashStates[0], psStates[0], bashGitInfo, psGitInfo, expectedGitconfig, env, platform)) {
      const overwriteCommand = platform === 'win32'
        ? `$env:GIT_CONFIG_GLOBAL = '${expectedGitconfig.replaceAll("'", "''")}'; $env:GIT_TERMINAL_PROMPT = '0'; ${command}`
        : `GIT_CONFIG_GLOBAL='${expectedGitconfig.replaceAll("'", "'\\''")}' GIT_TERMINAL_PROMPT=0 ${command}`;
      return {
        decision: 'overwrite_ask',
        id: 'identity-git',
        reason: `Setting GIT_CONFIG_GLOBAL for ${provider} so git writes use the pinned app.`,
        overwriteCommand,
      };
    }
  }

  return {
    decision: 'deny',
    id: 'identity-git',
    reason: buildGitDenyReason(provider, platform),
  };
}
