// The poster's documented posts (#253, T1 of #246; #524). Its ask-rule tests
// left with the ask rules, and the file its old name (#265). One documented
// post per surface, written as the post file's own JSON.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EXAMPLES, KINDS, SCHEMA, SURFACES, post } from '../../claude/tools/poster.mjs';
import { postDoc } from './poster-post.mjs';
import { tempDir, writeTree } from './tree.mjs';

// #246 C9, #524 C10: one documented post per surface, and each passes a dry run
test('every surface has one documented post, and each passes a dry run that calls no gh', t => {
  assert.deepEqual(Object.keys(EXAMPLES).sort(), Object.keys(SURFACES).sort());
  for (const [surface, doc] of Object.entries(EXAMPLES)) {
    const dir = tempDir(t, 'pact-poster-example-');
    writeTree(dir, { [doc.body_file]: 'The text of the post.\n' });
    const r = postDoc(surface, doc, dir, { gh: () => assert.fail('a dry run calls gh'), env: {} }, true);
    assert.equal(r.code, 0, `${surface}: ${r.lines.join(' | ')}`);
    assert.equal(r.lines.at(-1), `RESULT: dry-run ${surface}`);
  }
});

// #524 C10: the schema names every field an example uses, and no surface takes a field the schema lacks
test("the schema holds every field the examples and the surfaces name, and each kind's surfaces exist", () => {
  const known = new Set(Object.keys(SCHEMA.properties));
  for (const [surface, doc] of Object.entries(EXAMPLES)) for (const name of Object.keys(doc)) assert.ok(known.has(name), `${surface}: ${name}`);
  for (const [surface, fields] of Object.entries(SURFACES)) for (const name of Object.keys(fields)) assert.ok(known.has(name), `${surface}: ${name}`);
  for (const [kind, row] of Object.entries(KINDS)) for (const surface of row.surfaces) assert.ok(Object.hasOwn(SURFACES, surface), `${kind}: ${surface}`);
  assert.deepEqual(SCHEMA.properties.kind.enum, Object.keys(KINDS));
});

// #524 C2: `node poster.mjs schema` is the same object the validator reads
test('the schema the poster prints is the schema it checks against', () => {
  const r = post(['schema'], { gh: () => assert.fail('schema calls no gh'), env: {} });
  assert.deepEqual(JSON.parse(r.lines[0]), JSON.parse(JSON.stringify(SCHEMA)));
});
