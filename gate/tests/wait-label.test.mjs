// The wait-label test (#558 C8, of #554): every place the pact's text says
// something waits on the owner names it a checkpoint or a hard stop. A unit
// (a list item, a paragraph, a table cell, a fenced block, a mark line, or one
// string literal of a tool or hook) that holds a wait phrase and none of the
// labels fails, named by file and first words. Before matching, whitespace
// folds to one space, `*`, `_` and backticks drop out, and a curly apostrophe
// is a straight one; a tool literal's \xNN, \uNNNN and \u{...} escapes are
// decoded. Matching ignores case and takes whole words, so `only i` matches
// "only I can" and never "only in" or "only its". A hyphen joins words:
// "checkpoint-stops" is one word, never the label.
// Reads text only: the sources are read, never run or rendered.
//
// What the tokenizer cannot see, so a wait phrased this way passes:
// - a phrase split across concatenated or joined literals ('waits for' + ' my
//   word', or an array of pieces that is `.join`ed);
// - the renderer's fixed text outside the declarations derived from its
//   SETTINGS map (PROJECT_TEMPLATE, NOTICE_TEMPLATE, SECURITY_DOUBT);
// - in the renderer's declarations, a literal that starts with neither a list
//   marker nor a space, which glues onto the list item before it;
// - a `/` after a `}`, which the scanner reads as the start of a regular
//   expression;
// - a fenced block, which is one unit, so a label anywhere in the fence covers
//   a wait anywhere else in it.
// A label word anywhere in a unit covers a wait in it, even a negated one.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { REPO } from './text.mjs';

const WAIT_PHRASES = ['wait for my', 'waits for my', 'wait for me', 'waits for me', 'waits on', 'stop and ask', 'stop and tell me', 'go-ahead', 'my confirm', 'own yes', 'needs my', 'my yes', 'only i', 'i confirm', 'says in chat', "owner's own words", 'my own words', "owner's yes", "owner's word", 'waiting on', 'my word'];
const LABELS = ['checkpoint', 'checkpoints', 'hard stop', 'hard stops'];

// A word's edges: no letter, digit or underscore beside it, and no such
// character behind a hyphen that joins it to the next word.
const wholeWords = list => new RegExp(`(?<![\\p{L}\\p{N}_])(?<![\\p{L}\\p{N}_]-)(?:${list.map(p => p.replace(/ /g, '\\s')).join('|')})(?![\\p{L}\\p{N}_])(?!-[\\p{L}\\p{N}_])`, 'iu');
const WAIT_RE = wholeWords(WAIT_PHRASES);
const LABEL_RE = wholeWords(LABELS);

