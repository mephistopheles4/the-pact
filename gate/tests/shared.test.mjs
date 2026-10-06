// The shared gate module (#91): the strict JSON reader, the text scanner, the
// safe-path test, the name filter, the report and refusal types, the structure
// patterns and the marker parser live in gate/shared.mjs, and seam A and its
// pact-text checks hold no copy of their own. The cross script keeps its copy
// (it installs standalone); cross-parity.test.mjs holds that copy to this one.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import * as shared from '../shared.mjs';
import { GATE } from './helpers.mjs';

const SHARED = join(GATE, 'shared.mjs');
const USERS = ['seam-a.mjs', 'pact-text.mjs'];

// Every piece that moved, by its declared name.
const MOVED = [
  // the text scanner
  'MAX_BYTES',
  'CHARACTER_HITS_MAX',
  'DEFAULT_IGNORABLE_RE',
  'isInvisible',
  'isRefused',
  'scanText',
  // the strict JSON reader
  'JSON_SCALAR_RE',
  'JSON_DEPTH_MAX',
  'readStrictJson',
  // the safe-path test and the name filter
  'SEGMENT_RE',
  'safePath',
  'shown',
  // the report and refusal types
  'Report',
  'Refused',
  // the structure patterns
  'FENCE_RE',
  'ANY_FENCE_RE',
  'SETEXT_RE',
  'HEADING_LIKE_RE',
  'HEADING_RE',
  'MOVE_RE',
  // the marker parser
  'MARKER_RE',
  'PACT_MARKER_RE',
  'parseDoc',
];

/** The moved names `text` declares at its top level: its own copies. */
function ownCopies(text) {
  return MOVED.filter(name => new RegExp(`^(?:export\\s+)?(?:async\\s+)?(?:function\\*?|class|const|let|var)\\s+${name}\\b`, 'm').test(text));
}

test('the shared module exports every moved piece', () => {
  for (const name of MOVED) assert.ok(Object.hasOwn(shared, name), `${name} is not exported`);
});

test('the shared module declares every moved piece itself', () => {
  assert.deepEqual(ownCopies(readFileSync(SHARED, 'utf8')), MOVED);
});

for (const file of USERS) {
  test(`${file} holds no copy of a moved piece`, () => {
    assert.deepEqual(ownCopies(readFileSync(join(GATE, file), 'utf8')), []);
  });

  test(`${file} imports the shared module`, () => {
    assert.match(readFileSync(join(GATE, file), 'utf8'), /^import \{[^}]+\} from '\.\/shared\.mjs';$/m);
  });
}

test('bad case: a copy planted back into seam A is caught', () => {
  const planted = `${readFileSync(join(GATE, 'seam-a.mjs'), 'utf8')}\nfunction scanText(buf) {\n  return buf;\n}\nconst MAX_BYTES = 1;\n`;
  assert.deepEqual(ownCopies(planted), ['MAX_BYTES', 'scanText']);
});

test('the shared module loads only node: built-ins, and nothing from the gate', () => {
  const imports = readFileSync(SHARED, 'utf8')
    .split('\n')
    .filter(l => /^\s*import\b/.test(l) || /\bimport\s*\(|\brequire\s*\(/.test(l));
  for (const line of imports) assert.match(line, /^import \{[A-Za-z0-9_, ]+\} from 'node:[a-z]+';$/, line);
});
