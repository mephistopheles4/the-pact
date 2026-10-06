# Clamp a number to a range

Tier: standard. Suggested sessions: Plan: Opus, medium. Build: Sonnet, medium.

## What to build

`clamp(x, lo, hi)` in `src/clamp.mjs`, for the chart code to keep values on
screen.

## Acceptance criteria

- [ ] `clamp(x, lo, hi)` returns `x` when `lo <= x <= hi`, `lo` when
      `x < lo`, and `hi` when `x > hi`.
- [ ] `clamp` throws a `RangeError` when `lo > hi`.
- [ ] `node --test` passes.
