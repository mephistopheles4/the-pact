# Exit 2 prints a NEXT line for each rule it refused

PACT-52, standard tier. It amends the "What stays" bullet of [0082](0082-the-poster-prints-the-steps-after-a-result-that-may-be-public.md), which said exits 0, 2 and 4 print no `NEXT:` line.

## Decision

A refusal (exit 2) in the poster prints one fixed `NEXT:` line for each rule it refused, above its `RESULT:` line and after any `NOTE:` line, saying what to do instead. The cleaner does the same for its usage rules. The poster's `owner/` and `as/` rules have none: their `where` already names the login or the repo to fix. A missing `--post` beside an unknown option gets the one old-command line, not two. Exits 0 and 4 still print none.

## Why

- **A refusal that names only a rule leaves the session to find the page.** The poster's reference page is not installed in other projects, so the tool's output is the one place that session is sure to read. Command-line practice says an error should say what to do next.
- **Fixed words keep the 0082 limit.** Each line is a constant keyed by rule. It holds no text from the body, a title, a path or an argument, so a refusal still prints nothing a session could not see before it sent.

## What stays

- The `RESULT:` line is last and unchanged. The poster still never retries.
- `gate/tests/poster-next.test.mjs` holds a case for each rule and compares the cases with the rule table in `docs/poster.md` and the rules named in the code.

## What was weighed

- **Leaving exit 2 as it was.** Not taken: PACT-48 had already added lines for the edit, scan and intent rules, so the rest read as an omission.
- **A `NEXT:` line for the `owner/` and `as/` rules.** Not taken: it would repeat what their `where` says.
