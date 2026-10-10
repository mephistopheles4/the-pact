#!/usr/bin/env node
// Renders the README's figures (#202) from their sources in src/, each as a
// light and a dark SVG.
//
//   node docs/img/build.mjs     write the six SVGs into docs/img/
//
// render() returns a map from file name to SVG text and touches no file.
// Importing this module starts no process and writes nothing. Run as a
// script, it writes that map into its own folder, wherever it is run from,
// and writes nothing else. gate/tests/readme-figures.test.mjs fails while a
// committed SVG differs from render()'s output.
//
// Text stays text, in one monospace stack, with no font embedded. A line is
// measured at 0.6 em a character plus 15% slack, for the widest face in the
// stack, plus its letter spacing; a line wider than its box fails the render.
//
// Node 20 or later, ESM, node: built-ins only.
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import lenses from './src/fig-03-lenses.mjs';
import moves from './src/fig-01-moves.mjs';
import tiers from './src/fig-02-tiers.mjs';
import { TOKENS } from './src/tokens.mjs';
import { W } from './src/draw.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIGURES = [moves, tiers, lenses];
const FONT = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const EM = 0.6 * 1.15;

export const FILES = Object.freeze(FIGURES.flatMap(f => [`${f.file}.svg`, `${f.file}-dark.svg`]));

const num = v => String(Math.round(v * 100) / 100);
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The widest a line of text can set: `size` px, tracked by `track` em. */
export function measure(line, size, track = 0) {
  const n = [...line].length;
  return n * size * (EM + track);
}

function paint(attr, name, t) {
  if (!name) return attr === 'fill' ? ' fill="none"' : '';
  const token = t[name];
  if (!token) throw new Error(`unknown colour token: ${name}`);
  const [hex, alpha] = token;
  return ` ${attr}="${hex}"${alpha < 1 ? ` ${attr}-opacity="${alpha}"` : ''}`;
}

function stroke(e, t) {
  if (!e.stroke) return '';
  return `${paint('stroke', e.stroke, t)} stroke-width="${num(e.sw ?? 1)}"${e.dash ? ` stroke-dasharray="${e.dash}"` : ''}`;
}

function element(e, t, file) {
  switch (e.kind) {
    case 'rect':
      return [`<rect x="${num(e.x)}" y="${num(e.y)}" width="${num(e.w)}" height="${num(e.h)}"${paint('fill', e.fill, t)}${stroke(e, t)}/>`];
    case 'line':
      return [`<line x1="${num(e.x1)}" y1="${num(e.y1)}" x2="${num(e.x2)}" y2="${num(e.y2)}"${stroke(e, t)}/>`];
    case 'diamond': {
      const { cx, cy, r } = e;
      const d = `M${num(cx)} ${num(cy - r)}L${num(cx + r)} ${num(cy)}L${num(cx)} ${num(cy + r)}L${num(cx - r)} ${num(cy)}Z`;
      return [`<path d="${d}"${paint('fill', e.fill, t)}${stroke(e, t)}/>`];
    }
    case 'arrow': {
      const { x, y1, y2 } = e;
      return [
        `<line x1="${num(x)}" y1="${num(y1)}" x2="${num(x)}" y2="${num(y2 - 5)}"${stroke({ stroke: e.stroke, sw: 1.5 }, t)}/>`,
        `<path d="M${num(x - 4)} ${num(y2 - 6)}L${num(x + 4)} ${num(y2 - 6)}L${num(x)} ${num(y2)}Z"${paint('fill', e.stroke, t)}/>`,
      ];
    }
    case 'grid':
      return [
        '<defs><pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">' +
          `<path d="M24 0H0V24" fill="none"${paint('stroke', 'grid', t)} stroke-width="1"/></pattern></defs>`,
        `<rect width="${num(e.w)}" height="${num(e.h)}" fill="url(#grid)"/>`,
      ];
    case 'text': {
      const out = [];
      const step = e.lh ?? Math.round(e.size * 1.5);
      e.lines.forEach((line, i) => {
        const width = measure(line, e.size, e.track ?? 0);
        if (!(width <= e.max)) throw new Error(`${file}: "${line}" is ${num(width)} px at its widest, too wide for its ${num(e.max)} px box`);
        const attrs =
          ` x="${num(e.x)}" y="${num(e.y + i * step)}" font-size="${num(e.size)}"` +
          (e.weight ? ` font-weight="${e.weight}"` : '') +
          (e.track ? ` letter-spacing="${num(e.track * e.size)}"` : '') +
          (e.anchor ? ` text-anchor="${e.anchor}"` : '') +
          paint('fill', e.color ?? 'ink', t);
        out.push(`<text${attrs}>${esc(line)}</text>`);
      });
      return out;
    }
    default:
      throw new Error(`${file}: unknown element kind: ${e.kind}`);
  }
}

/** One figure's SVG in `scheme` ('light' or 'dark'). */
export function renderFigure(fig, scheme) {
  const t = TOKENS[scheme];
  const lines = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${fig.height}" viewBox="0 0 ${W} ${fig.height}" font-family="${esc(FONT)}" role="img">`,
    `<rect width="${W}" height="${fig.height}"${paint('fill', 'paper', t)}/>`,
  ];
  for (const e of fig.elements) lines.push(...element(e, t, fig.file));
  lines.push('</svg>');
  return `${lines.join('\n')}\n`;
}

/** Every figure in both schemes: a map from file name to SVG text. */
export function render() {
  const out = {};
  for (const fig of FIGURES) {
    out[`${fig.file}.svg`] = renderFigure(fig, 'light');
    out[`${fig.file}-dark.svg`] = renderFigure(fig, 'dark');
  }
  return out;
}

const run = process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (run) {
  for (const [name, svg] of Object.entries(render())) {
    writeFileSync(join(HERE, name), svg);
    console.log(`wrote docs/img/${name}`);
  }
}
