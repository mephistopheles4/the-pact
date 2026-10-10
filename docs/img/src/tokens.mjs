// The figures' colours, light and dark, copied from the Aviation design
// system, deck theme and dark layer. Each token is a hex colour and an
// opacity, so an SVG viewer that knows only SVG 1.1 colours draws it right.
// A source names a token; the generator looks it up for the scheme it renders.

const LIGHT_INK = '#22262b';
const DARK_INK = '#ece5df';

export const TOKENS = Object.freeze({
  light: Object.freeze({
    paper: ['#fafaf7', 1],
    surface: ['#fafaf7', 0.72],
    ink: [LIGHT_INK, 1],
    ink80: [LIGHT_INK, 0.8],
    ink70: [LIGHT_INK, 0.7],
    ink55: [LIGHT_INK, 0.55],
    ink30: [LIGHT_INK, 0.3],
    ink12: [LIGHT_INK, 0.12],
    grid: [LIGHT_INK, 0.05],
    caution: ['#b45309', 1],
  }),
  dark: Object.freeze({
    paper: ['#1a1614', 1],
    surface: ['#201b18', 0.72],
    ink: [DARK_INK, 1],
    ink80: [DARK_INK, 0.8],
    ink70: [DARK_INK, 0.7],
    ink55: [DARK_INK, 0.55],
    ink30: [DARK_INK, 0.28],
    ink12: [DARK_INK, 0.11],
    grid: [DARK_INK, 0.045],
    caution: ['#d98a3c', 1],
  }),
});
