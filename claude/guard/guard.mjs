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
const SHELLS = Object.freeze(['bash', 'powershell', 'unknown']);
const LOGIN_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38})$/;
const HOST_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const WIN_PATH_BAD = /["%!^&|<>$`\u2018\u2019\u201a\u201b\u201c\u201d\u201e\p{Cc}]/u;

// ------------------------------------------------------------ closed command & option tables

const GIT_WRITE_SUBCOMMANDS = Object.freeze(new Set(['commit', 'push', 'merge', 'cherry-pick', 'revert', 'rebase', 'tag', 'am']));
const GIT_BUILTIN_READ_SUBCOMMANDS = Object.freeze(new Set([
  'status', 'log', 'diff', 'show', 'ls-files', 'rev-parse', 'cat-file',
  'branch', 'remote', 'describe', 'shortlog', 'blame', 'grep', 'help', 'version',
  'for-each-ref', 'ls-remote', 'ls-tree', 'merge-base', 'name-rev', 'reflog',
  'show-ref', 'symbolic-ref', 'whatchanged', 'verify-commit', 'verify-tag',
  'check-ignore', 'check-attr', 'check-ref-format', 'count-objects', 'fsck', 'var',
]));
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
const GH_URL_EXEMPT_GROUPS = Object.freeze(new Set(['pr', 'issue', 'release', 'run', 'workflow', 'cache']));
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
const GIT_CONFIG_OVERRIDE_KEY_RE = /^(?:credential|user|author|committer|include|includeif|http|url|remote|alias)(?:\.|$)|^core\.(?:askpass|sshcommand)$/i;
const GIT_SCOPE_OVERRIDE_KEY_RE = /^(?:remote|branch|url|include|includeif|alias)(?:\.|$)/i;
const GIT_ALIAS_KEY_RE = /^alias(?:\.|$)/i;
const PS_BLOCK_PREFIXES = Object.freeze(new Set([
  'try', 'catch', 'finally', 'else', 'do', 'begin', 'process', 'end', '%', '?',
  'foreach', 'foreach-object', 'where', 'where-object', 'trap', 'filter',
  'data', 'icm', 'invoke-command', 'measure-command',
]));
const PS_VAR_PREFIX_RE = /^(?:\[[^\]\s]+\])?\$/;

// ------------------------------------------------------------ tokenizer

function buildLineIndex(command) {
  const rawLast = new Map();
  const strippedLast = new Map();
  let pos = 0;
  const n = command.length;
  while (pos < n) {
    const nl = command.indexOf('\n', pos);
    const end = nl === -1 ? n : nl;
    const line = command.slice(pos, end).replace(/\r$/, '');
    rawLast.set(line, pos);
    strippedLast.set(line.replace(/^\t+/, ''), pos);
    if (nl === -1) break;
    pos = nl + 1;
  }
  return { rawLast, strippedLast };
}

function findClosingBacktick(command, openIdx) {
  let k = openIdx + 1;
  const n = command.length;
  while (k < n) {
    const ch = command[k];
    if (ch === '\\' && k + 1 < n) {
      k += 2;
    } else if (ch === '`') {
      return k;
    } else if (ch === '$' && command[k + 1] === "'") {
      k += 2;
      while (k < n) {
        if (command[k] === '\\' && k + 1 < n) k += 2;
        else if (command[k++] === "'") break;
      }
    } else if (ch === "'") {
      k++;
      while (k < n && command[k++] !== "'");
    } else if (ch === '"') {
      k++;
      while (k < n) {
        if (command[k] === '\\' && k + 1 < n) k += 2;
        else if (command[k++] === '"') break;
      }
    } else {
      k++;
    }
  }
  return -1;
}

function unescapeBacktickBody(body, inDoubleQuote) {
  let out = '';
  for (let k = 0; k < body.length; k++) {
    if (body[k] === '\\' && k + 1 < body.length) {
      const nxt = body[k + 1];
      if (nxt === '$' || nxt === '`' || nxt === '\\' || (inDoubleQuote && nxt === '"')) {
        out += nxt;
        k++;
        continue;
      }
    }
    out += body[k];
  }
  return out;
}

function extractPsSubexprs(body) {
  const spans = [];
  let k = 0;
  const len = body.length;
  while (k < len) {
    if (body[k] === '`' && k + 1 < len) {
      k += 2;
    } else if (body[k] === '$' && body[k + 1] === '(') {
      const start = k + 2;
      k = start;
      let depth = 1;
      let inDq = false;
      while (k < len && depth > 0) {
        const ch = body[k];
        if (inDq) {
          if (ch === '`' && k + 1 < len) k += 2;
          else if (ch === '"' && body[k + 1] === '"') k += 2;
          else if (ch === '"') { inDq = false; k++; }
          else if (ch === '$' && body[k + 1] === '(') { depth++; k += 2; }
          else k++;
        } else if (ch === '`' && k + 1 < len) {
          k += 2;
        } else if (ch === "'") {
          k++;
          while (k < len) {
            if (body[k] === "'" && body[k + 1] === "'") k += 2;
            else if (body[k++] === "'") break;
          }
        } else if (ch === '"') {
          inDq = true;
          k++;
        } else if (ch === '(') {
          depth++;
          k++;
        } else if (ch === ')') {
          depth--;
          if (depth === 0) break;
          k++;
        } else {
          k++;
        }
      }
      spans.push(body.slice(start, k));
      if (k < len && body[k] === ')') k++;
    } else {
      k++;
    }
  }
  return spans;
}

/**
 * Tokenize `command` in one shell mode (`bash` true/false), tracking raw tokens,
 * separators, comments, heredocs/here-strings, nested `"$(...)"`, inline line
 * continuations, and quoting metadata.
 */
