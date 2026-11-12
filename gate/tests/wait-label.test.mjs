// The wait-label test (#558 S8, of #554): every place the pact's text says
// something waits on the owner names it a checkpoint or a hard stop. A unit
// (a list item, a paragraph, a table row, a fenced block, a mark line, or one
// string literal of a tool or hook) that holds a wait phrase and none of the
// labels fails, named by file and first words. Whitespace folds to one space;
// matching ignores case, reaches inside code spans, and takes whole words, so
// `only i` matches "only I can" and never "only in" or "only its". A hyphen
// joins words: "checkpoint-stops" is one word, never the label.
// Reads text only: the sources are read, never run or rendered.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { REPO } from './text.mjs';

const WAIT_PHRASES = ['wait for my', 'waits for my', 'wait for me', 'waits for me', 'waits on', 'stop and ask', 'stop and tell me', 'go-ahead', 'my confirm', 'own yes', 'needs my', 'my yes', 'only i'];
const LABELS = ['checkpoint', 'checkpoints', 'hard stop', 'hard stops'];

// A word's edges: no letter, digit or underscore beside it, and no such
// character behind a hyphen that joins it to the next word.
const wholeWords = list => new RegExp(`(?<![\\p{L}\\p{N}_])(?<![\\p{L}\\p{N}_]-)(?:${list.map(p => p.replace(/ /g, '\\s')).join('|')})(?![\\p{L}\\p{N}_])(?!-[\\p{L}\\p{N}_])`, 'iu');
const WAIT_RE = wholeWords(WAIT_PHRASES);
const LABEL_RE = wholeWords(LABELS);

const fold = s => s.replace(/\s+/g, ' ').trim();

/** Whether a unit's text holds a wait phrase and no label. */
export const unlabelled = text => WAIT_RE.test(fold(text)) && !LABEL_RE.test(fold(text));

// ------------------------------------------------------------ units of a markdown file

const MARK_LINE = /^\s*<!--.*-->\s*$/;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s/;

