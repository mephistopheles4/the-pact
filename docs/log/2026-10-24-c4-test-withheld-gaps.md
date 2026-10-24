# The C4 test closes four withheld-check gaps

**2026-10-24.** #336's last Test round found four broken versions of the poster's withheld checks that the C4 test let pass; the code already caught each one. Tier: quick, test only; the code is unchanged.

## What was built (#342)

- **The C4 test** (`gate/tests/poster-table.test.mjs`) gains five cases: curly quotes and `~~` before the word, and a bare withheld cell with two spaces after the comma, each refused as `table/state`; two different format characters inside the word, refused as `table/state`; and a withheld row with a `skipped, because …` Disposition, refused as `table/disposition`.
- **Seen to catch:** four mutants of `claude/tools/poster.mjs` (an ASCII-only leading strip, removal of the first soft hyphen only, the withheld Disposition check under the skipped guard, and a spacing-tidying exemption) each pass the old test and fail the new one.

## Left out

- Integrity-lens's two lows (F5, F6) and behaviour-lens F1's code change (running `withheldAfter` on the poster's `normalise` view) stay open on the issue for the owner.

## Record

- [The issue](https://github.com/mephistopheles4/the-pact/issues/342).