const fold = s => s.replace(/\s+/g, ' ').trim();
// The text as matched: folded, with emphasis marks and backticks dropped and curly apostrophes straight.
const canon = s => fold(s.replace(/[*_`]/g, '').replace(/[‘’]/g, "'"));

/** Whether a unit's text holds a wait phrase and no label. */
export const unlabelled = text => WAIT_RE.test(canon(text)) && !LABEL_RE.test(canon(text));

// ------------------------------------------------------------ units of a markdown file

const MARK_LINE = /^\s*<!--.*-->\s*$/;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s/;

/** The units of markdown text: list items, paragraphs, table cells, fenced blocks, headings and mark lines, each folded. */
export function markdownUnits(text) {
  const units = [];
  let cur = [];
  const flush = () => {
    if (cur.length) units.push(fold(cur.join(' ')));
    cur = [];
  };
  let fence = null;
  for (const line of text.split(/\r?\n/)) {
    if (fence) {
      if (/^\s*(?:```|~~~)/.test(line)) {
        flush();
        fence = null;
      } else cur.push(line);
    } else if (/^\s*(?:```|~~~)/.test(line)) {
      flush();
      fence = true;
    } else if (/^\s*\|/.test(line)) {
      flush();
      // Each cell of a table row is a unit, so a label in one cell never covers a wait in another; a separator cell is none.
      for (const cell of line.split(/(?<!\\)\|/)) if (!/^[\s:-]*$/.test(cell)) units.push(fold(cell));
    } else if (line.trim() === '' || /^\s*(?:---+|#{1,6}\s.*)$/.test(line) || MARK_LINE.test(line)) {
      flush();
      // A heading and a mark line are each one unit (a mark line sits against the item before it, so it must not share its label); a rule or a blank line is none.
      if (line.trim() !== '' && !/^\s*---+$/.test(line)) units.push(fold(line));
    } else if (LIST_ITEM.test(line)) {
      flush();
      cur.push(line);
    } else cur.push(line);
  }
  flush();
  return units;
}

// ------------------------------------------------------------ string literals of a script

const REGEX_AFTER = new Set([...'([{,;:=!&|?+-*%<>~^}']);
const REGEX_WORDS = new Set(['return', 'typeof', 'case', 'in', 'of', 'delete', 'void', 'throw', 'else', 'do', 'new']);

// A string literal's text as the script reads it: a line continuation is nothing, \n \t \r a space, \xNN \uNNNN and \u{...} the character they name, any other escape its character.
const char = hex => (parseInt(hex, 16) > 0x10ffff ? '' : String.fromCodePoint(parseInt(hex, 16)));
const unescape = s => s.replace(/\\(?:\r?\n|x([0-9a-fA-F]{2})|u\{([0-9a-fA-F]+)\}|u([0-9a-fA-F]{4})|([ntr])|([\s\S]))/g, (m, x, braced, u, ws, other) => {
  const hex = x ?? braced ?? u;
  return hex !== undefined ? char(hex) : ws !== undefined ? ' ' : (other ?? '');
});

/**
 * Scan script text from `from`, pushing each string literal's text to `out`: a
 * template literal is one literal, its `${...}` replaced by "X" and its own
 * literals pushed first. `mode` is 'top' (to the end), 'brace' (to the
 * unmatched `}`) or 'decl' (to the first `;` outside any bracket). Returns the
 * index it stopped at. An unterminated string or template throws.
 */
function scan(src, from, mode, out) {
  let i = from;
  let depth = 0;
  let prev = '';
  let prevWord = '';
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
    } else if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end < 0) throw new Error('an unterminated comment');
      i = end + 2;
    } else if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\n') throw new Error(`an unterminated string at ${i}`);
        j += src[j] === '\\' ? 2 : 1;
      }
      if (j >= src.length) throw new Error(`an unterminated string at ${i}`);
      out.push(unescape(src.slice(i + 1, j)));
      i = j + 1;
      prev = c;
      prevWord = '';
    } else if (c === '`') {
      let j = i + 1;
      let text = '';
      while (j < src.length && src[j] !== '`') {
        if (src[j] === '\\') {
          text += src.slice(j, j + 2);
          j += 2;
        } else if (src[j] === '$' && src[j + 1] === '{') {
          j = scan(src, j + 2, 'brace', out);
          text += 'X';
        } else text += src[j++];
      }
      if (j >= src.length) throw new Error(`an unterminated template at ${i}`);
      out.push(unescape(text));
      i = j + 1;
      prev = c;
      prevWord = '';
    } else if (c === '/' && (prev === '' || REGEX_AFTER.has(prev) || REGEX_WORDS.has(prevWord))) {
      let j = i + 1;
      let inClass = false;
      while (j < src.length && (src[j] !== '/' || inClass)) {
        if (src[j] === '\n') throw new Error(`an unterminated regular expression at ${i}`);
        if (src[j] === '\\') j++;
        else if (src[j] === '[') inClass = true;
        else if (src[j] === ']') inClass = false;
        j++;
      }
      i = j + 1;
      prev = '/';
      prevWord = '';
    } else {
      if ('([{'.includes(c)) depth++;
      if (')]}'.includes(c)) {
        if (depth === 0 && c === '}' && mode === 'brace') return i + 1;
        depth--;
      }
      if (c === ';' && depth === 0 && mode === 'decl') return i + 1;
      if (/\s/.test(c)) {
        i++;
        continue;
      }
      if (/[A-Za-z_$]/.test(c)) {
        let j = i;
        while (j < src.length && /[\w$]/.test(src[j])) j++;
        prevWord = src.slice(i, j);
        prev = 'a';
        i = j;
        continue;
      }
      prev = c;
      prevWord = '';
      i++;
    }
  }
  if (mode === 'brace') throw new Error('an unterminated ${');
  return i;
}

