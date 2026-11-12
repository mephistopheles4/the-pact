// The poster's tests post one JSON document per post (#524). Most cases still
// say what they post as the old option list did, which reads well; `postOld`
// turns that list into the post document the poster takes now, writes it next
// to the body file the list names, and runs the poster on it. It changes no
// check: what the poster refuses, it refuses on the document. A case that
// tests the command line or the document itself calls `post` directly.
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { post } from '../../claude/tools/poster.mjs';

/** The signer every ported post carries. */
export const SIGNER = 'test-524';
/** The ask and read-back a ported issue or pull request carries. */
export const QUOTE = Object.freeze([Object.freeze({ text: 'The owner asked for a plain thing.', source: 'chat', when: '2026-11-11' })]);
export const INTENT = Object.freeze({ text: 'A plain thing is wanted.', status: 'pending' });

const KIND = { issue: 'issue', 'pull-request': 'pull-request', 'issue-comment': 'note', 'pull-request-review': 'review', 'review-thread-reply': 'reply' };
const FLAGS = new Set(['draft', 'dry-run']);
const WHOLE = /^(?:0|-?[1-9][0-9]*)$/;

/** The body the poster sends for a ported create post: the session's text, then the signature. */
export const sent = (text, signer = SIGNER) => `${text.replace(/(?:\r?\n)+$/, '')}\n\nSigned: ${signer}`;

/** The body of a ported issue or pull request: the ask, the read-back, the text, the signature. */
export const sentWithAsk = text =>
  `## The ask\n\n> ${QUOTE[0].text}\n\nSaid in this session's chat, ${QUOTE[0].when}.\n\n## Understood intent\n\n${INTENT.text}\n\nRead-back: not yet confirmed.\n\n${sent(text)}`;

let counter = 0;

/** The post document an old-form option list stands for, and whether it is a dry run. */
export function docOf(argv) {
  const [surface, ...rest] = argv;
  const opt = new Map();
  const labels = [];
  for (let i = 0; i < rest.length; i += 1) {
    const name = rest[i].slice(2);
    if (FLAGS.has(name)) opt.set(name, true);
    else if (name === 'label') labels.push(rest[(i += 1)]);
    else opt.set(name, rest[(i += 1)]);
  }
  const doc = { repo: opt.get('repo'), kind: KIND[surface], signer: SIGNER, body_file: basename(opt.get('body')) };
  if (opt.has('as')) doc.as = opt.get('as');
  for (const name of ['issue', 'pr', 'comment']) if (opt.has(name)) doc[name] = WHOLE.test(opt.get(name)) ? Number(opt.get(name)) : opt.get(name);
  if (opt.has('head')) doc.head = opt.get('head');
  if (opt.has('base')) doc.base = opt.get('base');
  if (opt.get('draft')) doc.draft = true;
  if (labels.length) doc.labels = labels;
  if (opt.has('title-file')) {
    let title = '';
    try {
      title = readFileSync(opt.get('title-file'), 'utf8').replace(/\r?\n$/, '');
    } catch {
      // A missing title file stays an empty title, which the poster refuses.
    }
    doc.title = title;
  }
  if (surface === 'issue' || surface === 'pull-request') {
    doc.quote = structuredClone(QUOTE);
    doc.intent = { ...INTENT };
  }
  return { surface, doc, dry: opt.get('dry-run') === true, bodyPath: opt.get('body') };
}

/** Write a post document beside `dir` and run the poster on it. */
export function postDoc(surface, doc, dir, io, dry = false) {
  counter += 1;
  const file = join(dir, `post-${counter}.json`);
  writeFileSync(file, JSON.stringify(doc));
  return post([surface, '--post', file, ...(dry ? ['--dry-run'] : [])], io);
}

/** Post what an old-form option list stood for, through the JSON poster. `change` may reshape the document first. */
export function postOld(argv, io, change = d => d) {
  const { surface, doc, dry, bodyPath } = docOf(argv);
  return postDoc(surface, change(doc), dirname(bodyPath), io, dry);
}
