// FIG. 01: the four moves. What you do at each move, what the agent does,
// and that you decide at every seam. Words from claude/CLAUDE.md's four moves.
import { LEFT, PAD, RIGHT, block, label, sheet } from './draw.mjs';

const YOU = [
  { move: 'Move 1', title: ['Sense the work'], body: ['Triage it: what', 'kind, which', 'tier, is it', 'ready.'] },
  { move: 'Move 2', title: ['Think before', 'doing'], body: ['Settle the', 'intent.', 'Proceed, fix or', 'kill.'] },
  { move: 'Move 3', title: ['Checkpoint', 'the seams'], body: ['Cut the', 'tickets. Start', 'and watch each', 'build.'] },
  { move: 'Move 4', title: ['Stay the owner'], body: ['Decide whether', 'it is done.'] },
];
const AGENT = [
  ['Proposes the', 'tier. Never', 'skips triage.'],
  ['Grills you,', 'then writes', 'the spec.'],
  ['Builds', 'test-first at', 'the agreed', 'seams.'],
  ['Runs the', 'checks and', 'lenses. Brings', 'a verdict.'],
];

const CW = 157; // card width
const GAP = 28;
const colX = i => LEFT + i * (CW + GAP);

const els = [];
let y = 80;

els.push(label({ top: y, x: LEFT, lines: ['You — architect of intent'], max: 400 }).el);
y += 27;

// Your cards: the move, its name, what you do.
const cardTop = y;
const cardH = 12 + 17 + 6 + 2 * 18 + 6 + 4 * 20 + 12;
YOU.forEach((c, i) => {
  const x = colX(i);
  els.push({ kind: 'rect', x, y: cardTop, w: CW, h: cardH, fill: 'paper', stroke: 'ink', sw: 2 });
  let top = cardTop + 12;
  const m = label({ top, x: x + 10, lines: [c.move], max: CW - 20, weight: undefined });
  els.push(m.el);
  top += m.height + 6;
  const t = block({ top, x: x + 10, size: 14, weight: 600, lh: 18, lines: c.title, max: CW - 20 });
  els.push(t.el);
  top += t.height + 6;
  els.push(block({ top, x: x + 10, size: 13, lh: 20, color: 'ink80', lines: c.body, max: CW - 20 }).el);
  if (i < YOU.length - 1) {
    els.push({ kind: 'diamond', cx: x + CW + GAP / 2, cy: cardTop + cardH / 2, r: 8.5, fill: 'paper', stroke: 'ink', sw: 1.5 });
  }
});
y = cardTop + cardH;

// The seams between you and the agent.
YOU.forEach((_, i) => {
  const cx = colX(i) + CW / 2;
  els.push({ kind: 'line', x1: cx, y1: y, x2: cx, y2: y + 28, stroke: 'ink55', sw: 1.5, dash: '4 3' });
});
y += 34;

els.push(label({ top: y, x: LEFT, lines: ['Agent — executor'], max: 400 }).el);
y += 27;

// The agent's boxes.
const agentH = 12 + 4 * 20 + 12;
AGENT.forEach((lines, i) => {
  const x = colX(i);
  els.push({ kind: 'rect', x, y, w: CW, h: agentH, stroke: 'ink30', sw: 1 });
  els.push(block({ top: y + 12, x: x + 12, size: 13, lh: 20, color: 'ink80', lines, max: CW - 24 }).el);
});
y += agentH + 26;

// You decide at every seam: a bracket across all four moves.
const DECIDE = 'You decide at every seam'.toUpperCase();
els.push({ kind: 'line', x1: LEFT, y1: y - 7, x2: LEFT, y2: y + 7, stroke: 'ink', sw: 1.5 });
// The text is centred, so it stays centred in any face; a diamond closes each
// line where the text's widest box ends.
const MID = (LEFT + RIGHT) / 2;
const HALF = 120;
els.push({ kind: 'line', x1: LEFT, y1: y, x2: MID - HALF - 6, y2: y, stroke: 'ink', sw: 1.5 });
els.push({ kind: 'diamond', cx: MID - HALF, cy: y, r: 5, fill: 'paper', stroke: 'ink', sw: 1.5 });
els.push({ kind: 'text', x: MID, y: y + 4, anchor: 'middle', size: 11, weight: 600, track: 0.16, lines: [DECIDE], max: 2 * HALF - 12 });
els.push({ kind: 'diamond', cx: MID + HALF, cy: y, r: 5, fill: 'paper', stroke: 'ink', sw: 1.5 });
els.push({ kind: 'line', x1: MID + HALF + 6, y1: y, x2: RIGHT, y2: y, stroke: 'ink', sw: 1.5 });
els.push({ kind: 'line', x1: RIGHT, y1: y - 7, x2: RIGHT, y2: y + 7, stroke: 'ink', sw: 1.5 });

const height = y + 7 + 20 + PAD + 2;
const frame = sheet({ height, title: 'FIG. 01 — Four moves, one owner', aside: 'Move 1 → 4' });

export default { file: 'fig-01-moves', height, elements: [...frame.els, ...els] };