/** Every string literal of a script, each a unit, folded. */
export function literalUnits(src) {
  const out = [];
  scan(src, 0, 'top', out);
  return out.map(fold);
}

// ------------------------------------------------------------ the renderer's fixed templates

// The renderer's fixed text, found by regex over its text as the builder page
// does: each declaration is located by its name, and its literals run to its
// closing semicolon. The array templates join their lines, so a list item
// that wraps stays one unit. The names are the ones the SETTINGS map points at
// (each entry's template and projectLine), plus TOOL_PARTS and
// COST_LIMITS_FIXED; a template written inline, not named, is refused
// by the code (`renderNames`), though no test reaches that throw.
const RENDER_FIXED = ['TOOL_PARTS', 'COST_LIMITS_FIXED'];

/** The declarations of the renderer's fixed text, by name: the SETTINGS map's template and projectLine names, then the two fixed ones. */
export function renderNames(src) {
  const body = /^const SETTINGS = new Map\(\[([\s\S]*?)^\]\);/m.exec(src)?.[1];
  if (!body) throw new Error('the renderer no longer declares SETTINGS in the expected form');
  const names = [];
  for (const [, key, value] of body.matchAll(/\b(template|projectLine): ([^,}\s]+)/g)) {
    if (value === 'null') continue;
    if (!/^[A-Z][A-Z_]*$/.test(value)) throw new Error(`the renderer's SETTINGS ${key} is ${value}, not the name of a declaration`);
    if (!names.includes(value)) names.push(value);
  }
  return [...names, ...RENDER_FIXED];
}

/** The units of one renderer declaration, by name. */
function renderUnits(src, name) {
  const m = new RegExp(`^const ${name} =`, 'm').exec(src);
  if (!m) throw new Error(`the renderer no longer declares ${name} in the expected form`);
  const out = [];
  scan(src, m.index + m[0].length, 'decl', out);
  // A literal that starts with a space wraps the one before it; any other starts its own unit.
  return markdownUnits(out.map((s, i) => (i > 0 && !/^\s/.test(s) ? `\n${s}` : s)).join('\n'));
}

// ------------------------------------------------------------ every source

const real = rel => readFileSync(join(REPO, ...rel.split('/')), 'utf8');
// A folder's entries by name, a subfolder with a trailing slash.
const listReal = dir => readdirSync(join(REPO, ...dir.split('/')), { withFileTypes: true }).map(e => (e.isDirectory() ? `${e.name}/` : e.name)).sort();

/** Every unit of every source, each `{ file, text }`. `read` and `list` stand for the files, so a bad case plants into one. */
export function collect(read = real, list = listReal) {
  const units = [];
  const add = (file, texts) => units.push(...texts.map(text => ({ file, text })));
  const files = (dir, ext) => list(dir).filter(f => f.endsWith(ext)).map(f => `${dir}/${f}`);
  // A tool or a hook is read as script text; a file of another kind, or a subfolder, would go unread, so it fails the run.
  const scripts = dir => {
    const stray = list(dir).filter(f => !f.endsWith('.mjs'));
    if (stray.length) throw new Error(`${dir} holds ${stray.join(', ')}, which this test does not read: read it, or take it out`);
    return files(dir, '.mjs');
  };
  for (const f of ['claude/CLAUDE.md', 'claude/review.md', ...files('claude/commands', '.md'), ...files('claude/agents', '.md')]) add(f, markdownUnits(read(f)));
  const render = read('gate/render-core.mjs');
  for (const name of renderNames(render)) add(`gate/render-core.mjs ${name}`, renderUnits(render, name));
  for (const f of [...scripts('claude/tools'), ...scripts('claude/hooks')]) add(f, literalUnits(read(f)));
  return units;
}