/** The units of markdown text: list items, paragraphs, table rows, fenced blocks, headings and mark lines, each folded. */
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
    } else if (line.trim() === '' || /^\s*(?:---+|#{1,6}\s.*)$/.test(line) || MARK_LINE.test(line) || /^\s*\|/.test(line)) {
      flush();
      // A heading, a mark line and a table row are each one unit (a mark line sits against the item before it, so it must not share its label); a rule or a blank line is none.
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

const unescape = s => s.replace(/\\\r?\n/g, '').replace(/\\[ntr]/g, ' ').replace(/\\([\s\S])/g, '$1');

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
// that wraps stays one unit.
const RENDER_DECLARED = ['TOOL_PARTS', 'USAGE_TEMPLATE', 'USAGE_PROJECT_LINE', 'SESSION_TEMPLATE', 'SESSION_PROJECT_LINE', 'CHECKPOINTS_TEMPLATE', 'CHECKPOINTS_PROJECT_LINE', 'COST_LIMITS_FIXED'];

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
const listReal = (dir, ext) => readdirSync(join(REPO, ...dir.split('/'))).filter(f => f.endsWith(ext)).sort().map(f => `${dir}/${f}`);

/** Every unit of every source, each `{ file, text }`. `read` and `list` stand for the files, so a bad case plants into one. */
export function collect(read = real, list = listReal) {
  const units = [];
  const add = (file, texts) => units.push(...texts.map(text => ({ file, text })));
  for (const f of ['claude/CLAUDE.md', 'claude/review.md', ...list('claude/commands', '.md'), ...list('claude/agents', '.md')]) add(f, markdownUnits(read(f)));
  const render = read('gate/render-core.mjs');
  for (const name of RENDER_DECLARED) add(`gate/render-core.mjs ${name}`, renderUnits(render, name));
  for (const f of [...list('claude/tools', '.mjs'), ...list('claude/hooks', '.mjs')]) add(f, literalUnits(read(f)));
  return units;
}

// The units that are neither labelled nor to be: steps only the owner can
// take, which are physical (paste, restart, sign in), never a wait.
const EXEMPT = [{ file: 'claude/commands/scry.md', start: '- **Only you can do:**' }];
const exempt = u => EXEMPT.some(e => e.file === u.file && u.text.startsWith(e.start));

/** The failing units as lines naming the file and the unit's first words. */
export function failures(units) {
  return units.filter(u => !exempt(u) && unlabelled(u.text)).map(u => {
    const words = u.text.split(' ');
    return `${u.file}: "${words.slice(0, 8).join(' ')}${words.length > 8 ? '...' : ''}"`;
  });
}

// #558 S8
test('wait label: no unit of the pact text holds a wait phrase without a label', () => {
  assert.deepEqual(failures(collect()), []);
});

// #558 S8
test('wait label: every exemption still matches a unit that would fail', () => {
  for (const e of EXEMPT) {
    const hits = collect().filter(u => u.file === e.file && u.text.startsWith(e.start));
    assert.equal(hits.length, 1, `${e.file} "${e.start}" matches ${hits.length} units`);
    assert.ok(unlabelled(hits[0].text), `${e.file} "${e.start}" is labelled, so it needs no exemption`);
  }
});

// The spec's bad cases, fed to the checker itself: each is a unit's text, or
// script text for a tool's literal.
{
  const rows = [
    { id: 'waits-for-my-word', text: '- **Sample.** This waits for my word.', fails: true, why: 'an unlabelled wait' },
    { id: 'labelled-checkpoint', text: '- **Sample.** This is a checkpoint and waits for my word.', fails: false, why: 'the same unit with a label' },
    { id: 'needs-my-confirm', text: 'It needs my confirm in chat.', fails: true, why: 'another wait phrase' },
    { id: 'code-span', text: 'Run `go-ahead` first.', fails: true, why: 'a phrase inside a code span' },
    { id: 'line-break', text: '- **Sample.** It waits for\n  my word.', fails: true, why: 'a phrase wrapped across a line break' },
    { id: 'only-i-can', text: 'Steps only I can take.', fails: true, why: 'a phrase of two words, in capitals' },
    { id: 'only-if-its', text: 'Only if it holds; only its own part.', fails: false, why: 'a prefix of the phrase is no match' },
    { id: 'hard-stops-label', text: 'Hard stops wait for my word.', fails: false, why: 'the plural label, in capitals' },
    { id: 'label-in-a-name', text: 'The checkpoint-stops setting needs my yes.', fails: true, why: 'a hyphenated name is not the label' },
    { id: 'tool-literal', src: `const RULE = "only after the owner's own yes";`, fails: true, why: 'a tool string literal' },
    { id: 'tool-literal-labelled', src: `const RULE = "a hard stop, only after the owner's own yes";`, fails: false, why: 'the same literal with a label' },
    { id: 'tool-template', src: 'const RULE = `it waits on you ${"checkpoint"}`;', fails: true, why: 'a template literal is one unit, and a literal inside its expression is another' },
    { id: 'tool-comment-and-regex', src: `// waits on 'my yes'\nconst RE = /'only i/; const OK = "fine"; /* "go-ahead" */`, fails: false, why: 'a comment and a regular expression are no literal' },
  ];
  for (const r of rows) {
    // #558 S8
    test(`wait label bad case: ${r.id}`, () => {
      const units = r.src === undefined ? markdownUnits(r.text) : literalUnits(r.src);
      assert.equal(units.some(unlabelled), r.fails, r.why);
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
    { id: 'rules-source-mark', rel: 'claude/CLAUDE.md', plant: s => s.replace('<!-- pact:begin checkpoint-stops -->\n', () => '<!-- pact:begin checkpoint-stops -->\nThis one needs my yes.\n'), says: 'claude/CLAUDE.md: "This one needs my yes."' },
    { id: 'review', rel: 'claude/review.md', plant: s => s + bad, says: 'claude/review.md: "This one needs my yes."' },
    { id: 'command', rel: 'claude/commands/finis.md', plant: s => s + bad, says: 'claude/commands/finis.md: "This one needs my yes."' },
    { id: 'agent', rel: 'claude/agents/scout.md', plant: s => s + bad, says: 'claude/agents/scout.md: "This one needs my yes."' },
    { id: 'tool-part', ...swap('gate/render-core.mjs', 'as that section says.', 'on my yes.'), says: 'gate/render-core.mjs TOOL_PARTS: "- **Post through the poster,** on my yes."' },
    { id: 'usage-template', ...swap('gate/render-core.mjs', "'  hard stop. The call to cut", "'  go-ahead. The call to cut"), says: 'gate/render-core.mjs USAGE_TEMPLATE:' },
    { id: 'usage-project-line', ...swap('gate/render-core.mjs', "it's a hard stop when the weekly limit", 'it needs my yes when the weekly limit'), says: 'gate/render-core.mjs USAGE_PROJECT_LINE:' },
    { id: 'session-template', ...swap('gate/render-core.mjs', "it's a hard stop. If you can't", "it needs my yes. If you can't"), says: 'gate/render-core.mjs SESSION_TEMPLATE:' },
    { id: 'checkpoints-template', ...swap('gate/render-core.mjs', "'- **Checkpoints wait.** Each checkpoint waits for my word", "'- **It waits.** Each one waits for my word"), says: 'gate/render-core.mjs CHECKPOINTS_TEMPLATE:' },
    { id: 'cost-limits', ...swap('gate/render-core.mjs', 'I confirm in chat, a hard stop, adds', 'I confirm in chat, my yes, adds'), says: 'gate/render-core.mjs COST_LIMITS_FIXED:' },
    { id: 'tool-literal', rel: 'claude/tools/cleaner.mjs', plant: s => `${s}\nconst PLANT = "only after the owner's own yes";\n`, says: 'claude/tools/cleaner.mjs: "only after the owner\'s own yes"' },
    { id: 'hook-literal', rel: 'claude/hooks/compact-handoff.mjs', plant: s => `${s}\nconst PLANT = 'it waits on my word';\n`, says: 'claude/hooks/compact-handoff.mjs: "it waits on my word"' },
  ];
  for (const r of rows) {
    // #558 S8
    test(`wait label plant: ${r.id}`, () => {
      const planted = failures(collect(rel => (rel === r.rel ? r.plant(real(rel)) : real(rel))));
      assert.equal(planted.length, 1, planted.join('\n'));
      assert.ok(planted[0].startsWith(r.says), planted[0]);
    });
  }
}

// #558 S8
test('wait label: the tree passes again after the plants', () => {
  assert.deepEqual(failures(collect()), []);
});
