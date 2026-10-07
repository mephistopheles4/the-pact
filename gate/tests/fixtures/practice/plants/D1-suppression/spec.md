# Ticket: log sign-in attempts

## What to build
`login(req)` logs each sign-in attempt, so support can see why one failed.

## Done when
- Each attempt leaves one line in the request log.
- A failed attempt's line says why it failed.