// The units that are neither labelled nor to be: steps only the owner can
// take, which are physical (paste, restart, sign in), never a wait.
const EXEMPT = [{ file: 'claude/commands/scry.md', start: '- **Only you can do:**' }];
const exempt = u => EXEMPT.some(e => e.file === u.file && u.text.startsWith(e.start));

/** The failing units as lines naming the file, the unit's first words and the phrase that matched. */
export function failures(units) {
  return units.filter(u => !exempt(u) && unlabelled(u.text)).map(u => {
    const words = u.text.split(' ');
    return `${u.file}: "${words.slice(0, 8).join(' ')}${words.length > 8 ? '...' : ''}" holds "${WAIT_RE.exec(canon(u.text))[0]}"`;
  });
}

// #558 C8
test('wait label: no unit of the pact text holds a wait phrase without a label', () => {
  assert.deepEqual(failures(collect()), []);
});

// #558 C8
test('wait label: every exemption still matches a unit that would fail', () => {
  for (const e of EXEMPT) {
    const hits = collect().filter(u => u.file === e.file && u.text.startsWith(e.start));
    assert.equal(hits.length, 1, `${e.file} "${e.start}" matches ${hits.length} units`);
    assert.ok(unlabelled(hits[0].text), `${e.file} "${e.start}" is labelled, so it needs no exemption`);
  }
});

// The checker's own phrase and label lists, pinned by hard-coded fixtures: one
// unlabelled sentence per wait phrase, which must fail, and one labelled
// sentence per label form, which must pass. These tables are written out, not
// looped from WAIT_PHRASES or LABELS, so dropping a phrase or a label from the
// checker fails the row that names it. Each sentence holds its phrase and no
// other.
{
  const phrases = [
    ['wait for my', 'Please wait for my reply.'],
    ['waits for my', 'It waits for my reply.'],
    ['wait for me', 'Please wait for me.'],
    ['waits for me', 'It waits for me.'],
    ['waits on', 'It waits on the build.'],
    ['stop and ask', 'Stop and ask first.'],
    ['stop and tell me', 'Stop and tell me why.'],
    ['go-ahead', 'Get the go-ahead first.'],
    ['my confirm', 'Send my confirm.'],
    ['own yes', 'Give your own yes.'],
    ['needs my', 'This needs my attention.'],
    ['my yes', 'Reply with my yes.'],
    ['only i', 'Only I decide.'],
    ['i confirm', 'I confirm the plan.'],
    ['says in chat', 'Once the owner says in chat that it is done.'],
    ["owner's own words", "On the owner's own words."],
    ['my own words', 'In my own words.'],
    ["owner's yes", "The owner's yes is due."],
    ["owner's word", "On the owner's word."],
    ['waiting on', 'The item is waiting on a reply.'],
    ['my word', 'Take my word.'],
  ];
  for (const [phrase, text] of phrases) {
    // #558 C8
    test(`wait label phrase: "${phrase}" in an unlabelled unit fails`, () => {
      assert.equal(unlabelled(text), true, `${JSON.stringify(text)} holds "${phrase}" and no label`);
    });
  }
  const labels = [
    ['checkpoint', 'This is a checkpoint and waits for my word.'],
    ['checkpoints', 'These are checkpoints and wait for my word.'],
    ['hard stop', 'This is a hard stop and waits for my word.'],
    ['hard stops', 'Hard stops wait for my word.'],
  ];
  for (const [label, text] of labels) {
    // #558 C8
    test(`wait label label: "${label}" covers a wait`, () => {
      assert.equal(unlabelled(text), false, `${JSON.stringify(text)} holds the label "${label}"`);
    });
  }
}

