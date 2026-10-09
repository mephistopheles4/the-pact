// Parity (#44): the cross script's copies of the gate's strict JSON reader and
// its two character rules match the gate's, and the same refusal fixtures pass
// and fail on both. The gate's copies live in its shared module (#91), which
// seam A imports; the source comparison reads that module. The fixtures run
// through seam A's own command line, since seam A runs its check when
// imported. The cross script's extra rules (tab refused, pictographs, the
// crossing mark) sit outside the copies and are not compared.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { CROSS, block, cross, finding, report } from './cross-helpers.mjs';
import { runSeamA } from './gate-run.mjs';
import { realOverlay, stage } from './payload.mjs';
import { GATE, agent, failRules } from './text.mjs';

const sharedSource = readFileSync(join(GATE, 'shared.mjs'), 'utf8').split('\n');
const crossSource = readFileSync(CROSS, 'utf8').split('\n');

/** A top-level declaration's text, from its first line to its closing "}" line. */
function declaration(src, head) {
  const i = src.findIndex(l => l.startsWith(head));
  assert.ok(i >= 0, `${head} not found`);
  const e = src.findIndex((l, j) => j > i && l === '}');
  return src.slice(i, e + 1).join('\n');
}
const constant = (src, name) => src.find(l => l.startsWith(`const ${name} = `));

const CONSTANTS = ['MAX_BYTES', 'JSON_SCALAR_RE', 'JSON_DEPTH_MAX', 'DEFAULT_IGNORABLE_RE'];
const DECLARATIONS = ['function isInvisible(', 'function isRefused(', 'class Refused ', 'function readStrictJson('];

// The two parity checks. The real tests and the bad cases below call these
// same functions, so a bad case guards the check itself, not a copy of it.
function constantParity(shared, name) {
  assert.ok(constant(shared, name), `${name} not found in the shared module`);
  assert.equal(constant(crossSource, name), constant(shared, name));
}
function declarationParity(shared, head) {
  assert.equal(declaration(crossSource, head), declaration(shared, head));
}

// ------------------------------------------------------------ the source

for (const name of CONSTANTS) {
  test(`parity: the constant ${name} is the shared module's, byte for byte`, () => constantParity(sharedSource, name));
}

for (const head of DECLARATIONS) {
  test(`parity: ${head.trim()} is the shared module's, byte for byte`, () => declarationParity(sharedSource, head));
}

/** One character of `text` changed: its first digit from `from` on, or else the one halfway along. */
function changed(text, from) {
  const d = text.slice(from).search(/[0-9]/);
  const at = d >= 0 ? from + d : from + Math.floor((text.length - from) / 2);
  const ch = d >= 0 ? String((Number(text[at]) + 1) % 10) : text[at] === 'x' ? 'y' : 'x';
  return `${text.slice(0, at)}${ch}${text.slice(at + 1)}`;
}

for (const name of CONSTANTS) {
  test(`bad case: a value planted in the shared ${name} fails parity`, () => {
    const head = `const ${name} = `;
    const planted = sharedSource.map(l => (l.startsWith(head) ? changed(l, head.length) : l));
    // The name still reads, so the failure is the changed value, not a lookup miss.
    assert.ok(constant(planted, name));
    assert.notEqual(constant(planted, name), constant(sharedSource, name));
    assert.throws(() => constantParity(planted, name), assert.AssertionError);
  });
}

for (const head of DECLARATIONS) {
  test(`bad case: a divergence planted inside the shared ${head.trim()} fails parity`, () => {
    // The line after the head, so the change is inside the body, not the name.
    const i = sharedSource.findIndex(l => l.startsWith(head)) + 1;
    const planted = sharedSource.map((l, j) => (j === i ? changed(l, 0) : l));
    assert.ok(declaration(planted, head));
    assert.throws(() => declarationParity(planted, head), assert.AssertionError);
  });
}

// ------------------------------------------------------------ the reader: same fixtures, both sides

// Each defect is applied to a valid JSON object's text: seam A's settings
// overlay on one side, a findings block on the other. `key` is a key the
// object already has.
const READER = [
  ['a key twice', 'duplicate', (json, key) => json.replace('{', `{"${key}": 1,`)],
  ['a key twice, case-folded', 'duplicate', (json, key) => json.replace('{', `{"${key[0].toUpperCase()}${key.slice(1)}": 1,`)],
  ['a key twice, written with an escape', 'duplicate', (json, key) => json.replace('{', `{"${key.slice(0, -1)}\\u00${key.charCodeAt(key.length - 1).toString(16)}": 1,`)],
  ['nesting 66 deep', 'read', json => json.replace('{', `{"deep": ${'['.repeat(66)}${']'.repeat(66)},`)],
  ['nesting 60 deep (passes the reader)', null, json => json.replace('{', `{"deep": ${'['.repeat(60)}${']'.repeat(60)},`)],
  ['a trailing comma', 'read', json => json.replace(/}\s*$/, ',}')],
  ['text after the value', 'read', json => `${json} x`],
  ['a byte-order mark', 'read', json => `\ufeff${json}`],
  ['a single-quoted string', 'read', json => json.replace('{', "{'q': 1,")],
];

