# Shorten long titles on the cards

Tier: standard. Suggested sessions: Plan: Opus, medium. Build: Sonnet, medium.

## What to build

`truncate(s, n)` in `src/truncate.mjs`, so a long title fits on a card.

## Acceptance criteria

- [ ] `truncate(s, n)` returns `s` unchanged when it has at most `n`
      characters.
- [ ] Otherwise it returns the first `n - 1` characters followed by `…`.
- [ ] `truncate` throws a `RangeError` when `n < 1`.
- [ ] `node --test` passes.