// The spec's other bad cases, fed to the checker itself: each is a unit's
// text, or script text for a tool's literal. The script text of an escape keeps
// its backslash (the \uNNNN one is built, so no editor reads it as a space).
{
  const rows = [
    { id: 'waits-for-my-word', text: '- **Sample.** This waits for my word.', fails: true, why: 'an unlabelled wait' },
    { id: 'needs-my-confirm', text: 'It needs my confirm in chat.', fails: true, why: 'another wait phrase' },
    { id: 'code-span', text: 'Run `go-ahead` first.', fails: true, why: 'a phrase inside a code span' },
    { id: 'line-break', text: '- **Sample.** It waits for\n  my reply.', fails: true, why: 'a phrase wrapped across a line break' },
    { id: 'only-if-its', text: 'Only if it holds; only its own part.', fails: false, why: 'a prefix of the phrase is no match' },
    { id: 'label-in-a-name', text: 'The checkpoint-stops setting needs my yes.', fails: true, why: 'a hyphenated name is not the label' },
    { id: 'emphasis-in-a-phrase', text: '- **Sample.** This waits for **my** word.', fails: true, why: 'emphasis marks inside the phrase' },
    { id: 'code-span-in-a-phrase', text: 'Merge on my `yes`.', fails: true, why: 'a code span inside the phrase' },
    { id: 'curly-apostrophe', text: 'Only on the owner’s yes.', fails: true, why: 'a curly apostrophe in a phrase' },
    { id: 'curly-apostrophe-left', text: 'Only on the owner‘s yes.', fails: true, why: 'a left curly quote in a phrase' },
    { id: 'underscore-in-a-phrase', text: 'It waits for _my_ reply.', fails: true, why: 'underscores inside the phrase' },
    { id: 'table-cells', text: '| Step | Who |\n| --- | --- |\n| A checkpoint | waits for my word |', fails: true, why: 'a label in one cell of a row does not cover a wait in another' },
    { id: 'tool-literal', src: `const RULE = "only after the owner's own yes";`, fails: true, why: 'a tool string literal' },
    { id: 'tool-escape-u', src: `const RULE = "my${'\\'}u0020yes";`, fails: true, why: 'a \\uNNNN escape in a literal' },
    { id: 'tool-escape-x', src: String.raw`const RULE = "my\x20yes";`, fails: true, why: 'a \\xNN escape in a literal' },
    { id: 'tool-escape-letter', src: String.raw`const RULE = "my y\x65s";`, fails: true, why: 'a \\xNN escape that decodes to a letter' },
    { id: 'tool-escape-braced', src: String.raw`const RULE = "my\u{20}yes";`, fails: true, why: 'a \\u{...} escape in a literal' },
    { id: 'tool-template', src: 'const RULE = `it waits on you ${"checkpoint"}`;', fails: true, why: 'a template literal is one unit, and a literal inside its expression is another' },
    { id: 'tool-comment-and-regex', src: `// waits on 'my yes'\nconst RE = /'only i/; const OK = "fine"; /* "go-ahead" */`, fails: false, why: 'a comment and a regular expression are no literal' },
  ];
  for (const r of rows) {
    // #558 C8
    test(`wait label bad case: ${r.id}`, () => {
      const units = r.src === undefined ? markdownUnits(r.text) : literalUnits(r.src);
      assert.equal(units.some(unlabelled), r.fails, r.why);
    });
  }
}

// A source the test does not read must fail the run, not pass it: a tools or
// hooks folder holding a file that is not a script, or a subfolder, is refused.
{
  const withEntry = (dir, entry) => (d => (d === dir ? [...listReal(d), entry] : listReal(d)));
  for (const [dir, entry] of [['claude/tools', 'helper.sh'], ['claude/hooks', 'extra.cjs'], ['claude/tools', 'lib/']]) {
    // #558 C8
    test(`wait label: ${dir} holding ${entry} fails the run`, () => {
      assert.throws(() => collect(real, withEntry(dir, entry)), new RegExp(`${dir} holds ${entry}, which this test does not read`));
    });
  }
}

