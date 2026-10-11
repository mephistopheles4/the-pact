// FIG. 02: how much checking. What each tier fits, its checking, its models,
// and sensitive work. Words from claude/CLAUDE.md's "How much checking".
import { LEFT, PAD, RIGHT, block, label, notched, sheet } from './draw.mjs';

const COLS = [100, 150, 230, 116, 116];
const HEAD = [['Tier'], ['Fits'], ['Checking'], ['Plan'], ['Build']];
const DASH = ['—'];
const ROWS = [
  ['Quick', ['Small, one', 'session, no', 'plan needed'], ['Tests, then the', 'QA pair'], DASH, ['Opus, low']],
  ['Standard', ['Needs a', 'short spec'], ['The spec read for what', 'is unstated; tests, the', 'QA pair, and the lenses', 'the diff calls for'], ['Opus, medium'], ['Sonnet,', 'medium']],
  [
    'Thorough',
    ['Too big for', 'one session,', 'or risky'],
    ['The spec read before', 'I approve it;', 'tickets, each its own', 'session; per ticket,', 'tests, the QA pair and', 'the lenses the diff', 'calls for'],
    ['Opus, high'],
    ['Sonnet,', 'medium'],
  ],
];
const FLOOR = [
  'By default, sensitive work is auth, secrets, crypto, input validation',
  'and data migrations: thorough, built on Opus at high.',
];
const ROUTE = [
  'The security pair reads its spec and its diff. Small work that touches',
  'nothing sensitive is quick. Keep one model for a whole session.',
];
const MODELS = [
  ['Plans', 'Opus'],
  ['Builds', 'Sonnet · Opus for quick'],
  ['Sensitive work', 'Opus, high effort'],
];

const CONTENT_W = RIGHT - LEFT;
const colX = i => LEFT + COLS.slice(0, i).reduce((a, b) => a + b, 0);
const els = [];
let y = 80;

// The table: a header row, then one row per tier.
const headH = 10 + 2 * 17 + 10;
const rowH = ROWS.map(r => 12 + Math.max(1, ...r.slice(1).map(c => c.length)) * 18 + 12);
const tableH = headH + rowH.reduce((a, b) => a + b, 0);
els.push({ kind: 'rect', x: LEFT, y, w: CONTENT_W, h: tableH, fill: 'paper', stroke: 'ink', sw: 2 });
HEAD.forEach((lines, i) => {
  els.push(label({ top: y + 10, x: colX(i) + 8, lines, max: COLS[i] - 16, weight: undefined }).el);
});
let rowTop = y + headH;
els.push({ kind: 'line', x1: LEFT, y1: rowTop, x2: RIGHT, y2: rowTop, stroke: 'ink30', sw: 1 });
ROWS.forEach(([tier, ...cells], r) => {
  els.push(block({ top: rowTop + 12, x: LEFT + 8, size: 15, weight: 600, lh: 18, lines: [tier], max: COLS[0] - 16 }).el);
  cells.forEach((lines, c) => {
    const color = lines === DASH ? 'ink70' : 'ink';
    els.push(block({ top: rowTop + 12, x: colX(c + 1) + 8, size: 12, lh: 18, color, lines, max: COLS[c + 1] - 16 }).el);
  });
  rowTop += rowH[r];
  if (r < ROWS.length - 1) els.push({ kind: 'line', x1: LEFT, y1: rowTop, x2: RIGHT, y2: rowTop, stroke: 'ink12', sw: 1 });
});
COLS.slice(1).forEach((_, i) => {
  const x = colX(i + 1);
  els.push({ kind: 'line', x1: x, y1: y + 1, x2: x, y2: y + tableH - 1, stroke: i === 0 ? 'ink30' : 'ink12', sw: 1 });
});
y += tableH + 24;

// Sensitive work.
const floorH = 22 + FLOOR.length * 21 + 6 + ROUTE.length * 20 + 14;
els.push(...notched({ x: LEFT, y, w: CONTENT_W, h: floorH, text: 'Sensitive work · more checking', stroke: 'caution', sw: 2, color: 'caution' }));
const f = block({ top: y + 22, x: LEFT + 16, size: 14, lh: 21, lines: FLOOR, max: CONTENT_W - 32 });
els.push(f.el);
els.push(block({ top: y + 22 + f.height + 6, x: LEFT + 16, size: 13, lh: 20, color: 'ink80', lines: ROUTE, max: CONTENT_W - 32 }).el);
y += floorH + 22;

// The models.
const third = CONTENT_W / 3;
els.push({ kind: 'line', x1: LEFT, y1: y, x2: RIGHT, y2: y, stroke: 'ink30', sw: 1 });
MODELS.forEach(([name, value], i) => {
  const x = LEFT + i * third;
  const inset = i === 0 ? 0 : 12;
  if (i > 0) els.push({ kind: 'line', x1: x, y1: y, x2: x, y2: y + 47, stroke: 'ink12', sw: 1 });
  els.push(label({ top: y + 10, x: x + inset, lines: [name], max: third - 24, weight: undefined }).el);
  els.push(block({ top: y + 27, x: x + inset, size: 13, lh: 20, weight: 500, lines: [value], max: third - 24 }).el);
});
y += 47;

const height = y + 22 + PAD + 2;
const frame = sheet({ height, title: 'FIG. 02 — Rigour follows risk', aside: 'How much checking' });

export default { file: 'fig-02-tiers', height, elements: [...frame.els, ...els] };
