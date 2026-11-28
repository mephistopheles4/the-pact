// The pact's own entries file, docs/threat-entries.json, traced to
// docs/threat-model.md in both directions (spec 0011, S2 and claim 16).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { draftEntries, parseEntries } from '../../claude/tools/coverage.mjs';
import { REPO } from './text.mjs';

const repoText = path => readFileSync(join(REPO, path), 'utf8').replace(/\r\n/g, '\n');
const MODEL = repoText('docs/threat-model.md');

/** The sources of text the Text into a session boundary lists under Crosses, by the entry id each one has. */
const SOURCES = {
  text_steers_from_tracker_text: 'tracker text',
  text_steers_from_outside_pull_request: 'outside pull requests read as text',
  text_steers_from_cloned_repo_file: "a cloned repo's files",
  text_steers_from_fetched_page: 'fetched pages',
  text_steers_from_session_message: "other sessions' messages and hand-offs",
  text_steers_from_trigger_prompt: "a trigger's prompt",
  text_steers_from_mic_transcript: 'a mic transcript',
  text_steers_from_handed_file: 'a file someone hands a session to load',
  text_steers_from_decision_model: "a decision model's answer",
  text_steers_from_coverage_hint: "`coverage`'s answer and hint, from any backend, Jev's included",
};

/** The only draft ids the file may split, each into its pieces. */
const SPLIT = ['text_steers_a_session', 'out_of_scope_1', 'out_1'];

/** What the Text steers a session bullet says before what goes on to `text_steers_rest`. */
const STEERS_HEAD = 'Text steers a session. Any text a session or lens reads can move it, in auto mode before the owner sees it, ';

/** What differs between Crosses and `SOURCES`: a source with no phrase there, or text no source covers. */
function sourceProblems(model) {
  const section = model.split('\n### Text into a session\n')[1]?.split('\n### ')[0] ?? '';
  const crosses = /\*\*Crosses:\*\*([\s\S]*?)\n\n/.exec(section)?.[1] ?? '';
  let left = crosses.replace(/\s+/g, ' ').replace(/ \([^()]*\)/g, '');
  const out = [];
  for (const phrase of Object.values(SOURCES).sort((a, b) => b.length - a.length)) {
    if (!left.includes(phrase)) out.push(`Crosses no longer lists: ${phrase}`);
    left = left.replace(phrase, '');
  }
  const rest = left.replace(/\band\b|[\s,.]/g, '');
  if (rest !== '') out.push(`Crosses lists a source with no entry: ${rest}`);
  return out;
}

/** Every way `file`, an entries file's text, fails to trace to `model`, a threat model's text. */
function problems(model, file) {
  const doc = parseEntries(file);
  const draft = draftEntries(model);
  const from = { ...doc.from };
  const ids = [...Object.keys(doc.entries), ...Object.keys(doc.scope)];
  const draftIds = [...Object.keys(draft.entries), ...Object.keys(draft.scope)];
  const out = sourceProblems(model);
  for (const id of ids) {
    if (Object.hasOwn(from, id)) {
      if (!SPLIT.includes(from[id]) || !draftIds.includes(from[id])) out.push(`${id}: split from ${from[id]}, which may not be split or is no draft id`);
    } else if (!draftIds.includes(id)) out.push(`${id}: no draft id, and no from`);
  }
  for (const id of draftIds) if (!ids.includes(id) && !Object.values(from).includes(id)) out.push(`${id}: a draft id the file leaves out`);
  for (const map of ['entries', 'scope']) {
    for (const [id, text] of Object.entries(doc[map])) {
      if (!Object.hasOwn(from, id) && Object.hasOwn(draft[map], id) && text !== draft[map][id]) out.push(`${id}: not the draft's text`);
    }
  }
  const sourced = Object.keys(doc.entries).filter(id => id.startsWith('text_steers_from_'));
  for (const id of new Set([...sourced, ...Object.keys(SOURCES)])) {
    const phrase = SOURCES[id]?.replaceAll('`', '');
    if (!phrase || from[id] !== 'text_steers_a_session') out.push(`${id}: no source, or not split from text_steers_a_session`);
    else if (!doc.entries[id].includes(`from ${phrase}`)) out.push(`${id}: its text doesn't name its source`);
  }
  const steers = draft.entries.text_steers_a_session ?? '';
  if (!steers.startsWith(STEERS_HEAD) || !doc.entries.text_steers_rest?.endsWith(steers.slice(STEERS_HEAD.length))) out.push('text_steers_rest: no longer holds what the bullet says beyond its sources');
  // The scope paragraph's pieces, joined, are the paragraph: as entries and as scope alike.
  for (const [map, whole] of [['entries', 'out_of_scope_1'], ['scope', 'out_1']]) {
    const pieces = ['a', 'b', 'c', 'd', 'e'].map(k => doc[map][`${whole}_${k}`]);
    if (pieces.join(' ') !== draft[map][whole]) out.push(`${whole}: its five pieces don't make up the draft's text`);
  }
  return out;
}

const file = () => repoText('docs/threat-entries.json');
const edited = change => {
  const doc = JSON.parse(file());
  change(doc);
  return JSON.stringify(doc);
};
/** `MODEL` with `from` turned into `to`; fails when the model no longer holds `from`. */
const reworded = (from, to) => {
  assert.ok(MODEL.includes(from), `the threat model no longer holds: ${from}`);
  return MODEL.replace(from, to);
};

test("the pact's entries file passes the check and traces to the threat model both ways", () => {
  assert.deepEqual(problems(MODEL, file()), []);
});

for (const [label, model, entries, says] of [
  ['a planted id with no source', () => MODEL, () => edited(d => (d.entries.planted = 'A planted entry.')), /planted: no draft id/],
  ['a draft id left out', () => MODEL, () => edited(d => delete d.entries.posts_are_public), /posts_are_public: a draft id the file leaves out/],
  ['a reworded class', () => reworded('Reports, step logs', 'Reports and step logs'), file, /posts_are_public: not the draft's text/],
  ['a new source', () => reworded('a mic transcript,', 'a mic transcript, a shared whiteboard,'), file, /a source with no entry: asharedwhiteboard/],
]) {
  test(`bad case: ${label} fails the trace`, () => {
    assert.match(problems(model(), entries()).join('\n'), says);
  });
}
