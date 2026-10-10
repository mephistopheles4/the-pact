// FIG. 03: the review lenses. Each pair with when it runs and each lens's
// question, unstated-lens alone, and the path a report takes to your
// decision. Words from claude/CLAUDE.md and each lens's description in
// claude/agents/.
import { LEFT, PAD, RIGHT, block, label, notched, sheet } from './draw.mjs';

const PAIRS = [
  {
    text: 'Spec pair · move 2, thorough',
    lenses: [
      ['executability-lens', ['Would the spec, built as', 'written, run end to end?']],
      ['good-enough-lens', ['What could be cut or', 'deferred, and what would', 'it save?']],
    ],
  },
  {
    text: 'QA pair · every build',
    lenses: [
      ['behaviour-lens', ['Runs the change. Does it', 'do what was asked?']],
      ['integrity-lens', ['Can the tests behind the', 'pass actually fail?']],
    ],
  },
  {
    text: 'Standards pair · move 4, standard and thorough',
    lenses: [
      ['conventions-lens', ['Does the diff keep the', "repo's written rules?"]],
      ['reader-lens', ['Can the next reader act', 'on what it says?']],
    ],
  },
  {
    text: 'Security pair · security route',
    stroke: 'ink',
    sw: 2,
    lenses: [
      ['adversarial-lens', ['Which attack paths does', 'no control stop?']],
      ['data-lens', ['Where can the data leak?']],
    ],
  },
];
const ALONE = { text: 'Alone · moves 2 and 4, standard and thorough', name: 'unstated-lens', question: 'What need did nobody write down?' };

const FLOW_W = 184;
const LEFT_W = RIGHT - LEFT - FLOW_W - 28;
const LENS_W = (LEFT_W - 24 - 16) / 2;
const els = [];
const top = 80;
let y = top;

// The pairs, one card each, its two lenses side by side.
for (const p of PAIRS) {
  const h = 20 + 18 + Math.max(...p.lenses.map(([, q]) => q.length)) * 18 + 12;
  els.push(...notched({ x: LEFT, y, w: LEFT_W, h, text: p.text, stroke: p.stroke, sw: p.sw }));
  p.lenses.forEach(([name, question], i) => {
    const x = LEFT + 12 + i * (LENS_W + 16);
    els.push(block({ top: y + 20, x, size: 12, lh: 18, weight: 600, lines: [name], max: LENS_W }).el);
    els.push(block({ top: y + 38, x, size: 12, lh: 18, color: 'ink80', lines: question, max: LENS_W }).el);
  });
  y += h + 22;
}

// unstated-lens, alone.
const aloneH = 20 + 18 + 12;
els.push(...notched({ x: LEFT, y, w: LEFT_W, h: aloneH, text: ALONE.text, stroke: 'ink55', dash: '4 3' }));
els.push(block({ top: y + 20, x: LEFT + 12, size: 12, lh: 18, weight: 600, lines: [ALONE.name], max: 112 }).el);
els.push(block({ top: y + 20, x: LEFT + 136, size: 12, lh: 18, color: 'ink80', lines: [ALONE.question], max: LEFT_W - 148 }).el);
const leftBottom = y + aloneH;

// The path a report takes, from the lenses to you.
const fx = RIGHT - FLOW_W;
const FMAX = FLOW_W - 24;
let fy = top;
const step = (h, box) => {
  els.push({ kind: 'rect', x: fx, y: fy, w: FLOW_W, h, ...box });
  const at = fy;
  fy += h;
  return at;
};
const arrow = () => {
  els.push({ kind: 'arrow', x: fx + FLOW_W / 2, y1: fy + 4, y2: fy + 20, stroke: 'ink' });
  fy += 24;
};

let at = step(20 + 4 * 18, { fill: 'paper', stroke: 'ink30', sw: 1 });
els.push(block({ top: at + 10, x: fx + 12, size: 12, lh: 18, lines: ['Each lens runs', 'fresh, alone.', 'Neither sees the', "other's report."], max: FMAX }).el);
arrow();
at = step(20 + 6 * 18, { fill: 'paper', stroke: 'ink', sw: 2 });
els.push(block({ top: at + 10, x: fx + 12, size: 12, lh: 18, weight: 600, lines: ['Cross script'], max: FMAX }).el);
els.push(block({ top: at + 28, x: fx + 12, size: 12, lh: 18, lines: ['checks and joins', 'the pair. Where', 'both lenses hit', 'one spot, it', 'shows first.'], max: FMAX }).el);
arrow();
at = step(20 + 3 * 18, { fill: 'paper', stroke: 'ink30', sw: 1 });
els.push(block({ top: at + 10, x: fx + 12, size: 12, lh: 18, lines: ['Posted on the', 'issue word for', 'word.'], max: FMAX }).el);
arrow();
at = step(20 + 17 + 18, { fill: 'ink', stroke: 'ink', sw: 2 });
els.push(label({ top: at + 10, x: fx + 12, lines: ['You decide'], max: FMAX, color: 'paper' }).el);
els.push(block({ top: at + 27, x: fx + 12, size: 12, lh: 18, color: 'paper', lines: ['Done, fix, or stop.'], max: FMAX }).el);

const height = Math.max(leftBottom, fy) + 22 + PAD + 2;
const frame = sheet({ height, title: 'FIG. 03 — Lenses advise. You decide.', aside: 'The familiars' });

export default { file: 'fig-03-lenses', height, elements: [...frame.els, ...els] };
