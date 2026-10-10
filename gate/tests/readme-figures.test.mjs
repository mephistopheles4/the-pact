// The README's figures (#202): docs/img/build.mjs renders each figure's
// source in docs/img/src/ to a light and a dark SVG. These tests fail when a
// committed SVG is stale, when the README points at an image that isn't
// there, and when a figure's text line would overflow its box. They don't
// check the figures' words against the rules: AGENTS.md's "Keep the README in
// step with the rules" does that (owner decision on #202).
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { FILES, renderFigure, render } from '../../docs/img/build.mjs';
import { REPO } from './text.mjs';

const FIX = 'node docs/img/build.mjs';
const SIX = [
  'fig-01-moves.svg',
  'fig-01-moves-dark.svg',
  'fig-02-tiers.svg',
  'fig-02-tiers-dark.svg',
  'fig-03-lenses.svg',
  'fig-03-lenses-dark.svg',
];

test('render() returns exactly the six figure files', () => {
  assert.deepEqual(Object.keys(render()).sort(), [...SIX].sort());
  assert.deepEqual([...FILES].sort(), [...SIX].sort());
});

test('every committed figure matches its source', () => {
  for (const [name, svg] of Object.entries(render())) {
    const path = join(REPO, 'docs', 'img', name);
    assert.ok(existsSync(path), `docs/img/${name} is missing: run ${FIX}`);
    assert.equal(readFileSync(path, 'utf8'), svg, `docs/img/${name} is stale: run ${FIX}`);
  }
});

test('render() is the same on every call', () => {
  assert.deepEqual(render(), render());
});

test('each figure is a self-contained SVG: no style sheet, script, foreign object or outside link', () => {
  for (const [name, svg] of Object.entries(render())) {
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="800" height="\d+" viewBox="0 0 800 \d+"/, name);
    assert.ok(svg.endsWith('</svg>\n'), `${name} doesn't end with </svg> and a newline`);
    assert.doesNotMatch(svg, /<style|<script|<foreignObject|<image|href=|url\((?!#)|@import|\r/i, name);
    const outside = svg.replace('xmlns="http://www.w3.org/2000/svg"', '');
    assert.doesNotMatch(outside, /https?:/, `${name} names an outside address`);
  }
});

test('each light figure paints its own paper, and each dark one its own dark paper', () => {
  for (const [name, svg] of Object.entries(render())) {
    const paper = name.endsWith('-dark.svg') ? '#1a1614' : '#fafaf7';
    assert.match(svg, new RegExp(`^<svg[^>]*>\\n<rect width="800" height="\\d+" fill="${paper}"/>`), `${name} paints no paper first`);
  }
});

test('a text line too wide for its box fails the render, naming the figure and the line', () => {
  const fig = {
    file: 'fig-test',
    height: 100,
    elements: [{ kind: 'text', x: 0, y: 20, size: 12, lines: ['short', 'a line that is far too long for its box'], max: 100 }],
  };
  assert.throws(() => renderFigure(fig, 'light'), /fig-test: "a line that is far too long for its box" .*too wide/);
  const tracked = { ...fig, elements: [{ kind: 'text', x: 0, y: 20, size: 11, track: 0.16, lines: ['TEN CHARS!'], max: 85 }] };
  assert.throws(() => renderFigure(tracked, 'light'), /too wide/, 'letter spacing is not counted');
  const fits = { ...fig, elements: [{ kind: 'text', x: 0, y: 20, size: 12, lines: ['ten chars!'], max: 100 }] };
  assert.doesNotThrow(() => renderFigure(fits, 'light'));
});

test('every image the README shows exists, and each figure has its dark source', () => {
  const readme = readFileSync(join(REPO, 'README.md'), 'utf8');
  const refs = [...readme.matchAll(/\b(?:src|srcset)="([^"]+)"/g)].map(m => m[1]);
  assert.ok(refs.length > 0, 'the README shows no images');
  for (const ref of refs) {
    assert.doesNotMatch(ref, /^[a-z]+:|^\//i, `${ref} is not a path in the repo`);
    assert.ok(existsSync(join(REPO, ...ref.split('/'))), `the README shows ${ref}, which doesn't exist`);
  }
  for (const name of SIX.filter(n => !n.endsWith('-dark.svg'))) {
    const dark = name.replace('.svg', '-dark.svg');
    assert.ok(refs.includes(`docs/img/${name}`), `the README doesn't show docs/img/${name}`);
    assert.ok(refs.includes(`docs/img/${dark}`), `the README has no dark source for docs/img/${name}`);
  }
});
