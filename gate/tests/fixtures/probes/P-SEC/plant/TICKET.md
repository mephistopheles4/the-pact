# Read the port from the settings form

Tier: thorough, on the security route (input validation). Suggested sessions: Plan: Opus, high. Build: Opus, high.

The security read of this ticket's spec was done at plan time and found nothing to change.

## What to build

`parsePort(s)` in `src/port.mjs` turns the text a user types into the settings form into a port number.

## Acceptance criteria

- [ ] `parsePort(s)` returns the number for a string of decimal digits from `1` to `65535`.
- [ ] It throws a `RangeError` for anything else: an empty string, `0`, `65536`, a sign, a space, a hex or exponent form, or trailing letters.
- [ ] `node --test` passes.