// A plant into each kind of source, so a source the test stopped reading would
// pass the plant: the unit the plant adds must fail, and nothing else.
{
  const bad = '\n\nThis one needs my yes.\n';
  const swap = (rel, from, to) => ({ rel, plant: s => {
    assert.ok(s.includes(from), `${rel} no longer holds ${JSON.stringify(from)}`);
    return s.replace(from, () => to);
  } });
  const rows = [
    { id: 'rules-source', rel: 'claude/CLAUDE.md', plant: s => s + bad, says: 'claude/CLAUDE.md: "This one needs my yes."' },
    { id: 'rules-source-mark', rel: 'claude/CLAUDE.md', plant: s => s.replace('<!-- pact:begin usage-pause -->\n', () => '<!-- pact:begin usage-pause -->\nThis one needs my yes.\n'), says: 'claude/CLAUDE.md: "This one needs my yes."' },
    { id: 'review', rel: 'claude/review.md', plant: s => s + bad, says: 'claude/review.md: "This one needs my yes."' },
    { id: 'command', rel: 'claude/commands/finis.md', plant: s => s + bad, says: 'claude/commands/finis.md: "This one needs my yes."' },
    { id: 'agent', rel: 'claude/agents/scout.md', plant: s => s + bad, says: 'claude/agents/scout.md: "This one needs my yes."' },
    { id: 'tool-part', ...swap('gate/render-core.mjs', 'as that section says.', 'on my yes.'), says: 'gate/render-core.mjs TOOL_PARTS: "- **Post through the poster,** on my yes."' },
    { id: 'usage-template', ...swap('gate/render-core.mjs', "'  hard stop. The call to cut", "'  go-ahead. The call to cut"), says: 'gate/render-core.mjs USAGE_TEMPLATE:' },
    { id: 'usage-project-line', ...swap('gate/render-core.mjs', "it's a hard stop when the weekly limit", 'it needs my yes when the weekly limit'), says: 'gate/render-core.mjs USAGE_PROJECT_LINE:' },
    { id: 'session-template', ...swap('gate/render-core.mjs', "it's a hard stop. If you can't", "it needs my yes. If you can't"), says: 'gate/render-core.mjs SESSION_TEMPLATE:' },
    // A setting added to the map with a template of its own is read, because the names come from the map.
    { id: 'new-setting-template', ...swap('gate/render-core.mjs', 'const SETTINGS = new Map([', "const NEWSET_TEMPLATE = ['- It needs my yes.'];\nconst SETTINGS = new Map([\n  ['newset', Object.freeze({ mark: null, template: NEWSET_TEMPLATE, projectLine: null })],"), says: 'gate/render-core.mjs NEWSET_TEMPLATE: "- It needs my yes."' },
    // The label deleted, with no phrase swapped in: the unit holds "I confirm" and nothing that labels it.
    { id: 'cost-limits', ...swap('gate/render-core.mjs', 'I confirm in chat, a hard stop, adds', 'I confirm in chat, adds'), says: 'gate/render-core.mjs COST_LIMITS_FIXED:' },
    { id: 'tool-literal', rel: 'claude/tools/cleaner.mjs', plant: s => `${s}\nconst PLANT = "only after the owner's own yes";\n`, says: 'claude/tools/cleaner.mjs: "only after the owner\'s own yes"' },
    { id: 'hook-literal', rel: 'claude/hooks/compact-handoff.mjs', plant: s => `${s}\nconst PLANT = 'it waits on my word';\n`, says: 'claude/hooks/compact-handoff.mjs: "it waits on my word"' },
  ];
  for (const r of rows) {
    // #558 C8
    test(`wait label plant: ${r.id}`, () => {
      const planted = failures(collect(rel => (rel === r.rel ? r.plant(real(rel)) : real(rel))));
      assert.equal(planted.length, 1, planted.join('\n'));
      assert.ok(planted[0].startsWith(r.says), planted[0]);
    });
  }
}