function tokenizeMode(command, bash, depth = 0) {
  const hasRawNewline = /[\r\n]/.test(command);
  const n = command.length;
  const segments = [];
  const separators = [];
  let tokens = [];
  let rawTokens = [];
  let tokenOffsets = [];
  let prevTokenQuoted = false;
  let prevTokenEscaped = false;
  let current = '';
  let tokStart = -1;
  let started = false;
  let wasQuoted = false;
  let wasEscaped = false;
  let heredocs = [];
  let stopParse = false;
  let sawStopParse = false;
  let sawComment = false;
  let sawHeredoc = false;
  let sawHereString = false;
  let hasSubexprInDoubleQuotes = false;
  let hasExpandableHereStringWithDollar = false;
  let hasBashSubst = false;
  let hasDeepBacktick = false;
  let hasPsSubexpr = false;
  let hasEnvBraced = false;
  let hasDotNetEnv = false;
  let hasNonSemiSep = false;
  let hasEnclosingOrPipeOrBg = false;
  let hasControlKeyword = false;

  // Stack for quotes and nested `"$(...)"` plus arithmetic/brace tracking.
  let inDoubleQuote = false;
  const dqStack = []; // each entry: { tokens, rawTokens, tokenOffsets, prevTokenQuoted, prevTokenEscaped, current, tokStart, started, wasQuoted, wasEscaped, subParenDepth }
  const parenStack = []; // { kind: 'group', caseStack } | { kind: 'arith-pending' } | { kind: 'arith' }
  let arithDepth = 0;
  let psBraceDepth = 0;
  let psLiteralBraceDepth = 0;
  let lineIndex = null;

  const contLenAt = idx => {
    const ch = command[idx];
    if (bash ? ch !== '\\' : ch !== '`') return 0;
    if (command[idx + 1] === '\n') return 2;
    if (command[idx + 1] === '\r' && command[idx + 2] === '\n') return 3;
    return 0;
  };

  const hasClosingDelimiterAfter = (afterIdx, word, strip) => {
    const firstNl = command.indexOf('\n', afterIdx);
    if (firstNl === -1) return false;
    if (!lineIndex) lineIndex = buildLineIndex(command);
    const map = strip ? lineIndex.strippedLast : lineIndex.rawLast;
    const lastPos = map.get(word);
    return lastPos !== undefined && lastPos > firstNl;
  };

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
      const unescapedWord = !wasQuoted && !wasEscaped;
      const prevUnescapedWord = !prevTokenQuoted && !prevTokenEscaped;
      if (unescapedWord && CONTROL_KEYWORDS.has(lower)) {
        if (tokens.length === 0 || (prevUnescapedWord && CONTROL_OPENERS.has(bash ? tokens.at(-1) : tokens.at(-1).toLowerCase()))) {
          hasControlKeyword = true;
        }
      }
      if (bash) {
        const topParen = parenStack.at(-1);
        if (topParen?.kind === 'group') {
          const topCase = topParen.caseStack.at(-1);
          if (unescapedWord && current === 'case' && (tokens.length === 0 || (prevUnescapedWord && CONTROL_OPENERS.has(tokens.at(-1))))) {
            topParen.caseStack.push({ seenIn: false, sawWord: false });
          } else if (topCase && !topCase.seenIn) {
            if (!topCase.sawWord) topCase.sawWord = true;
            else if (unescapedWord && current === 'in') topCase.seenIn = true;
          } else if (unescapedWord && current === 'esac' && topCase && topCase.seenIn && (tokens.length === 0 || (prevUnescapedWord && CONTROL_OPENERS.has(tokens.at(-1))))) {
            topParen.caseStack.pop();
          }
        }
      }
      tokens.push(current);
      rawTokens.push(tokStart >= 0 && rawEnd >= tokStart ? command.slice(tokStart, rawEnd) : current);
      tokenOffsets.push(tokStart);
      prevTokenQuoted = wasQuoted;
      prevTokenEscaped = wasEscaped;
    }
    current = '';
    tokStart = -1;
    started = false;
    wasQuoted = false;
    wasEscaped = false;
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
    prevTokenEscaped = false;
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

    const mergeSubMode = sub => {
      for (const s of sub.segments) segments.push(s);
      hasNonSemiSep = true;
      hasEnclosingOrPipeOrBg = true;
      if (sub.hasControlKeyword) hasControlKeyword = true;
      if (sub.sawComment) sawComment = true;
      if (sub.sawHeredoc) sawHeredoc = true;
      if (sub.hasDeepBacktick) hasDeepBacktick = true;
      if (sub.hasRawNewline) { /* keep outer newline check separate */ }
      if (sub.hasSubexprInDoubleQuotes) hasSubexprInDoubleQuotes = true;
      if (sub.hasExpandableHereStringWithDollar) hasExpandableHereStringWithDollar = true;
    };

    // Inside a double-quoted string (either top-level or nested inside `"$(...)"`)
    if (inDoubleQuote) {
      if (bash) {
        const cl = contLenAt(i);
        if (cl > 0) {
          i += cl;
          continue;
        }
        if (c === '"') {
          inDoubleQuote = false;
          i++;
          continue;
        }
        if (c === '\\' && i + 1 < n && (command[i + 1] === '"' || command[i + 1] === '\\' || command[i + 1] === '`')) {
          current += command[i + 1];
          i += 2;
          continue;
        }
        if (c === '$' && command[i + 1] === '(') {
          hasBashSubst = true;
          parenStack.push(command[i + 2] === '(' ? { kind: 'arith-pending' } : { kind: 'group', caseStack: [] });
          dqStack.push({ tokens, rawTokens, tokenOffsets, prevTokenQuoted, prevTokenEscaped, current, tokStart, started, wasQuoted, wasEscaped, subParenDepth: 1 });
          inDoubleQuote = false;
          tokens = [];
          rawTokens = [];
          tokenOffsets = [];
          prevTokenQuoted = false;
          prevTokenEscaped = false;
          current = '';
          tokStart = -1;
          started = false;
          wasQuoted = false;
          wasEscaped = false;
          hasNonSemiSep = true;
          hasEnclosingOrPipeOrBg = true;
          separators.push('(');
          i += 2;
          continue;
        }
        if (c === '`') {
          hasBashSubst = true;
          if (depth >= 8) {
            hasDeepBacktick = true;
            inDoubleQuote = false;
            endSegment('`', i);
            i++;
            continue;
          }
          const closeIdx = findClosingBacktick(command, i);
          if (closeIdx !== -1) {
            if (closeIdx > i + 1) {
              const inner = unescapeBacktickBody(command.slice(i + 1, closeIdx), true);
              if (inner.trim() !== '') mergeSubMode(tokenizeMode(inner, true, depth + 1));
            }
            current += command.slice(i, closeIdx + 1);
            i = closeIdx + 1;
            continue;
          }
        }
        current += c;
        i++;
      } else {
        const cl = contLenAt(i);
        if (cl > 0) {
          current += '\n';
          i += cl;
          continue;
        }
        if (c === '`' && i + 1 < n) {
          current += command[i + 1];
          i += 2;
          continue;
        }
        if (c === '"') {
          if (command[i + 1] === '"') {
            current += '"';
            i += 2;
          } else {
            inDoubleQuote = false;
            i++;
          }
          continue;
        }
        if (c === '$' && command[i + 1] === '(') {
          hasSubexprInDoubleQuotes = true;
          hasPsSubexpr = true;
          parenStack.push({ kind: 'group', caseStack: [] });
          dqStack.push({ tokens, rawTokens, tokenOffsets, prevTokenQuoted, prevTokenEscaped, current, tokStart, started, wasQuoted, wasEscaped, subParenDepth: 1 });
          inDoubleQuote = false;
          tokens = [];
          rawTokens = [];
          tokenOffsets = [];
          prevTokenQuoted = false;
          prevTokenEscaped = false;
          current = '';
          tokStart = -1;
          started = false;
          wasQuoted = false;
          wasEscaped = false;
          hasNonSemiSep = true;
          hasEnclosingOrPipeOrBg = true;
          separators.push('(');
          i += 2;
          continue;
        }
        if (c === '$' && i + 6 <= n && command.slice(i, i + 6).toLowerCase() === '${env:') hasEnvBraced = true;
        if (c === '[' && /^\[(?:system\.)?environment\]::/i.test(command.slice(i, i + 26))) hasDotNetEnv = true;
        current += c;
        i++;
      }
      continue;
    }

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

    // Escaped backslash pairs in bash must run before line continuations and escaped quotes
    if (bash && c === '\\' && i + 1 < n && command[i + 1] === '\\') {
      startToken(i);
      wasEscaped = true;
      current += '\\';
      i += 2;
      continue;
    }

    // Inline line continuation outside quotes, comments, here-strings, and stop-parsing
    const cl = contLenAt(i);
    if (cl > 0) {
      endToken(i);
      i += cl;
      continue;
    }

    if (!bash && !started && c === '-' && command.startsWith('--%', i) && (i + 3 === n || /[ \t\r\n]/.test(command[i + 3]))) {
      tokens.push('--%');
      rawTokens.push('--%');
      tokenOffsets.push(i);
      prevTokenQuoted = false;
      prevTokenEscaped = false;
      stopParse = true;
      sawStopParse = true;
      i += 3;
      continue;
    }

    // Unquoted backslash / backtick quote escapes outside quotes
    if (bash && c === '\\' && i + 1 < n && command[i + 1] !== '\n' && !(command[i + 1] === '\r' && command[i + 2] === '\n')) {
      startToken(i);
      wasEscaped = true;
      current += command[i + 1];
      i += 2;
      continue;
    } else if (!bash && c === '`' && i + 1 < n) {
      startToken(i);
      current += command[i + 1];
      i += 2;
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
      inDoubleQuote = true;
      i++;
    } else if (!bash && !started && c === '@' && (command[i + 1] === "'" || command[i + 1] === '"')) {
      let j = i + 2;
      while (j < n && (command[j] === ' ' || command[j] === '\t')) j++;
      if (j < n && (command[j] === '\n' || (command[j] === '\r' && command[j + 1] === '\n'))) {
        const q = command[i + 1];
        const close = command.indexOf(`\n${q}@`, j);
        const endIdx = close === -1 ? n : close + 3;
        if (q === '"') {
          const bodyStart = command[j] === '\r' ? j + 2 : j + 1;
          const bodyEnd = close === -1 ? n : close;
          const body = command.slice(bodyStart, bodyEnd);
          if (body.includes('$')) hasExpandableHereStringWithDollar = true;
          if (body.includes('$(') && depth < 8) {
            hasPsSubexpr = true;
            hasSubexprInDoubleQuotes = true;
            for (const sub of extractPsSubexprs(body)) {
              if (sub.trim() !== '') mergeSubMode(tokenizeMode(sub, false, depth + 1));
            }
          }
        }
        sawHereString = true;
        startToken(i);
        wasQuoted = true;
        current += '@';
        i = endIdx;
      } else {
        startToken(i);
        current += c;
        i++;
      }
    } else if (arithDepth === 0 && (bash || (!started && !stopParse)) && c === '<' && command.startsWith('<<', i) && !command.startsWith('<<<', i)) {
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
      if (bash || (delimiter !== '' && hasClosingDelimiterAfter(j, delimiter, strip))) {
        if (delimiter) {
          heredocs.push({ word: delimiter, strip });
          sawHeredoc = true;
        }
        endToken(i);
        tokens.push('<<');
        rawTokens.push('<<');
        tokenOffsets.push(i);
        prevTokenQuoted = false;
        i = j;
      } else {
        startToken(i);
        current += '<<';
        i += 2;
      }
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
    } else if (c === '(') {
      if (dqStack.length > 0) dqStack.at(-1).subParenDepth++;
      if (bash && parenStack.at(-1)?.kind === 'arith-pending') {
        parenStack.push({ kind: 'arith' });
        arithDepth++;
      } else if (bash && command[i + 1] === '(') {
        parenStack.push({ kind: 'arith-pending' });
      } else {
        parenStack.push({ kind: 'group', caseStack: [] });
      }
      endSegment('(', i);
      i++;
    } else if (c === ')') {
      const topParen = parenStack.at(-1);
      if (bash && topParen?.kind === 'group' && topParen.caseStack.at(-1)?.seenIn) {
        endSegment(')', i);
        i++;
        continue;
      }
      const top = parenStack.pop();
      if (top?.kind === 'arith') arithDepth = Math.max(0, arithDepth - 1);
      if (dqStack.length > 0) {
        const frame = dqStack.at(-1);
        frame.subParenDepth--;
        if (frame.subParenDepth === 0) {
          dqStack.pop();
          endSegment(')', i);
          tokens = frame.tokens;
          rawTokens = frame.rawTokens;
          tokenOffsets = frame.tokenOffsets;
          prevTokenQuoted = frame.prevTokenQuoted;
          prevTokenEscaped = frame.prevTokenEscaped;
          current = `${frame.current}$`;
          tokStart = frame.tokStart;
          started = frame.started;
          wasQuoted = frame.wasQuoted;
          wasEscaped = frame.wasEscaped;
          inDoubleQuote = true;
          i++;
          continue;
        }
      }
      endSegment(')', i);
      i++;
    } else if (c === ';' || c === '|') {
      const sep = command.startsWith('||', i) ? '||' : c;
      endSegment(sep, i);
      i += sep.length;
    } else if (!bash && !wasQuoted && c === '=' && i + 1 < n && command[i + 1] !== "'" && command[i + 1] !== '"' && command[i + 1] !== '$' && !/[ \t\r\n]/.test(command[i + 1]) && (
      (tokens.length === 0 && started && PS_VAR_PREFIX_RE.test(current)) ||
      (tokens.length === 1 && PS_VAR_PREFIX_RE.test(tokens[0]) && (!started || current === '+'))
    )) {
      if (started) {
        current += '=';
        endToken(i + 1);
      } else {
        tokens.push('=');
        rawTokens.push('=');
        tokenOffsets.push(i);
        prevTokenQuoted = false;
        prevTokenEscaped = false;
      }
      i++;
    } else if (c === '{' && (bash
      ? (!started && (i + 1 === n || /[\s;&|(){}]/.test(command[i + 1])))
      : (
        (wasQuoted && psBraceDepth > 0) ||
        (!current.endsWith('$') && !current.includes('/') && !current.includes('\\') && (
          !started ||
          psBraceDepth > 0 ||
          current === '.' ||
          current === '@' ||
          current.endsWith('=@') ||
          current.endsWith('=') ||
          /^-[A-Za-z][A-Za-z0-9_-]*$/.test(current) ||
          /^(?:catch|trap)\[/i.test(current) ||
          PS_BLOCK_PREFIXES.has(current.toLowerCase()) ||
          PS_BLOCK_PREFIXES.has(tokens[0]?.toLowerCase() ?? '') ||
          tokens[0]?.toLowerCase() === 'function' ||
          tokens[0]?.toLowerCase() === 'filter'
        ))
      )
    )) {
      if (!bash) psBraceDepth++;
      endSegment('{', i);
      i++;
    } else if (c === '{' && !bash && psBraceDepth > 0) {
      psLiteralBraceDepth++;
      startToken(i);
      current += c;
      i++;
    } else if (c === '}' && !bash && psLiteralBraceDepth > 0) {
      psLiteralBraceDepth--;
      startToken(i);
      current += c;
      i++;
    } else if (c === '}' && (!started || (!bash && psBraceDepth > 0))) {
      if (!bash && psBraceDepth > 0) psBraceDepth--;
      endSegment('}', i);
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
    } else if (bash && c === '`') {
      hasBashSubst = true;
      if (depth >= 8) {
        hasDeepBacktick = true;
        endSegment('`', i);
        i++;
        continue;
      }
      const closeIdx = findClosingBacktick(command, i);
      if (closeIdx !== -1) {
        if (closeIdx > i + 1) {
          const inner = unescapeBacktickBody(command.slice(i + 1, closeIdx), false);
          if (inner.trim() !== '') mergeSubMode(tokenizeMode(inner, true, depth + 1));
        }
        startToken(i);
        current += command.slice(i, closeIdx + 1);
        i = closeIdx + 1;
      } else {
        startToken(i);
        current += c;
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
  while (dqStack.length > 0) {
    const frame = dqStack.pop();
    tokens = frame.tokens;
    rawTokens = frame.rawTokens;
    tokenOffsets = frame.tokenOffsets;
    prevTokenQuoted = frame.prevTokenQuoted;
    current = `${frame.current}$`;
    tokStart = frame.tokStart;
    started = frame.started;
    wasQuoted = frame.wasQuoted;
    endSegment(null, n);
  }

  return {
    segments,
    separators,
    sawStopParse,
    sawComment,
    sawHeredoc,
    sawHereString,
    hasRawNewline,
    hasSubexprInDoubleQuotes,
    hasExpandableHereStringWithDollar,
    hasBashSubst,
    hasDeepBacktick,
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
const WRAPPERS = new Set(['&', 'call']);
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const ENV_BIN = /^env(?:\.exe)?$/i;
const MISE = /^mise(?:\.exe)?$/i;
const NPX = /^npx(?:\.cmd|\.exe)?$/i;
const TIMEOUT_BIN = /^timeout(?:\.exe)?$/i;
const base = t => t.slice(Math.max(t.lastIndexOf('/'), t.lastIndexOf('\\')) + 1);

/**
 * Parse `env` options starting at `start` (pointing to the `env` token).
 */
function scanEnvWrapper(tokens, start) {
  let i = start + 1;
  const ops = []; // { type: 'dir' | 'clear' | 'unset' | 'inline', val? }
  let splitArg = null;
  let hasSplit = false;
  let unknownFlag = false;

  while (tokens[i] !== undefined) {
    const t = tokens[i];
    if (ASSIGNMENT.test(t)) {
      ops.push({ type: 'inline', idx: i });
      i++;
      continue;
    }
    if (t === '--') {
      i++;
      break;
    }
    if (!t.startsWith('-')) break;
    if (t === '-' || t === '-i' || t === '--ignore-environment') {
      ops.push({ type: 'clear' });
      i++;
    } else if (t === '-0' || t === '--null' || t === '-v' || t === '--debug') {
      i++;
    } else if (t === '-u' || t === '--unset') {
      if (tokens[i + 1] === undefined) {
        unknownFlag = true;
        break;
      }
      ops.push({ type: 'unset', val: tokens[i + 1] });
      i += 2;
    } else if (t.startsWith('--unset=')) {
      ops.push({ type: 'unset', val: t.slice('--unset='.length) });
      i++;
    } else if (t === '-C' || t === '--chdir') {
      if (tokens[i + 1] === undefined) {
        unknownFlag = true;
        break;
      }
      ops.push({ type: 'dir', val: tokens[i + 1] });
      i += 2;
    } else if (t.startsWith('--chdir=')) {
      ops.push({ type: 'dir', val: t.slice('--chdir='.length) });
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
          if (ch === 'i') ops.push({ type: 'clear' });
          k++;
        } else if (ch === 'u' || ch === 'C' || ch === 'a' || ch === 'S') {
          const val = k + 1 < t.length ? t.slice(k + 1) : tokens[i + 1];
          if (ch === 'u') {
            if (val === undefined) {
              bad = true;
              break;
            }
            ops.push({ type: 'unset', val });
            if (k + 1 >= t.length) step = 2;
          } else if (ch === 'C') {
            if (val === undefined) {
              bad = true;
              break;
            }
            ops.push({ type: 'dir', val });
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
  return { next: i, ops, hasSplit, splitArg, unknownFlag };
}

function scanTimeWrapper(tokens, start) {
  let k = start + 1;
  while (k < tokens.length) {
    const tok = tokens[k];
    if (tok === '--') return { matched: true, unknownFlag: false, next: k + 1 };
    if (tok === '-p' || tok === '--portability') {
      k++;
      continue;
    }
    if (tok.startsWith('-')) return { matched: true, unknownFlag: true, next: k };
    break;
  }
  return { matched: true, unknownFlag: false, next: k };
}

function scanMiseWrapper(tokens, start) {
  let k = start + 1;
  const dirs = [];
  let unknownFlag = false;
  while (k < tokens.length) {
    const tok = tokens[k];
    if (tok === 'x' || tok === 'exec') break;
    if (tok === '-C' || tok === '--cd') {
      if (k + 1 >= tokens.length) { unknownFlag = true; break; }
      dirs.push(tokens[k + 1]);
      k += 2;
    } else if (tok.startsWith('-C') && tok.length > 2) {
      dirs.push(tok.slice(2));
      k++;
    } else if (tok.startsWith('--cd=')) {
      dirs.push(tok.slice('--cd='.length));
      k++;
    } else if (tok === '-E' || tok === '--env' || tok === '-j' || tok === '--jobs') {
      if (k + 1 >= tokens.length) { unknownFlag = true; break; }
      k += 2;
    } else if ((tok.startsWith('-E') && tok.length > 2) || tok.startsWith('--env=') || (tok.startsWith('-j') && tok.length > 2) || tok.startsWith('--jobs=')) {
      k++;
    } else if (tok === '-q' || tok === '--quiet' || tok === '-y' || tok === '--yes' || /^-[qy]+$/.test(tok)) {
      k++;
    } else if (tok.startsWith('-')) {
      unknownFlag = true;
      break;
    } else {
      break;
    }
  }
  if (unknownFlag) return { matched: true, unknownFlag: true, next: k, dirs };
  if (tokens[k] !== 'x' && tokens[k] !== 'exec') return { matched: false };
  k++;
  while (k < tokens.length) {
    const tok = tokens[k];
    if (tok === '--') {
      k++;
      break;
    }
    if (tok === '-C' || tok === '--cd') {
      if (k + 1 >= tokens.length || tokens[k + 1] === '--') { unknownFlag = true; break; }
      dirs.push(tokens[k + 1]);
      k += 2;
    } else if (tok.startsWith('-C') && tok.length > 2) {
      dirs.push(tok.slice(2));
      k++;
    } else if (tok.startsWith('--cd=')) {
      dirs.push(tok.slice('--cd='.length));
      k++;
    } else if (tok === '-E' || tok === '--env' || tok === '-j' || tok === '--jobs') {
      if (k + 1 >= tokens.length || tokens[k + 1] === '--') { unknownFlag = true; break; }
      k += 2;
    } else if ((tok.startsWith('-E') && tok.length > 2) || tok.startsWith('--env=') || (tok.startsWith('-j') && tok.length > 2) || tok.startsWith('--jobs=')) {
      k++;
    } else if (tok === '-q' || tok === '--quiet' || tok === '-y' || tok === '--yes' || tok === '--raw' || /^-[qy]+$/.test(tok) || tok.includes('@')) {
      k++;
    } else if (tok.startsWith('-')) {
      unknownFlag = true;
      break;
    } else {
      break;
    }
  }
  return { matched: true, unknownFlag, next: k, dirs };
}

function scanLeadingRedir(tokens, idx) {
  const tok = tokens[idx];
  if (tok === undefined) return idx;
  if (tok === '<<') return idx + 1;
  if (/^(?:\d*(?:>>?|<<<|<>|<)|&>>?)$/.test(tok)) {
    return tokens[idx + 1] !== undefined ? idx + 2 : idx + 1;
  }
  if (/^(?:\d*(?:>>?|<<<|<>|<)|&>>?).+$/.test(tok)) {
    return idx + 1;
  }
  return idx;
}

function scanTimeoutWrapper(tokens, start) {
  let k = start + 1;
  while (k < tokens.length) {
    const tok = tokens[k];
    if (tok === '--') {
      k++;
      break;
    }
    if (!tok.startsWith('-') || tok === '-') break;
    if (tok === '--foreground' || tok === '--preserve-status' || tok === '-v' || tok === '--verbose') {
      k++;
    } else if (tok === '-k' || tok === '--kill-after' || tok === '-s' || tok === '--signal') {
      if (k + 1 >= tokens.length) return { matched: true, unknownFlag: true, next: k };
      k += 2;
    } else if ((tok.startsWith('-k') && tok.length > 2) || tok.startsWith('--kill-after=') || (tok.startsWith('-s') && tok.length > 2) || tok.startsWith('--signal=')) {
      k++;
    } else {
      return { matched: true, unknownFlag: true, next: k };
    }
  }
  const dur = tokens[k];
  if (dur !== undefined) {
    if (/^\+?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?[smhd]?$/i.test(dur) || /^inf(?:inity)?$/i.test(dur)) {
      k++;
    } else {
      return { matched: true, unknownFlag: true, next: k };
    }
  }
  return { matched: true, unknownFlag: false, next: k };
}

const FAST_LOWER_PROG_RE = /^[a-z0-9-]+$/;
const FAST_WRAPPER_WORDS = new Set(['env', 'time', 'timeout', 'mise', 'npx', 'call']);
/** The index of the program a segment runs, past its wrappers; the segment's length when there is none. */
export function programAt(tokens) {
  let i = 0;
  for (;;) {
    const t = tokens[i];
    if (t === undefined) return tokens.length;
    if (FAST_LOWER_PROG_RE.test(t) && !FAST_WRAPPER_WORDS.has(t)) return i;
    const redirNext = scanLeadingRedir(tokens, i);
    if (redirNext > i) {
      i = redirNext;
      continue;
    }
    if (WRAPPERS.has(t) || (t.includes('=') && ASSIGNMENT.test(t))) i++;
    else if (base(t) === 'time') {
      const tw = scanTimeWrapper(tokens, i);
      if (tw.unknownFlag) return i;
      i = tw.next;
    } else if (t.length >= 3 && ENV_BIN.test(base(t))) {
      const ev = scanEnvWrapper(tokens, i);
      if (ev.hasSplit || ev.unknownFlag) return i;
      i = ev.next;
    } else if (PS_VAR_PREFIX_RE.test(t) && (tokens[i + 1] === '=' || tokens[i + 1] === '+=')) i += 2;
    else if (PS_VAR_PREFIX_RE.test(t) && t.endsWith('=')) i++;
    else if (TIMEOUT_BIN.test(base(t))) {
      const tw = scanTimeoutWrapper(tokens, i);
      if (tw.unknownFlag) return i;
      i = tw.next;
    } else if (t.length >= 4 && MISE.test(base(t))) {
      const mw = scanMiseWrapper(tokens, i);
      if (!mw.matched || mw.unknownFlag) return i;
      i = mw.next;
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
  try {
    if (pinFile !== undefined) return pinFile instanceof URL ? fileURLToPath(pinFile) : String(pinFile);
    const tbl = tableFile instanceof URL ? fileURLToPath(tableFile) : String(tableFile);
    return `${dirname(dirname(tbl))}/github.json`.replaceAll('\\', '/');
  } catch {
    fail('pin');
  }
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
  if (
    !sameKeys(pin, ['owner', 'apps']) ||
    !sameKeys(pin.owner, ['login', 'id']) ||
    typeof pin.owner.login !== 'string' ||
    !LOGIN_RE.test(pin.owner.login) ||
    !isId(pin.owner.id) ||
    !isPlainObject(pin.apps)
  ) {
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
  // Unknown env flag (including GNU long-option abbreviations like `--sp` / `--split`): fail closed on remaining tokens.
  if (hasGhTok || tail.some(t => /\bgh\b/i.test(t))) return { type: 'env-unknown', kind: 'gh' };
  if (hasGitTok || tail.some(t => /\bgit\b/i.test(t))) return { type: 'env-unknown', kind: 'git' };
  if (/^--sp/i.test(tail[0] ?? '')) {
    const first = tail[0];
    const eqIdx = first.indexOf('=');
    const spArgs = eqIdx !== -1 ? [first.slice(eqIdx + 1), ...tail.slice(1)] : tail.slice(1);
    if (spArgs.length === 0 || spArgs.some(a => a === '' || /[\\$'"`;|&(){}<>\r\n=]/.test(a))) {
      return { type: 'env-unknown', kind: 'ambiguous' };
    }
    return null;
  }
  if (tail.some(t => /[\\$'"`;|&(){}<>\r\n=]/.test(t))) return { type: 'env-unknown', kind: 'ambiguous' };
  return null;
}

function inspectWrapperUnknown(tokens, idx) {
  const t = tokens[idx];
  if (!t) return null;
  const b = base(t);
  if (t.length >= 3 && ENV_BIN.test(b)) return inspectEnvSplitOrUnknown(tokens, idx);
  let tail = null;
  if (b === 'time') {
    const tw = scanTimeWrapper(tokens, idx);
    if (tw.unknownFlag) tail = tokens.slice(tw.next);
  } else if (TIMEOUT_BIN.test(b)) {
    const tw = scanTimeoutWrapper(tokens, idx);
    if (tw.unknownFlag) tail = tokens.slice(tw.next);
  } else if (t.length >= 4 && MISE.test(b)) {
    const mw = scanMiseWrapper(tokens, idx);
    if (mw.matched && mw.unknownFlag) tail = tokens.slice(mw.next);
  }
  if (!tail) return null;
  if (tail.some(x => programName(x) === 'gh' || /\bgh\b/i.test(x))) return { type: 'wrapper-unknown', kind: 'gh' };
  if (tail.some(x => programName(x) === 'git' || /\bgit\b/i.test(x))) return { type: 'wrapper-unknown', kind: 'git' };
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
  const configEnvOpts = [];
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
    } else if (t === '--exec-path' || t.startsWith('--exec-path=')) {
      hasExecPathOpt = true;
      i++;
    } else if (
      t === '--git-dir' || t === '--work-tree' || t === '--namespace' ||
      t === '--config-env' || t === '--super-prefix' || t === '--list-cmds' || t === '--attr-source'
    ) {
      if (i + 1 >= args.length) {
        hasUnknownLeadingOpt = true;
        break;
      }
      if (t === '--git-dir') hasGitDirOpt = true;
      if (t === '--config-env') {
        hasConfigEnvOpt = true;
        configEnvOpts.push(args[i + 1]);
      }
      i += 2;
    } else if (
      t.startsWith('--git-dir=') || t.startsWith('--work-tree=') || t.startsWith('--namespace=') ||
      t.startsWith('--config-env=') || t.startsWith('--super-prefix=') || t.startsWith('--list-cmds=') || t.startsWith('--attr-source=')
    ) {
      if (t.startsWith('--git-dir=')) hasGitDirOpt = true;
      if (t.startsWith('--config-env=')) {
        hasConfigEnvOpt = true;
        configEnvOpts.push(t.slice('--config-env='.length));
      }
      i++;
    } else if (GIT_GLOBAL_NOARG_OPTS.has(t)) {
      i++;
    } else {
      hasUnknownLeadingOpt = true;
      break;
    }
  }

  const hasAliasOpt =
    cOpts.some(co => GIT_ALIAS_KEY_RE.test(co.val.includes('=') ? co.val.slice(0, co.val.indexOf('=')) : co.val)) ||
    configEnvOpts.some(ce => GIT_ALIAS_KEY_RE.test(ce.includes('=') ? ce.slice(0, ce.indexOf('=')) : ce));
  const rawSubcmd = !hasUnknownLeadingOpt && i < args.length && !args[i].startsWith('-') ? args[i] : null;
  const subcmd = rawSubcmd ? rawSubcmd.replaceAll('\\', '') : null;
  const subcmdTokenIdx = rawSubcmd ? at + 1 + i : -1;
  const subArgs = rawSubcmd ? args.slice(i + 1) : [];
  const isGuarded = hasUnknownLeadingOpt || hasAliasOpt || (subcmd !== null && GIT_WRITE_SUBCOMMANDS.has(subcmd));
  return { isGuarded, dirs, cOpts, hasGitDirOpt, hasConfigEnvOpt, hasExecPathOpt, hasUnknownLeadingOpt, hasAliasOpt, subcmd, subcmdTokenIdx, subArgs };
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
        if (t === '--help' || (t === '-h' && restArgs.length === 1)) sawHelp = true;
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

  const group = args[idx].replaceAll('\\', '');
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

  const readVerbs = GH_READ_VERBS[group];
  if (!readVerbs) {
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

  const verb = restArgs[k].replaceAll('\\', '');
  const afterVerb = restArgs.slice(k + 1);

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
        .some(rawTok => {
          const tok = rawTok.replaceAll('\\', '');
          return /^-[A-Za-z]*t/.test(tok) || tok === '--show-token' || tok.startsWith('--show-token=');
        });
      if (hasShowToken) {
        return { isWrite: true, group, verb, isFreeText: false, accountScoped: true, globalRepos, hostnames: globalHostnames, afterVerb };
      }
    }
    return { isWrite: false };
  }

  const isFreeText = Boolean(GH_FREE_TEXT_WRITES[group]?.has(verb));
  return { isWrite: true, group, verb, isFreeText, accountScoped: group === 'auth', globalRepos, hostnames: globalHostnames, restArgs, afterVerb };
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
    const verifiedBase = resolveNoSymlinks(null, baseAbs, platform, { expectDir: true });
    if (!verifiedBase) return null;
    const split = splitAbsPath(verifiedBase, isWin);
    root = split.root;
    curParts = split.parts;
  }

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

  const scanPhysicalLine = (rawLine, inQ) => {
    for (let k = 0; k < rawLine.length; k++) {
      const ch = rawLine[k];
      if (inQ) {
        if (ch === '\\' && k + 1 < rawLine.length) k++;
        else if (ch === '"') inQ = false;
      } else {
        if (ch === '"') inQ = true;
        else if (ch === '#' || ch === ';') return { text: rawLine.slice(0, k), hasComment: true, inQ };
      }
    }
    return { text: rawLine, hasComment: false, inQ };
  };

  for (let li = 0; li < lines.length; li++) {
    let line = '';
    let inQ = false;
    for (;;) {
      const scanned = scanPhysicalLine(lines[li], inQ);
      inQ = scanned.inQ;
      if (scanned.hasComment) {
        line += scanned.text;
        break;
      }
      let trailingSlashes = 0;
      for (let k = scanned.text.length - 1; k >= 0 && scanned.text[k] === '\\'; k--) trailingSlashes++;
      if (trailingSlashes % 2 === 1 && li + 1 < lines.length) {
        line += scanned.text.slice(0, -1);
        li++;
      } else {
        line += scanned.text;
        break;
      }
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

  const uq = unquotePsLiteral(rawRhs);
  if (!uq) return false;
  if (uq.kind === 'single') {
    if (uq.val.includes('$') || uq.val.startsWith('~')) return false;
    return normComparePath(uq.val, isWin) === want;
  }
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
  return {
    name: tok.slice(0, eq),
    val: tok.slice(eq + 1),
    rawRhs: rawTok.slice(rawEq + 1),
    escapedName: rawTok.slice(0, rawEq).includes('\\'),
  };
}

function parsePsEnvAssign(tokens, rawTokens) {
  if (tokens.length === 0) return null;
  const t0 = tokens[0];
  const c0 = t0.charCodeAt(0);
  if (c0 !== 36 && c0 !== 91) return null;
  const r0 = rawTokens[0] ?? '';
  if (/^['"]/.test(r0)) return null;
  const typeMatch = /^(\[[^\]\s]+\])(.+)$/.exec(t0);
  const hasTypeCast = Boolean(typeMatch);
  const lhs = typeMatch ? typeMatch[2] : t0;
  const lowerLhs = lhs.toLowerCase();
  let varName = '';
  let rest = '';
  if (lowerLhs.startsWith('$env:')) {
    const eq0 = lhs.indexOf('=', 5);
    if (eq0 !== -1) {
      const opStart = eq0 > 5 && lhs[eq0 - 1] === '+' ? eq0 - 1 : eq0;
      varName = lhs.slice(5, opStart);
      rest = lhs.slice(opStart);
    } else {
      varName = lhs.slice(5);
    }
  } else if (lowerLhs.startsWith('${env:')) {
    const closeBrace = lhs.indexOf('}', 6);
    if (closeBrace <= 6) return null;
    varName = lhs.slice(6, closeBrace);
    rest = lhs.slice(closeBrace + 1);
  } else {
    return null;
  }
  if (!varName) return null;
  const tainted = hasTypeCast;
  if (rest === '') {
    const op = tokens[1];
    if (op === '=' || op === '+=') {
      const isPlusEq = op === '+=';
      const r1 = rawTokens[1] ?? op;
      if (r1.length > op.length) {
        return { varName, rawRhs: r1.slice(op.length), exactAllowed: tokens.length === 2 && !tainted && !isPlusEq, taintedAssign: tainted || isPlusEq };
      }
      return { varName, rawRhs: rawTokens[2] ?? '', exactAllowed: tokens.length === 3 && rawTokens[2] !== undefined && !tainted && !isPlusEq, taintedAssign: tainted || isPlusEq };
    }
    if (op?.startsWith('=') || op?.startsWith('+=')) {
      const isPlusEq = op.startsWith('+=');
      const opLen = isPlusEq ? 2 : 1;
      if (op.length > opLen) {
        return { varName, rawRhs: (rawTokens[1] ?? '').slice(opLen), exactAllowed: tokens.length === 2 && !tainted && !isPlusEq, taintedAssign: tainted || isPlusEq };
      }
    }
    return null;
  }
  const isPlusEq = rest.startsWith('+=');
  const opStr = isPlusEq ? '+=' : '=';
  if (!rest.startsWith(opStr)) return null;
  const rawOp = r0.indexOf(opStr);
  if (rest === opStr) {
    if (rawOp !== -1 && rawOp + opStr.length < r0.length) {
      return { varName, rawRhs: r0.slice(rawOp + opStr.length), exactAllowed: tokens.length === 1 && !tainted && !isPlusEq, taintedAssign: tainted || isPlusEq };
    }
    return { varName, rawRhs: rawTokens[1] ?? '', exactAllowed: tokens.length === 2 && rawTokens[1] !== undefined && !tainted && !isPlusEq, taintedAssign: tainted || isPlusEq };
  }
  return { varName, rawRhs: rawOp === -1 ? '' : r0.slice(rawOp + opStr.length), exactAllowed: tokens.length === 1 && !tainted && !isPlusEq, taintedAssign: tainted || isPlusEq };
}

const GUARDED_ENV_NAMES = new Set([
  'GIT_CONFIG_GLOBAL', 'GIT_TERMINAL_PROMPT', 'GH_REPO', 'HOME', 'USERPROFILE',
  'GIT_DIR', 'GIT_CONFIG', 'GIT_COMMON_DIR', 'GIT_CONFIG_SYSTEM',
  'GIT_CONFIG_COUNT', 'GIT_CONFIG_PARAMETERS', 'GIT_ASKPASS', 'SSH_ASKPASS',
]);

/**
 * Analyze a single shell mode linearly, computing per-segment state for
 * `GIT_CONFIG_GLOBAL`, `GH_REPO`, `GIT_DIR` / `GIT_CONFIG*`, askpass/system overrides, and `cd`/`env -S`.
 */
function analyzeMode(modeInfo, bash, { env, platform, expectedGitconfig, homeDir }) {
  const isWin = platform === 'win32';
  const envHome = getEnvVar(env, 'HOME', isWin);
  const envUserProfile = getEnvVar(env, 'USERPROFILE', isWin);
  const envGitConfigGlobal = getEnvVar(env, 'GIT_CONFIG_GLOBAL', isWin);
  const envGitTerminalPrompt = getEnvVar(env, 'GIT_TERMINAL_PROMPT', isWin);
  const envGitConfigCount = getEnvVar(env, 'GIT_CONFIG_COUNT', isWin);
  const envGitConfigParams = getEnvVar(env, 'GIT_CONFIG_PARAMETERS', isWin);
  const envGitConfigSystem = getEnvVar(env, 'GIT_CONFIG_SYSTEM', isWin);
  const envGitAskPass = getEnvVar(env, 'GIT_ASKPASS', isWin);
  const envSshAskPass = getEnvVar(env, 'SSH_ASKPASS', isWin);
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
  let gitConfigGlobalExported = envGitConfigGlobal !== undefined;
  let unexportedNonExpectedGitConfig = false;
  let curExportNonExpectedGitConfig = Boolean(
    envGitConfigGlobal &&
    (!expectedGitconfig || normComparePath(envGitConfigGlobal, isWin) !== normComparePath(expectedGitconfig, isWin)),
  );
  let lastGitConfigAssignSegIdx = -1;
  let lastGhRepoAssignSegIdx = -1;
  let gitConfigDisqualified = globalModeDisqualified || (envGitTerminalPrompt !== undefined && envGitTerminalPrompt !== '0');
  let envGitConfigOk = envVarAllowed && Boolean(expectedGitconfig && envGitConfigGlobal && normComparePath(envGitConfigGlobal, isWin) === normComparePath(expectedGitconfig, isWin));

  let curGhRepo = envGhRepo ?? '';
  let ghRepoTainted = globalModeDisqualified || (!envVarAllowed && Boolean(envGhRepo));
  let gitDirTainted = Boolean(envGitDir);
  let gitConfigTainted = Boolean(envGitConfig);
  let gitCommonDirTainted = Boolean(envGitCommonDir);
  let gitConfigSystemTainted = Boolean(envGitConfigSystem !== undefined && envGitConfigSystem !== '');
  let gitConfigCountTainted = Boolean(
    (envGitConfigCount !== undefined && envGitConfigCount !== '') ||
    (envGitConfigParams !== undefined && envGitConfigParams !== '') ||
    (!bash && (modeInfo.hasDotNetEnv || modeInfo.hasEnvBraced)),
  );
  let askpassTainted = Boolean((envGitAskPass !== undefined && envGitAskPass !== '') || (envSshAskPass !== undefined && envSshAskPass !== ''));
  let homeTainted = globalModeDisqualified;
  let userProfileTainted = globalModeDisqualified;
  let sawCd = false;
  let sawEnvSplitBefore = false;

  const isNameMatch = (a, target) => (isWin || !bash ? a.toUpperCase() === target : a === target);
  const isGuardedName = name => (isWin || !bash ? GUARDED_ENV_NAMES.has(name.toUpperCase()) : GUARDED_ENV_NAMES.has(name));

  const applyUnset = name => {
    if (isNameMatch(name, 'GIT_CONFIG_GLOBAL')) {
      curExportGitConfigOk = false;
      envGitConfigOk = false;
      curExportNonExpectedGitConfig = false;
      gitConfigGlobalExported = false;
      unexportedNonExpectedGitConfig = false;
      lastGitConfigAssignSegIdx = -1;
    } else if (isNameMatch(name, 'GIT_TERMINAL_PROMPT')) {
      curExportGitConfigOk = false;
      envGitConfigOk = false;
    }
    if (isNameMatch(name, 'GH_REPO')) {
      curGhRepo = '';
      ghRepoTainted = true;
      lastGhRepoAssignSegIdx = -1;
    }
    if (isNameMatch(name, 'HOME')) homeTainted = true;
    if (isNameMatch(name, 'USERPROFILE')) userProfileTainted = true;
    if (isNameMatch(name, 'GIT_DIR')) gitDirTainted = false;
    if (isNameMatch(name, 'GIT_CONFIG')) gitConfigTainted = false;
    if (isNameMatch(name, 'GIT_COMMON_DIR')) gitCommonDirTainted = false;
    if (isNameMatch(name, 'GIT_CONFIG_SYSTEM')) gitConfigSystemTainted = true;
    if (isNameMatch(name, 'GIT_CONFIG_COUNT') || isNameMatch(name, 'GIT_CONFIG_PARAMETERS')) gitConfigCountTainted = true;
    if (isNameMatch(name, 'GIT_ASKPASS') || isNameMatch(name, 'SSH_ASKPASS')) askpassTainted = true;
  };

  const applyExportOrSet = (name, rawRhs, exactAllowed, segIdx, taintedAssign = false) => {
    if (isNameMatch(name, 'GIT_CONFIG_GLOBAL')) {
      if (bash) gitConfigGlobalExported = true;
      unexportedNonExpectedGitConfig = false;
      if ((!bash && rawRhs === '') || (bash && rawRhs === '$' && modeInfo.hasBashSubst)) {
        gitConfigCountTainted = true;
      }
      if (taintedAssign) {
        curExportGitConfigOk = false;
        envGitConfigOk = false;
        lastGitConfigAssignSegIdx = -1;
        curExportNonExpectedGitConfig = true;
      } else if (exactAllowed && exportsAllowed && !gitConfigDisqualified && expectedGitconfig) {
        curExportGitConfigOk = evalGitConfigRhs(rawRhs, bash, {
          fromEnvWrapper: false, expectedPath: expectedGitconfig, homeDir, envHome, envUserProfile, homeTainted, userProfileTainted, isWin,
        });
        if (curExportGitConfigOk) {
          curExportNonExpectedGitConfig = false;
          lastGitConfigAssignSegIdx = segIdx;
        } else {
          envGitConfigOk = false;
          lastGitConfigAssignSegIdx = -1;
          curExportNonExpectedGitConfig = rawRhs !== '' && rawRhs !== "''" && rawRhs !== '""' && (bash || rawRhs.toLowerCase() !== '$null');
        }
      } else {
        curExportGitConfigOk = false;
        envGitConfigOk = false;
        lastGitConfigAssignSegIdx = -1;
        curExportNonExpectedGitConfig = rawRhs !== '' && rawRhs !== "''" && rawRhs !== '""' && (bash || rawRhs.toLowerCase() !== '$null');
      }
    } else if (isNameMatch(name, 'GH_REPO')) {
      if (exactAllowed && exportsAllowed && !globalModeDisqualified) {
        const r = evalGhRepoRhs(rawRhs, bash);
        if (r.ok) {
          curGhRepo = r.val;
          ghRepoTainted = false;
          lastGhRepoAssignSegIdx = r.val !== '' ? segIdx : -1;
        } else {
          ghRepoTainted = true;
          lastGhRepoAssignSegIdx = -1;
        }
      } else {
        ghRepoTainted = true;
        lastGhRepoAssignSegIdx = -1;
      }
    } else if (isNameMatch(name, 'HOME')) {
      homeTainted = true;
    } else if (isNameMatch(name, 'USERPROFILE')) {
      userProfileTainted = true;
    } else if (isNameMatch(name, 'GIT_CONFIG_COUNT') || isNameMatch(name, 'GIT_CONFIG_PARAMETERS')) {
      gitConfigCountTainted = true;
    } else if (isNameMatch(name, 'GIT_TERMINAL_PROMPT')) {
      if (!exactAllowed || (rawRhs !== "'0'" && rawRhs !== '"0"' && rawRhs !== '0')) {
        curExportGitConfigOk = false;
        envGitConfigOk = false;
        gitConfigDisqualified = true;
      }
    } else if (isNameMatch(name, 'GIT_ASKPASS') || isNameMatch(name, 'SSH_ASKPASS')) {
      askpassTainted = true;
    } else if (isNameMatch(name, 'GIT_CONFIG_SYSTEM')) {
      gitConfigSystemTainted = true;
    } else if (isNameMatch(name, 'GIT_DIR')) {
      gitDirTainted = true;
    } else if (isNameMatch(name, 'GIT_CONFIG')) {
      gitConfigTainted = true;
    } else if (isNameMatch(name, 'GIT_COMMON_DIR')) {
      gitCommonDirTainted = true;
    }
  };

  const segStates = [];
  let hasAnyModeGitAssign = false;
  let hasAnyModeGhRepo = false;
  for (let idx = 0; idx < modeInfo.segments.length; idx++) {
    const seg = modeInfo.segments[idx];
    const { tokens, rawTokens } = seg;
    const at = seg.at ?? programAt(tokens);
    const prog = seg.prog ?? (at < tokens.length ? programName(tokens[at]) : '');
    let segSawDisqualifier = false;

    if (prog === 'cmd' && tokens.slice(at + 1).some(t => /^\/[cd](?:$|:)/i.test(t))) {
      gitConfigDisqualified = true;
      ghRepoTainted = true;
      homeTainted = true;
      userProfileTainted = true;
      segSawDisqualifier = true;
    }

    if (!bash) {
      if (PS_ENV_ITEM_CMDS.has(prog) && tokens.slice(at + 1).some(t => /(?:^|[^A-Za-z0-9_])env:/i.test(t))) {
        gitConfigDisqualified = true;
        gitConfigCountTainted = true;
        ghRepoTainted = true;
        homeTainted = true;
        userProfileTainted = true;
        segSawDisqualifier = true;
      }
      if (PS_VAR_CMDS.has(prog) && tokens.slice(at + 1).some(t => /^\$?(?:home|userprofile|git_config_global|gh_repo|git_dir|git_config|git_common_dir|git_config_system|git_config_count|git_config_parameters|git_askpass|ssh_askpass)$/i.test(t))) {
        gitConfigDisqualified = true;
        ghRepoTainted = true;
        homeTainted = true;
        userProfileTainted = true;
        segSawDisqualifier = true;
      }
    }

    if (bash && prog === 'unset') {
      for (const arg of tokens.slice(at + 1)) {
        if (!arg.startsWith('-')) {
          applyUnset(arg);
          if (isGuardedName(arg)) segSawDisqualifier = true;
        }
      }
    }

    if (bash && (prog === 'export' || prog === 'declare' || prog === 'typeset' || prog === 'readonly')) {
      const args = tokens.slice(at + 1);
      const hasFlag = args.some(a => a.startsWith('-') || a.startsWith('+'));
      const isExactExport = prog === 'export' && tokens.length === 2 && !hasFlag && ASSIGNMENT.test(tokens[1]);
      if (isExactExport) {
        const asg = splitAssign(tokens[1], rawTokens[1]);
        if (asg) {
          applyExportOrSet(asg.name, asg.rawRhs, !asg.escapedName, idx);
          if (isGuardedName(asg.name)) segSawDisqualifier = true;
        }
      } else {
        for (const a of args) {
          if (a.startsWith('-') || a.startsWith('+')) continue;
          const eqPos = a.indexOf('=');
          const name = eqPos !== -1 ? a.slice(0, eqPos) : a;
          const rhs = eqPos !== -1 ? a.slice(eqPos + 1) : '';
          if (eqPos === -1 && isNameMatch(name, 'GIT_CONFIG_GLOBAL')) {
            gitConfigGlobalExported = true;
            curExportGitConfigOk = false;
            envGitConfigOk = false;
            lastGitConfigAssignSegIdx = -1;
            if (unexportedNonExpectedGitConfig) curExportNonExpectedGitConfig = true;
            unexportedNonExpectedGitConfig = false;
          } else {
            applyExportOrSet(name, rhs, false, idx);
          }
          if (isGuardedName(name)) segSawDisqualifier = true;
        }
        if (hasFlag && args.some(a => isNameMatch(a.split('=')[0], 'GIT_CONFIG_GLOBAL'))) {
          curExportGitConfigOk = false;
          envGitConfigOk = false;
          gitConfigDisqualified = true;
          segSawDisqualifier = true;
        }
        if (hasFlag && args.some(a => isNameMatch(a.split('=')[0], 'HOME'))) {
          homeTainted = true;
          segSawDisqualifier = true;
        }
        if (hasFlag && args.some(a => isNameMatch(a.split('=')[0], 'GH_REPO'))) {
          ghRepoTainted = true;
          segSawDisqualifier = true;
        }
      }
    }

    const psEnvAssign = !bash ? parsePsEnvAssign(tokens, rawTokens) : null;
    const isLiteralPsEnvAssign = Boolean(psEnvAssign?.exactAllowed && (/^['"]/.test(psEnvAssign.rawRhs) || psEnvAssign.rawRhs.toLowerCase() === '$null'));
    if (psEnvAssign) {
      applyExportOrSet(psEnvAssign.varName, psEnvAssign.rawRhs, isLiteralPsEnvAssign, idx, psEnvAssign.taintedAssign);
      if (isGuardedName(psEnvAssign.varName)) segSawDisqualifier = true;
    }

    // Inspect inline assignments and `env` wrappers in execution order on THIS segment
    const segEnvDirs = [];
    let segEnvCleared = false;
    let segEnvClearedGhRepo = false;
    const segEnvUnsets = [];
    let segSplitOrUnknown = null;
    let inlineGitConfigLast = null;
    let inlineGhRepoLast = null;
    let inlineOverridesCount = false;
    let inlineOverridesAskpass = false;
    let inlineOverridesSystem = false;
    let inlineOverridesGitDir = false;
    let inlineTaintsHome = false;

    const recordInlineAssign = (tok, rawTok, fromEnvWrapper) => {
      const asg = splitAssign(tok, rawTok);
      if (!asg) return;
      if (isGuardedName(asg.name)) segSawDisqualifier = true;
      if (isNameMatch(asg.name, 'GIT_CONFIG_GLOBAL')) inlineGitConfigLast = { rawRhs: asg.rawRhs, fromEnvWrapper, escapedName: asg.escapedName };
      else if (isNameMatch(asg.name, 'GH_REPO')) inlineGhRepoLast = asg.escapedName && !fromEnvWrapper ? null : asg.rawRhs;
      else if (isNameMatch(asg.name, 'GIT_CONFIG_COUNT') || isNameMatch(asg.name, 'GIT_CONFIG_PARAMETERS')) inlineOverridesCount = true;
      else if (isNameMatch(asg.name, 'GIT_TERMINAL_PROMPT') && asg.val !== '0') inlineOverridesCount = true;
      else if (isNameMatch(asg.name, 'GIT_ASKPASS') || isNameMatch(asg.name, 'SSH_ASKPASS')) inlineOverridesAskpass = true;
      else if (isNameMatch(asg.name, 'GIT_CONFIG_SYSTEM')) inlineOverridesSystem = true;
      else if (isNameMatch(asg.name, 'GIT_DIR') || isNameMatch(asg.name, 'GIT_CONFIG') || isNameMatch(asg.name, 'GIT_COMMON_DIR')) inlineOverridesGitDir = true;
      else if (isNameMatch(asg.name, 'HOME') || isNameMatch(asg.name, 'USERPROFILE')) inlineTaintsHome = true;
    };

    let j = 0;
    while (j < at) {
      const t = tokens[j];
      const rt = rawTokens[j];
      const redirNext = scanLeadingRedir(tokens, j);
      if (redirNext > j) {
        j = redirNext;
        continue;
      }
      if (ASSIGNMENT.test(t)) {
        recordInlineAssign(t, rt, false);
        j++;
      } else if (base(t) === 'time') {
        const tw = scanTimeWrapper(tokens, j);
        if (tw.unknownFlag) {
          segSplitOrUnknown = inspectWrapperUnknown(tokens, j);
          break;
        }
        j = tw.next;
      } else if (t.length >= 3 && ENV_BIN.test(base(t))) {
        const probe = inspectEnvSplitOrUnknown(tokens, j);
        if (probe) {
          segSplitOrUnknown = probe;
          break;
        }
        const ev = scanEnvWrapper(tokens, j);
        for (const op of ev.ops) {
          if (op.type === 'dir') {
            segEnvDirs.push(op.val);
          } else if (op.type === 'clear') {
            segEnvCleared = true;
            segEnvClearedGhRepo = true;
            segSawDisqualifier = true;
            inlineGitConfigLast = null;
            inlineGhRepoLast = null;
          } else if (op.type === 'unset') {
            segEnvUnsets.push(op.val);
            if (isGuardedName(op.val)) segSawDisqualifier = true;
            if (isNameMatch(op.val, 'GIT_CONFIG_GLOBAL') || isNameMatch(op.val, 'GIT_TERMINAL_PROMPT')) {
              inlineGitConfigLast = null;
            }
            if (isNameMatch(op.val, 'GH_REPO')) {
              segEnvClearedGhRepo = true;
              inlineGhRepoLast = null;
            }
          } else if (op.type === 'inline') {
            recordInlineAssign(tokens[op.idx], rawTokens[op.idx], true);
          }
        }
        j = ev.next;
      } else if (WRAPPERS.has(t)) {
        j++;
      } else if (PS_VAR_PREFIX_RE.test(t) && (tokens[j + 1] === '=' || tokens[j + 1] === '+=')) {
        j += 2;
      } else if (PS_VAR_PREFIX_RE.test(t) && t.endsWith('=')) {
        j++;
      } else if (TIMEOUT_BIN.test(base(t))) {
        const tw = scanTimeoutWrapper(tokens, j);
        if (tw.unknownFlag) {
          segSplitOrUnknown = inspectWrapperUnknown(tokens, j);
          break;
        }
        j = tw.next;
      } else if (t.length >= 4 && MISE.test(base(t))) {
        const mw = scanMiseWrapper(tokens, j);
        if (!mw.matched || mw.unknownFlag) {
          segSplitOrUnknown = inspectWrapperUnknown(tokens, j);
          break;
        }
        segEnvDirs.push(...mw.dirs);
        j = mw.next;
      } else if (t.length >= 3 && NPX.test(base(t))) {
        j++;
        while (tokens[j]?.startsWith('-')) j += tokens[j] === '-p' || tokens[j] === '--package' ? 2 : 1;
      } else {
        break;
      }
    }
    if (!segSplitOrUnknown && at < tokens.length && (prog === 'env' || prog === 'time' || prog === 'timeout' || prog === 'mise')) {
      segSplitOrUnknown = inspectWrapperUnknown(tokens, at);
    }

    const isStandaloneAssign = at === tokens.length && tokens.every(t => ASSIGNMENT.test(t));
    if (bash && isStandaloneAssign) {
      for (let ti = 0; ti < tokens.length; ti++) {
        const asg = splitAssign(tokens[ti], rawTokens[ti]);
        if (!asg) continue;
        if (isGuardedName(asg.name)) segSawDisqualifier = true;
        if (isNameMatch(asg.name, 'GIT_CONFIG_GLOBAL')) {
          curExportGitConfigOk = false;
          envGitConfigOk = false;
          lastGitConfigAssignSegIdx = -1;
          if (asg.val.includes('$') && modeInfo.hasBashSubst) gitConfigCountTainted = true;
          const isNonExpected = asg.val !== '' && (!expectedGitconfig || normComparePath(asg.val, isWin) !== normComparePath(expectedGitconfig, isWin));
          if (gitConfigGlobalExported) {
            curExportNonExpectedGitConfig = isNonExpected;
          } else {
            unexportedNonExpectedGitConfig = isNonExpected;
          }
        } else if (isNameMatch(asg.name, 'GH_REPO')) {
          if (curGhRepo) ghRepoTainted = true;
          curGhRepo = '';
          lastGhRepoAssignSegIdx = -1;
        } else if (isNameMatch(asg.name, 'GIT_TERMINAL_PROMPT') && asg.val !== '0') {
          curExportGitConfigOk = false;
          envGitConfigOk = false;
          gitConfigDisqualified = true;
        } else if (isNameMatch(asg.name, 'HOME')) homeTainted = true;
        else if (isNameMatch(asg.name, 'USERPROFILE')) userProfileTainted = true;
        else if (isNameMatch(asg.name, 'GIT_CONFIG_COUNT') || isNameMatch(asg.name, 'GIT_CONFIG_PARAMETERS')) gitConfigCountTainted = true;
        else if (isNameMatch(asg.name, 'GIT_ASKPASS') || isNameMatch(asg.name, 'SSH_ASKPASS')) askpassTainted = true;
        else if (isNameMatch(asg.name, 'GIT_CONFIG_SYSTEM')) gitConfigSystemTainted = true;
        else if (isNameMatch(asg.name, 'GIT_DIR')) gitDirTainted = true;
        else if (isNameMatch(asg.name, 'GIT_CONFIG')) gitConfigTainted = true;
        else if (isNameMatch(asg.name, 'GIT_COMMON_DIR')) gitCommonDirTainted = true;
      }
    }

    const envUnsetGitConfig = segEnvUnsets.length > 0 && segEnvUnsets.some(u => isNameMatch(u, 'GIT_CONFIG_GLOBAL') || isNameMatch(u, 'GIT_TERMINAL_PROMPT'));
    const envUnsetHome = segEnvUnsets.length > 0 && segEnvUnsets.some(u => isNameMatch(u, 'HOME'));
    const envUnsetUp = segEnvUnsets.length > 0 && segEnvUnsets.some(u => isNameMatch(u, 'USERPROFILE'));

    const envDisqualifiesGitConfig = segEnvCleared || envUnsetGitConfig;
    const anyGitConfigOverride =
      gitConfigCountTainted ||
      inlineOverridesCount ||
      askpassTainted ||
      inlineOverridesAskpass ||
      gitConfigSystemTainted ||
      inlineOverridesSystem ||
      gitConfigDisqualified;

    let inlineGitConfigOk = false;
    if (
      bash &&
      inlineGitConfigLast &&
      !(inlineGitConfigLast.escapedName && !inlineGitConfigLast.fromEnvWrapper) &&
      expectedGitconfig &&
      !anyGitConfigOverride &&
      !envDisqualifiesGitConfig
    ) {
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
      !anyGitConfigOverride &&
      !envDisqualifiesGitConfig &&
      (curExportGitConfigOk || envGitConfigOk) &&
      !inlineGitConfigLast;

    let inlineNonExpectedGitConfig = false;
    if (inlineGitConfigLast !== null && !inlineGitConfigOk) {
      const r = inlineGitConfigLast.rawRhs;
      if (r !== '' && r !== "''" && r !== '""') {
        const matchesExpectedInBashForm = !bash && expectedGitconfig && evalGitConfigRhs(r, true, {
          fromEnvWrapper: inlineGitConfigLast.fromEnvWrapper,
          expectedPath: expectedGitconfig,
          homeDir,
          envHome,
          envUserProfile,
          homeTainted: homeTainted || inlineTaintsHome || envUnsetHome,
          userProfileTainted: userProfileTainted || inlineTaintsHome || envUnsetUp,
          isWin,
        });
        if (!matchesExpectedInBashForm) inlineNonExpectedGitConfig = true;
      }
    }
    const envConfigInjectionActive =
      gitConfigCountTainted ||
      inlineOverridesCount ||
      gitConfigSystemTainted ||
      inlineOverridesSystem ||
      inlineNonExpectedGitConfig ||
      (!inlineGitConfigLast && !segEnvCleared && !envUnsetGitConfig && curExportNonExpectedGitConfig);

    let effectiveGhRepo = segEnvClearedGhRepo ? '' : curGhRepo;
    let effectiveGhRepoTainted = segEnvClearedGhRepo ? false : ghRepoTainted;
    let usedModeInlineGhRepo = false;
    if (bash && inlineGhRepoLast !== null) {
      const r = evalGhRepoRhs(inlineGhRepoLast, true);
      if (r.ok) {
        effectiveGhRepo = r.val;
        effectiveGhRepoTainted = false;
        if (r.val !== '') usedModeInlineGhRepo = true;
      } else {
        effectiveGhRepoTainted = true;
      }
    }

    const anyGitDirOrConfigTainted =
      gitDirTainted || gitConfigTainted || gitCommonDirTainted || gitConfigSystemTainted || inlineOverridesGitDir || inlineOverridesSystem;

    const gitConfigAssignSegIdx = inlineGitConfigOk
      ? idx
      : (baseGitConfigOk && curExportGitConfigOk && !envGitConfigOk ? lastGitConfigAssignSegIdx : -1);
    const ghRepoAssignSegIdx = usedModeInlineGhRepo
      ? idx
      : (!effectiveGhRepoTainted && effectiveGhRepo !== '' && effectiveGhRepo !== (envGhRepo ?? '') ? lastGhRepoAssignSegIdx : -1);

    const stUsedModeAssign = inlineGitConfigOk || (baseGitConfigOk && curExportGitConfigOk && !envGitConfigOk);
    const stUsedModeGhRepo = usedModeInlineGhRepo || (effectiveGhRepo !== '' && effectiveGhRepo !== (envGhRepo ?? ''));
    if (stUsedModeAssign) hasAnyModeGitAssign = true;
    if (stUsedModeGhRepo) hasAnyModeGhRepo = true;

    segStates.push({
      tokens,
      rawTokens,
      tokenOffsets: seg.tokenOffsets,
      at,
      prog,
      startsWithAssign: (tokens[0] !== undefined && tokens[0].includes('=') && ASSIGNMENT.test(tokens[0])) || isLiteralPsEnvAssign,
      segSawDisqualifier,
      segSplitOrUnknown,
      segEnvDirs,
      sawCdBefore: sawCd,
      sawEnvSplitBefore,
      gitConfigSatisfied: inlineGitConfigOk || baseGitConfigOk,
      usedModeAssign: stUsedModeAssign,
      usedModeInlineGitConfig: inlineGitConfigOk,
      gitConfigAssignSegIdx,
      gitConfigOverrideInSeg: anyGitConfigOverride,
      gitCountOrParamsTainted: gitConfigCountTainted || inlineOverridesCount || gitConfigSystemTainted || inlineOverridesSystem,
      envConfigInjectionActive,
      gitDirTainted: anyGitDirOrConfigTainted,
      effectiveGhRepo,
      effectiveGhRepoTainted,
      usedModeGhRepo: stUsedModeGhRepo,
      usedModeInlineGhRepo,
      ghRepoAssignSegIdx,
    });

    if (CD_PROGRAMS.has(prog)) sawCd = true;
    if (segSplitOrUnknown?.type === 'env-split') sawEnvSplitBefore = true;
  }

  segStates.hasAnyModeGitAssign = hasAnyModeGitAssign;
  segStates.hasAnyModeGhRepo = hasAnyModeGhRepo;
  return segStates;
}

// ------------------------------------------------------------ scope & decision helpers

function checkGhOwnerScope(ghInfo, segState, { ownerLogin, cwd, platform, scopeCache }) {
  if (ghInfo.unknownFlag || segState.sawCdBefore || segState.sawEnvSplitBefore) return { match: true };
  if (ghInfo.group === 'auth') return { match: true };

  if (ghInfo.group === 'api') {
    const { endpoint } = ghInfo.api;
    if (!endpoint) return { match: true };

    if (ghInfo.hostnames.length > 0 && !/^[a-z][a-z0-9+.-]*:\/\//i.test(endpoint)) {
      const normalized = ghInfo.hostnames.map(normalizeHost);
      if (normalized.some(h => h === null || isGitHubHost(h))) return { match: true };
      const first = normalized[0];
      if (!normalized.every(h => h === first)) return { match: true };
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
    if (!m) return { match: true };
    if (m[1] !== '{owner}' && m[1] !== ':owner') {
      const epOwner = m[1];
      if (!LOGIN_RE.test(epOwner)) return { match: true };
      if (epOwner.toLowerCase() === ownerLogin.toLowerCase()) return { match: true };
      for (const r of ghInfo.globalRepos) {
        const res = evalRepoShorthand(r, ownerLogin);
        if (!res.ok || res.match || res.owner.toLowerCase() !== epOwner.toLowerCase()) return { match: true };
      }
      return { match: false };
    }
  }

  if (ghInfo.accountScoped || ghInfo.group === 'gist') return { match: true };

  if (ghInfo.group === 'secret' || ghInfo.group === 'variable') {
    const beforeDashes = ghInfo.restArgs.includes('--') ? ghInfo.restArgs.slice(0, ghInfo.restArgs.indexOf('--')) : ghInfo.restArgs;
    for (const rawTok of beforeDashes) {
      const tok = rawTok.replaceAll('\\', '');
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
      const orgVals = [];
      let hitUnknown = false;
      let i = 0;
      while (i < ghInfo.afterVerb.length) {
        const t = ghInfo.afterVerb[i];
        if (t === '--') break;
        const g = consumeGhGlobalFlag(ghInfo.afterVerb, i, [], []);
        if (g.matched) {
          if (!g.ok) return { match: true };
          hitUnknown = true;
          i = g.next;
          continue;
        }
        if (t === '--org') {
          if (i + 1 >= ghInfo.afterVerb.length) return { match: true };
          orgVals.push(ghInfo.afterVerb[i + 1]);
          i += 2;
        } else if (t.startsWith('--org=')) {
          orgVals.push(t.slice('--org='.length));
          i++;
        } else if (t.startsWith('-') && t !== '-') {
          hitUnknown = true;
          i++;
        } else {
          i++;
        }
      }
      if (hitUnknown || orgVals.length === 0) return { match: true };
      for (const o of orgVals) {
        if (!o || o.toLowerCase() === '@me' || !LOGIN_RE.test(o) || o.toLowerCase() === ownerLogin.toLowerCase()) return { match: true };
      }
      const firstOrg = orgVals[0].toLowerCase();
      if (!orgVals.every(o => o.toLowerCase() === firstOrg)) return { match: true };
      return { match: false };
    }

    if (ghInfo.verb === 'create') {
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
    const projectRepos = [...ghInfo.globalRepos];
    const ownerVals = [];
    let hitUnknown = false;
    let i = 0;
    while (i < ghInfo.afterVerb.length) {
      const t = ghInfo.afterVerb[i];
      if (t === '--') break;
      const g = consumeGhGlobalFlag(ghInfo.afterVerb, i, projectRepos, []);
      if (g.matched) {
        if (!g.ok) return { match: true };
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
      } else if (t === '--url') {
        if (i + 1 >= ghInfo.afterVerb.length) return { match: true };
        i += 2;
      } else if (t.startsWith('--url=')) {
        i++;
      } else if (t.startsWith('-') && t !== '-') {
        hitUnknown = true;
        i++;
      } else {
        i++;
      }
    }
    if (hitUnknown || projectRepos.length > 0 || ownerVals.length === 0) return { match: true };
    for (const o of ownerVals) {
      if (!o || o.toLowerCase() === '@me' || !LOGIN_RE.test(o) || o.toLowerCase() === ownerLogin.toLowerCase()) return { match: true };
    }
    const firstOwner = ownerVals[0].toLowerCase();
    if (!ownerVals.every(o => o.toLowerCase() === firstOwner)) return { match: true };
    return { match: false };
  }

  let nonGithubHost = null;
  if (ghInfo.hostnames.length > 0) {
    const normalized = ghInfo.hostnames.map(normalizeHost);
    if (normalized.some(h => h === null)) return { match: true };
    const first = normalized[0];
    if (!normalized.every(h => h === first)) return { match: true };
    if (!isGitHubHost(first)) nonGithubHost = first;
  }

  const cliTargets = [...ghInfo.globalRepos];
  const allowPositionalUrl = GH_URL_EXEMPT_GROUPS.has(ghInfo.group) && !(ghInfo.group === 'issue' && ghInfo.verb === 'transfer');
  let sawTargetAfterUnknown = false;
  if (ghInfo.afterVerb) {
    let i = 0;
    let hitUnknown = false;
    let afterDashes = false;
    while (i < ghInfo.afterVerb.length) {
      const t = ghInfo.afterVerb[i];
      if (!afterDashes && t === '--') {
        afterDashes = true;
        i++;
        continue;
      }
      if (!afterDashes) {
        const g = consumeGhGlobalFlag(ghInfo.afterVerb, i, hitUnknown ? [] : cliTargets, []);
        if (g.matched) {
          if (!g.ok) return { match: true };
          if (hitUnknown) sawTargetAfterUnknown = true;
          i = g.next;
          continue;
        }
        if (t.startsWith('-') && t !== '-') {
          hitUnknown = true;
          i++;
          continue;
        }
      }
      const looksLikeUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(t) || /^[^@/\s]+@[^:@/\s]+:/.test(t);
      const isRepoPosTarget = ghInfo.group === 'repo' && GH_REPO_POSITIONAL_EXEMPT_VERBS.has(ghInfo.verb) && t.includes('/');
      if (hitUnknown) {
        if (looksLikeUrl || isRepoPosTarget) sawTargetAfterUnknown = true;
      } else {
        if (looksLikeUrl && allowPositionalUrl) {
          cliTargets.push(t);
        } else if (isRepoPosTarget) {
          cliTargets.push(t);
        }
      }
      i++;
    }
  }

  if (sawTargetAfterUnknown) return { match: true };

  if (cliTargets.length > 0) {
    const parsed = cliTargets.map(t => evalRepoShorthand(t, ownerLogin));
    if (parsed.some(p => !p.ok || p.match)) return { match: true };
    const first = parsed[0];
    if (!parsed.every(p => p.host === first.host && p.owner.toLowerCase() === first.owner.toLowerCase())) return { match: true };
    if (nonGithubHost !== null && isGitHubHost(first.host)) return { match: true };
    return { match: false };
  }

  if (nonGithubHost !== null) return { match: false };

  if (segState.effectiveGhRepoTainted) return { match: true };
  if (segState.effectiveGhRepo) {
    const res = evalRepoShorthand(segState.effectiveGhRepo, ownerLogin);
    if (!res.ok || res.match) return { match: true };
    return { match: false };
  }

  if (ghInfo.group === 'repo') return { match: true };

  if (segState.gitDirTainted) return { match: true };
  const ck = segState.segEnvDirs.length === 0 ? 'gh:' : `gh:${JSON.stringify(segState.segEnvDirs)}`;
  if (scopeCache?.has(ck)) return scopeCache.get(ck);
  const scopeRes = resolveCwdRepoScope({
    cwd,
    dirs: segState.segEnvDirs,
    explicitRemoteName: null,
    isGitPush: false,
    isGh: true,
    ownerLogin,
    platform,
  });
  scopeCache?.set(ck, scopeRes);
  return scopeRes;
}

function checkGitOwnerScope(gitInfo, segState, { ownerLogin, cwd, platform, scopeCache }) {
  if (segState.sawCdBefore || segState.sawEnvSplitBefore) return { match: true };
  if (gitInfo.hasUnknownLeadingOpt || gitInfo.hasAliasOpt) return { match: true };

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

  if (gitInfo.hasGitDirOpt || gitInfo.hasConfigEnvOpt || gitInfo.hasExecPathOpt || segState.gitDirTainted || segState.gitCountOrParamsTainted || segState.envConfigInjectionActive) {
    return { match: true };
  }
  for (const co of gitInfo.cOpts) {
    const key = co.val.includes('=') ? co.val.slice(0, co.val.indexOf('=')) : co.val;
    if (GIT_SCOPE_OVERRIDE_KEY_RE.test(key)) return { match: true };
  }

  const hasDirs = segState.segEnvDirs.length > 0 || gitInfo.dirs.length > 0;
  const dirs = hasDirs ? [...segState.segEnvDirs, ...gitInfo.dirs] : segState.segEnvDirs;
  const isGitPush = gitInfo.subcmd === 'push';
  const ck = hasDirs
    ? `git:${isGitPush ? 1 : 0}:${explicitRemoteName ?? ''}:${JSON.stringify(dirs)}`
    : `git:${isGitPush ? 1 : 0}:${explicitRemoteName ?? ''}`;
  if (scopeCache?.has(ck)) return scopeCache.get(ck);
  const scopeRes = resolveCwdRepoScope({
    cwd,
    dirs,
    explicitRemoteName,
    isGitPush,
    isGh: false,
    ownerLogin,
    platform,
  });
  scopeCache?.set(ck, scopeRes);
  return scopeRes;
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

function hasUnsafeShellEscape(segState, subcmdIdx, bash) {
  const { rawTokens, at } = segState;
  const checkEnd = subcmdIdx >= at ? subcmdIdx : rawTokens.length - 1;
  for (let i = at; i < rawTokens.length; i++) {
    const rt = rawTokens[i];
    const inSingle = rt.startsWith("'") && rt.endsWith("'");
    if (inSingle) continue;
    const isQuoted = rt.startsWith('"') && rt.endsWith('"');
    const isFlag = rt.startsWith('-') || rt.startsWith('\\') || rt.startsWith('`');
    if (bash) {
      if ((i <= checkEnd || !isQuoted || isFlag) && rt.includes('\\')) {
        if (!(!isFlag && i > checkEnd && /^[A-Za-z]:\\/.test(rt))) return true;
      }
    } else {
      if ((i <= checkEnd || !isQuoted || isFlag) && rt.includes('`')) return true;
    }
  }
  return false;
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
  if (command.includes('$(') || bashMode.hasBashSubst) return false;

  if (bashGitInfo.hasUnknownLeadingOpt || psGitInfo.hasUnknownLeadingOpt) return false;
  if (bashGitInfo.hasAliasOpt || psGitInfo.hasAliasOpt) return false;
  if (hasUnsafeShellEscape(bashSegState, bashGitInfo.subcmdTokenIdx, true)) return false;
  if (hasUnsafeShellEscape(psSegState, psGitInfo.subcmdTokenIdx, false)) return false;

  if (isWin && (/^\s*set\s+/i.test(command) || /^\s*[A-Za-z_][A-Za-z0-9_]*=/.test(command))) return false;
  if (bashSegState.gitConfigOverrideInSeg || psSegState.gitConfigOverrideInSeg) return false;
  if (bashGitInfo.hasConfigEnvOpt || psGitInfo.hasConfigEnvOpt) return false;

  for (const name of ['GIT_CONFIG_COUNT', 'GIT_CONFIG_PARAMETERS', 'GIT_CONFIG_SYSTEM', 'GIT_ASKPASS', 'SSH_ASKPASS']) {
    const val = getEnvVar(env, name, isWin);
    if (val !== undefined && val !== '') return false;
  }

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
export function answerCall({ command, provider, cwd, canOverwrite = false, env = process.env, tableFile = TABLE, pinFile, platform = process.platform, shell } = {}) {
  if (typeof command !== 'string' || !PROVIDERS.includes(provider) || typeof canOverwrite !== 'boolean') fail('call');
  if (shell !== undefined && !SHELLS.includes(shell)) fail('call');
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
  let hasCandidate = Boolean(bashMode.hasDeepBacktick);
  const identityEnabled = Boolean(doc.identity?.enabled);
  const resolvedPinPath = identityEnabled ? resolvePinPath(tableFile, pinFile) : null;
  const expectedGitconfigGuess = resolvedPinPath
    ? `${dirname(resolvedPinPath)}/gh-app-${provider}.gitconfig`.replaceAll('\\', '/')
    : null;
  const isWinPlatform = platform === 'win32';
  const envHasConfigInjection = (() => {
    for (const k of ['GIT_CONFIG_COUNT', 'GIT_CONFIG_PARAMETERS', 'GIT_CONFIG_SYSTEM']) {
      const v = getEnvVar(env, k, isWinPlatform);
      if (v !== undefined && v !== '') return true;
    }
    const g = getEnvVar(env, 'GIT_CONFIG_GLOBAL', isWinPlatform);
    return Boolean(g && (!expectedGitconfigGuess || normComparePath(g, isWinPlatform) !== normComparePath(expectedGitconfigGuess, isWinPlatform)));
  })();
  let sawConfigInjectionToken = envHasConfigInjection;
  let sawNonBuiltinGit = false;

  for (const modeInfo of [bashMode, psMode]) {
    for (const seg of modeInfo.segments) {
      const tokens = seg.tokens;
      const at = programAt(tokens);
      const prog = at < tokens.length ? programName(tokens[at]) : '';
      seg.at = at;
      seg.prog = prog;

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
          const segText = tokens.length === 1 ? tokens[0] : tokens.length === 2 ? `${tokens[0]} ${tokens[1]}` : tokens.join(' ');
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

      if (identityEnabled && !hasCandidate) {
        if (!sawConfigInjectionToken) {
          for (let ti = 0; ti < tokens.length; ti++) {
            const tok = tokens[ti];
            if (tok.length >= 16 && /git_config_(?:count|parameters|system|global)/i.test(tok)) {
              sawConfigInjectionToken = true;
              break;
            }
          }
        }
        if (at < tokens.length) {
          if (prog === 'gh') hasCandidate = true;
          else if (prog === 'git') {
            const gitInfo = parseGitSegment(tokens, at);
            if (gitInfo.isGuarded) hasCandidate = true;
            else if (gitInfo.subcmd && !GIT_BUILTIN_READ_SUBCOMMANDS.has(gitInfo.subcmd)) {
              sawNonBuiltinGit = true;
            }
          } else if ((prog === 'env' || prog === 'time' || prog === 'timeout' || prog === 'mise') && inspectWrapperUnknown(tokens, at)) hasCandidate = true;
        }
        if (sawConfigInjectionToken && sawNonBuiltinGit) hasCandidate = true;
      }
    }
  }

  if (bestDenyIdx < Infinity) return { decision: 'deny', id: doc.rules[bestDenyIdx].id };
  if (bestAskIdx < Infinity) return { decision: 'ask', id: doc.rules[bestAskIdx].id };

  // 2. Lazy identity pin gate
  if (!identityEnabled || !hasCandidate) return null;

  const pin = readPinFile(resolvedPinPath);
  if (!pin || !Object.hasOwn(pin.apps, provider)) return null;

  const ownerLogin = pin.owner.login;
  const pactDir = dirname(resolvedPinPath);
  const homeDir = dirname(pactDir);
  const expectedGitconfig = expectedGitconfigGuess;
  const scopeCache = new Map();

  const analyzeOpts = { env, platform, expectedGitconfig, homeDir };
  const bashStates = analyzeMode(bashMode, true, analyzeOpts);
  const psStates = analyzeMode(psMode, false, analyzeOpts);

  const isUnknownShell = shell === 'unknown';
  const allowBashExempt = shell !== 'powershell' && !isUnknownShell;
  const allowPsExempt = shell !== 'bash' && !isUnknownShell;

  const segsAgree = (a, b) =>
    a.rawTokens.length === b.rawTokens.length &&
    a.tokenOffsets.every((off, idx) => off === b.tokenOffsets[idx] && a.rawTokens[idx] === b.rawTokens[idx]);

  const canCrossExempt = (exemptStates, otherStates, otherMode, hits, satisfiedInfo, allowFlag) => {
    if (hits.length === 0) return false;
    if (!allowFlag && !isUnknownShell) return false;
    if (
      otherMode.sawComment ||
      otherMode.sawHeredoc ||
      otherMode.sawHereString ||
      otherMode.sawStopParse ||
      otherMode.hasSubexprInDoubleQuotes ||
      otherMode.hasExpandableHereStringWithDollar ||
      otherMode.hasBashSubst ||
      otherMode.hasDeepBacktick ||
      otherMode.hasPsSubexpr
    ) {
      return false;
    }
    const otherByOffset = new Map();
    for (const os of otherStates) {
      const off = os.tokenOffsets[0] ?? -1;
      if (!otherByOffset.has(off)) otherByOffset.set(off, os);
    }
    const inlineTargetOffsets = new Set();
    let maxTargetOffset = -1;
    let needsPrefixCheck = false;
    for (const h of hits) {
      if (h.forceDeny || !h.st) return false;
      const st = h.st;
      if (
        st.gitConfigOverrideInSeg ||
        st.gitCountOrParamsTainted ||
        st.envConfigInjectionActive ||
        st.gitDirTainted ||
        st.effectiveGhRepoTainted ||
        st.sawCdBefore ||
        st.sawEnvSplitBefore
      ) {
        return false;
      }
      const info = satisfiedInfo.get(h.key ?? segKey(st));
      if (!info) return false;
      if (isUnknownShell && !info.isInline) return false;
      const assignSeg = exemptStates[info.assignSegIdx];
      if (!assignSeg) return false;
      const otherAssign = otherByOffset.get(assignSeg.tokenOffsets[0] ?? -1);
      if (!otherAssign || !segsAgree(assignSeg, otherAssign)) return false;
      if (info.isInline) inlineTargetOffsets.add(otherAssign.tokenOffsets[0] ?? -1);
      if (info.targetOffset > maxTargetOffset) maxTargetOffset = info.targetOffset;
      if (!info.isInline) needsPrefixCheck = true;
    }
    for (let oi = 0; oi < otherStates.length && (otherStates[oi].tokenOffsets[0] ?? 0) <= maxTargetOffset; oi++) {
      const os = otherStates[oi];
      if (os.segSawDisqualifier && !inlineTargetOffsets.has(os.tokenOffsets[0] ?? -1)) return false;
    }
    if (needsPrefixCheck) {
      let ei = 0;
      let oi = 0;
      while (ei < exemptStates.length && (exemptStates[ei].tokenOffsets[0] ?? 0) < maxTargetOffset) {
        const es = exemptStates[ei++];
        const os = otherStates[oi++];
        if (!os || !segsAgree(es, os)) return false;
      }
      if (oi < otherStates.length && (otherStates[oi].tokenOffsets[0] ?? 0) < maxTargetOffset) return false;
    }
    return true;
  };

  // 3. Plain gh write check (all providers; beats any git identity match)
  const segKey = st => `${st.tokenOffsets[st.at] ?? -1}:${JSON.stringify(st.tokens.slice(st.at))}`;
  const evalGhMode = (states, isBash, otherHasModeGhRepo) => {
    const hits = [];
    const satisfiedInfo = new Map();
    let usedModeGhRepo = false;
    if (isBash && bashMode.hasDeepBacktick && /\bgh\b/i.test(command)) {
      hits.push({ key: null, forceDeny: true, st: null, answer: { decision: 'deny', id: 'identity-gh', reason: buildGhReason(provider, doc.identity.posterOn, false) } });
      return { hits, satisfiedInfo, usedModeGhRepo };
    }
    for (const st of states) {
      if (!isBash && st.startsWithAssign) continue;
      if (st.segSplitOrUnknown?.kind === 'gh') {
        hits.push({ key: null, forceDeny: true, st, answer: { decision: 'deny', id: 'identity-gh', reason: buildGhReason(provider, doc.identity.posterOn, false) } });
        continue;
      }
      if (st.segSplitOrUnknown && st.segSplitOrUnknown.kind !== 'git' && provider === 'claude') {
        if (st.segSplitOrUnknown.type === 'env-unknown' || st.segSplitOrUnknown.badSplit) {
          hits.push({ key: null, forceDeny: true, st, answer: { decision: 'deny', id: 'identity-gh', reason: buildGhReason(provider, doc.identity.posterOn, false) } });
        }
        continue;
      }
      if (st.prog === 'gh') {
        const ghInfo = parseGhSegment(st.tokens, st.at);
        if (ghInfo.isWrite) {
          const scope = checkGhOwnerScope(ghInfo, st, { ownerLogin, cwd, platform, scopeCache });
          if (scope.match) {
            hits.push({ key: null, forceDeny: false, st, answer: { decision: 'deny', id: 'identity-gh', reason: buildGhReason(provider, doc.identity.posterOn, ghInfo.isFreeText) } });
            if (!otherHasModeGhRepo) break;
          } else if (st.usedModeGhRepo) {
            usedModeGhRepo = true;
            satisfiedInfo.set(segKey(st), {
              assignSegIdx: st.ghRepoAssignSegIdx,
              isInline: st.usedModeInlineGhRepo,
              targetOffset: st.tokenOffsets[st.at] ?? 0,
            });
          }
        }
      }
    }
    return { hits, satisfiedInfo, usedModeGhRepo };
  };

  const bashGh = evalGhMode(bashStates, true, psStates.hasAnyModeGhRepo);
  if (bashGh.hits.length > 0 && !psStates.hasAnyModeGhRepo) return bashGh.hits[0].answer;
  const psGh = evalGhMode(psStates, false, bashStates.hasAnyModeGhRepo);
  const bashGhExemptsPs = bashGh.hits.length === 0 && bashGh.usedModeGhRepo &&
    canCrossExempt(bashStates, psStates, psMode, psGh.hits, bashGh.satisfiedInfo, allowBashExempt);
  const psGhExemptsBash = psGh.hits.length === 0 && psGh.usedModeGhRepo &&
    canCrossExempt(psStates, bashStates, bashMode, bashGh.hits, psGh.satisfiedInfo, allowPsExempt);
  if (bashGh.hits.length > 0 && !psGhExemptsBash) return bashGh.hits[0].answer;
  if (psGh.hits.length > 0 && !bashGhExemptsPs) return psGh.hits[0].answer;

  // 4. Plain git write check (all providers; claude passes normal settings-env writes and catches overrides/unsets)

  let gitconfigOkCache = null;
  const verifyGitconfig = () => {
    if (gitconfigOkCache !== null) return gitconfigOkCache;
    let gst;
    try {
      gst = lstatSync(expectedGitconfig);
      gitconfigOkCache = !gst.isSymbolicLink() && gst.isFile();
    } catch {
      gitconfigOkCache = false;
    }
    return gitconfigOkCache;
  };

  const evalGitMode = (states, isBash, otherHasModeGitAssign) => {
    const hits = [];
    const satisfiedInfo = new Map();
    let guardedCount = 0;
    let usedModeAssign = false;
    let missingGitconfig = false;
    if (isBash && bashMode.hasDeepBacktick) {
      guardedCount++;
      if (!verifyGitconfig()) return { hits, satisfiedInfo, guardedCount, usedModeAssign, missingGitconfig: true };
      hits.push({ key: null, forceDeny: true, gitInfo: null, st: null });
      return { hits, satisfiedInfo, guardedCount, usedModeAssign, missingGitconfig };
    }
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
        const r9Guarded = st.envConfigInjectionActive && Boolean(gitInfo.subcmd) && !GIT_BUILTIN_READ_SUBCOMMANDS.has(gitInfo.subcmd);
        if (!gitInfo.isGuarded && !r9Guarded) continue;
        const scope = checkGitOwnerScope(gitInfo, st, { ownerLogin, cwd, platform, scopeCache });
        if (!scope.match) continue;
        guardedCount++;
        if (!verifyGitconfig()) {
          missingGitconfig = true;
          break;
        }
        const hasCOverride = r9Guarded || gitInfo.hasConfigEnvOpt || gitInfo.hasAliasOpt || gitInfo.cOpts.some(co => {
          const key = co.val.includes('=') ? co.val.slice(0, co.val.indexOf('=')) : co.val;
          return GIT_CONFIG_OVERRIDE_KEY_RE.test(key);
        });
        if (st.gitConfigSatisfied && !hasCOverride) {
          if (st.usedModeAssign) {
            usedModeAssign = true;
            satisfiedInfo.set(segKey(st), {
              assignSegIdx: st.gitConfigAssignSegIdx,
              isInline: st.usedModeInlineGitConfig,
              targetOffset: st.tokenOffsets[st.at] ?? 0,
            });
          }
          continue;
        }
        hits.push({ key: null, forceDeny: hasCOverride, gitInfo, st });
        if (!otherHasModeGitAssign && (states.length > 1 || !canOverwrite || hasCOverride)) break;
      }
    }
    return { hits, satisfiedInfo, guardedCount, usedModeAssign, missingGitconfig };
  };

  const bashGit = evalGitMode(bashStates, true, psStates.hasAnyModeGitAssign);
  if (bashGit.missingGitconfig) return { decision: 'deny', id: 'identity-gitconfig', reason: buildGitconfigReason(provider) };
  if (bashGit.hits.length > 0 && !psStates.hasAnyModeGitAssign && (bashStates.length > 1 || !canOverwrite || bashGit.hits[0].forceDeny)) {
    return { decision: 'deny', id: 'identity-git', reason: buildGitDenyReason(provider, platform) };
  }
  const psGit = evalGitMode(psStates, false, bashStates.hasAnyModeGitAssign);
  if (psGit.missingGitconfig) return { decision: 'deny', id: 'identity-gitconfig', reason: buildGitconfigReason(provider) };

  const bashGitExemptsPs = bashGit.hits.length === 0 && bashGit.usedModeAssign &&
    canCrossExempt(bashStates, psStates, psMode, psGit.hits, bashGit.satisfiedInfo, allowBashExempt);
  const psGitExemptsBash = psGit.hits.length === 0 && psGit.usedModeAssign &&
    canCrossExempt(psStates, bashStates, bashMode, bashGit.hits, psGit.satisfiedInfo, allowPsExempt);

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
