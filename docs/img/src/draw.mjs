// Shared drawing helpers for the figure sources. Each returns plain element
// objects that docs/img/build.mjs turns into SVG. Text is never wrapped here:
// a source writes each line out, and the generator fails a line too wide for
// its box.
//
// Element kinds:
//   rect    { x, y, w, h, fill?, stroke?, sw?, dash? }
//   line    { x1, y1, x2, y2, stroke, sw?, dash? }
//   diamond { cx, cy, r, fill?, stroke?, sw? }
//   arrow   { x, y1, y2, stroke }            a downward arrow
//   grid    { w, h }                          the drafting grid, 24 px pitch
//   text    { x, y, size, lines, max, weight?, color?, track?, anchor?, lh? }
// Colours are token names from tokens.mjs. A text's y is the baseline of its
// first line, `max` the width its box gives it, and `track` its letter
// spacing in em.

export const W = 800;
export const PAD = 16; // the paper margin around the sheet
export const LEFT = 44; // the content's left edge, inside the sheet
export const RIGHT = W - 44;
export const CAPS = 0.16; // caps tracking, in em

/** The height of one line of text at `size`. */
export const lh = size => Math.round(size * 1.5);

/** A text block whose first line's box starts at `top`; returns the element and the block's height. */
export function block(o) {
  const step = o.lh ?? lh(o.size);
  const y = o.top + step / 2 + o.size * 0.35;
  const { top, ...rest } = o;
  return { el: { kind: 'text', ...rest, y, lh: step }, height: o.lines.length * step };
}

/** A small caps label: 11 px, tracked, in `color` (ink70 by default). */
export function label(o) {
  return block({ size: 11, weight: 600, track: CAPS, color: 'ink70', ...o, lines: o.lines.map(l => l.toUpperCase()) });
}

/** The paper, its grid and the sheet with its title bar. Returns the elements and the y the content starts at. */
export function sheet({ height, title, aside }) {
  const els = [
    { kind: 'grid', w: W, h: height },
    { kind: 'rect', x: PAD + 1, y: PAD + 1, w: W - 2 * PAD - 2, h: height - 2 * PAD - 2, fill: 'surface', stroke: 'ink', sw: 2 },
  ];
  const bar = PAD + 2;
  const barH = 40;
  els.push(block({ top: bar + 8, x: LEFT, size: 12, weight: 600, track: CAPS, lines: [title.toUpperCase()], max: 470 }).el);
  els.push(block({ top: bar + 8, x: RIGHT, anchor: 'end', size: 12, track: CAPS, color: 'ink70', lines: [aside.toUpperCase()], max: 220 }).el);
  els.push({ kind: 'line', x1: PAD + 2, y1: bar + barH, x2: W - PAD - 2, y2: bar + barH, stroke: 'ink30', sw: 1 });
  return { els, top: bar + barH };
}

/** A card with a caps label notched into its top border. */
export function notched({ x, y, w, h, text, stroke = 'ink30', sw = 1, dash, color = 'ink' }) {
  const t = text.toUpperCase();
  const chars = [...t].length;
  const gap = chars * 11 * (0.6 * 1.15 + CAPS) + 12; // the notch: the label's widest width (see build.mjs), plus 6 px a side
  return [
    { kind: 'rect', x, y, w, h, fill: 'paper', stroke, sw, dash },
    { kind: 'rect', x: x + 10, y: y - 3, w: gap, h: 6, fill: 'paper' },
    { kind: 'text', x: x + 16, y: y + 4, size: 11, weight: 600, track: CAPS, color, lines: [t], max: w - 32 },
  ];
}
