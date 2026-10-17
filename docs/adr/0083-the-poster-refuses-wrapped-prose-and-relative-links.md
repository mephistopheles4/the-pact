# The poster refuses wrapped prose and relative links instead of rewriting them

With the poster on, its pre-post checks refuse a body with a hard-wrapped paragraph, list item or quote (`text/hard-wrap`) and a body with a link whose target has no scheme and is not an anchor (`link/relative`). The poster never rewrites a body (#317). The rules file's poster part widens one sentence to "a table, wrap or link refusal".

## Why

- **GitHub shows every single line break** in an issue body, a pull request body and a comment, so prose wrapped at a column limit lands as a ragged column. A relative link is left as written and resolves under `/issues/`, giving a 404. In both cases the read-back says `verified`, because the bytes arrived.
- **A rewrite would post text the session never wrote.** The owner's other repository retired a poster that reflowed paragraphs and fixed links before posting. Refusing keeps what lands equal to what the session wrote and checked (ADR 0076's rule for tables: fix the text, never dodge the check).

## What the rules are

- A line trips `text/hard-wrap` when it continues a block whose previous line stops mid-sentence: no `.`, `!`, `?`, `:` or `;` at its end (closing marks allowed after), no link at its end, no deliberate break (two trailing spaces, a backslash), and not starting with a bold label. A wrapped line that happens to end with a full stop gets through: the cheaper side to reverse, since a later change can tighten the rule.
- `link/relative` refuses an inline link, image, reference definition or HTML `href`/`src` whose target does not start with a scheme, `//` or `#`. A root link is refused too.
- Fences and HTML comments are never read, and the link check skips code spans too, so a fenced lens report passes; a refusal on a line inside a lens report means its fence is too short, as for tables. Each rule is reported once, at its first hit.
- The fence for these checks is looser than the table check's (any indent, no backtick exception): a fence-like line mostly means fewer refusals (a closing fence at any indent can end a fence that GitHub keeps open, which the rules file's "fix the fence" answers).

## What stays

- Nothing is rewritten, retried or relaxed. A throw inside the checks ends the run as `RESULT: unavailable` with nothing sent. A body that uses a setext heading may be refused; the session writes `#` instead.
- **Known limits, left as specified.** A paragraph line directly followed by a `>` quote line is read as one block and may be refused. A table with no leading `|` is refused as a wrap. A paragraph indented four spaces inside a list item, after a blank line, is read as code, so a wrap or relative link there is not refused. Each is rare, and none touches the pact's own shapes; a later change can tighten or loosen them.