/** Seam A's verdict on an overlay: 'duplicate', 'read', or null when its reader accepted it. */
function seamReader(t, json) {
  const r = runSeamA(stage(t, { 'claude/settings.overlay.json': json }));
  const rules = failRules(r.stdout);
  if (rules.includes('settings-duplicate')) return 'duplicate';
  if (rules.includes('settings-read')) return 'read';
  return null;
}

/** The cross script's verdict on a findings block: 'duplicate', 'read', or null when its reader accepted it. */
function crossReader(t, json) {
  const r = cross(t, { reports: { 'behaviour-lens': report(block('behaviour-lens', 'clear')), 'integrity-lens': report(json) } });
  if (r.rules.includes('duplicate')) return 'duplicate';
  if (r.rules.includes('json')) return 'read';
  return null;
}

test('parity fixtures are valid to start with: today\'s overlay passes seam A, and a clean block passes the cross script', t => {
  assert.equal(seamReader(t, realOverlay()), null);
  assert.equal(crossReader(t, JSON.stringify(block('integrity-lens', 'clear'))), null);
});

for (const [name, rule, defect] of READER) {
  test(`parity, the reader: ${name} is ${rule ? `refused as ${rule}` : 'read'} by both`, t => {
    assert.equal(seamReader(t, defect(realOverlay(), 'outputStyle')), rule, 'seam A');
    assert.equal(crossReader(t, defect(JSON.stringify(block('integrity-lens', 'clear')), 'verdict')), rule, 'cross script');
  });
}

// ------------------------------------------------------------ the character rules: same fixtures, both sides

// Code points, and the rule both sides apply. Tab is left out on purpose: the
// cross script refuses it by its own extra rule, while seam A allows it.
const CHARACTERS = [
  [0x0000, 'characters'],
  [0x0007, 'characters'],
  [0x000d, 'characters'],
  [0x007f, 'characters'],
  [0x0085, 'characters'],
  [0x009b, 'characters'],
  [0x2028, 'characters'],
  [0x2029, 'characters'],
  [0xfffe, 'characters'],
  [0x00ad, 'invisible'],
  [0x061c, 'invisible'],
  [0x200b, 'invisible'],
  [0x200d, 'invisible'],
  [0x202e, 'invisible'],
  [0x2066, 'invisible'],
  [0x2060, 'invisible'],
  [0xfeff, 'invisible'],
  [0xe0041, 'invisible'],
  [0x00e9, null],
  [0x00a0, null],
  [0x4e2d, null],
];

function seamCharacter(t, cp) {
  const r = runSeamA(stage(t, { 'claude/agents/parity-agent.md': agent(['name: parity-agent', 'description: A test agent.', 'tools: [Read, Glob, Grep]'], `Body ${String.fromCodePoint(cp)} here.\n`) }));
  const rules = failRules(r.stdout);
  if (rules.includes('characters')) return 'characters';
  if (rules.includes('invisible')) return 'invisible';
  assert.equal(r.code, 0, r.stdout);
  return null;
}

function crossCharacter(t, cp) {
  // JSON.stringify writes a control character as an escape, so the block stays
  // valid JSON and the character rule sees the decoded code point.
  const b = block('integrity-lens', 'findings', [finding('F1', 'C1', 'low', `Body ${String.fromCodePoint(cp)} here`)]);
  const r = cross(t, { reports: { 'behaviour-lens': report(block('behaviour-lens', 'clear')), 'integrity-lens': report(b) } });
  if (r.rules.length === 0) {
    assert.equal(r.code, 0, r.stdout);
    return null;
  }
  return r.rules[0];
}

for (const [cp, rule] of CHARACTERS) {
  const name = `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
  test(`parity, the characters: ${name} is ${rule ? `refused as ${rule}` : 'allowed'} by both`, t => {
    assert.equal(seamCharacter(t, cp), rule, 'seam A');
    assert.equal(crossCharacter(t, cp), rule, 'cross script');
  });
}
