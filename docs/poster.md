# The poster

The poster posts free text to GitHub as your `gh` account, then reads back
what landed and checks it against what it sent. It is a pact tool, off unless
the `tools` list in `~/.claude/pact/config.json` names it (ADR 0074). When it's
on, the install puts it at `~/.claude/pact/tools/poster.mjs`, and the rules
file tells a session to post through it. Its scans are a backstop for
accidents, not a guard: the review procedure's read before posting still comes
first, on every install, with or without the poster (threat model, R3, R13 and
R29). It needs Node 24 or later and `gh`, signed in.

Permission rules on `gh` commands don't see the poster's calls, because the
poster starts `gh` itself; to gate posting, put a rule on the poster's own
command. In auto mode, Claude Code's classifier does see the call, and may
stop a post until the owner allows it.

In this page, "a session" is the Claude Code session running the poster, and
"the owner" is the person whose `gh` account it posts as.

## Running it

Each shell gets its own command form, as the rules file gives them:

- **A POSIX shell** (Git Bash, Linux, macOS):
  `node ~/.claude/pact/tools/poster.mjs <surface> [options]`
- **PowerShell:** `node "$HOME/.claude/pact/tools/poster.mjs" <surface> [options]`

Run it from a scratch folder outside the repo: a new, empty folder the session
made for its posts, never a repo, the temp folder's root or a folder other
programs write to. A form typed in the other shell either runs the installed
poster from the home folder, or fails with Node's missing-module error and
posts nothing. Windows PowerShell 5.1, like PowerShell 7.4 and 7.5 without an experimental
feature, passes the
`~` on as it is, so the POSIX form looks under the scratch folder and finds
nothing there; PowerShell 7.6 and Git Bash expand the other shell's form to
the home folder. A file planted in a repo can't run either way, because the
poster runs from the scratch folder, never from the repo. A repo you have
trusted can still change the environment either form resolves through; that
sits behind Claude Code's workspace trust, as a repo's hooks do (threat
model, R14).

Every piece of free text comes from a file, so no prose reaches a command
line. Write the body and any title to files in the scratch folder. As the
rules file says, delete a file once its post ends, whatever the result
(verified, failed, unverified, mismatch or unavailable), or once you drop it.
Keep a file holding a lens report that the poster refused until the owner has
answered, then delete it. Before the session ends, delete every such file
still there, whatever the owner's answer.

**When a session dies, its files stay.** Nothing deletes a file the session
didn't. A lens report kept after a refusal for a secret, a personal detail, a
session id or hidden characters is an ordinary, unencrypted file
in that session's scratch folder, which the session named to the owner in chat
when it kept the report. If the session is killed before it cleans up, delete
that file by hand. The report may also stay in the session's saved
transcript; for a secret, rotating it is the fix, as for posted text.

## Surfaces

| Surface | What it makes | Its own options |
| --- | --- | --- |
| `issue` | An issue, with any labels | `--title-file`, and `--label` once per label |
| `pull-request` | A pull request from a branch in the same repo | `--title-file`, `--head`, `--base`, and `--draft` |
| `issue-comment` | A comment on an issue or a pull request's conversation | `--issue` |
| `pull-request-review` | A review that only comments, never approving or asking for changes, with a body and no line comments | `--pr` |
| `review-thread-reply` | A reply in an existing line-comment thread on a pull request | `--pr` and `--comment`, the id of the thread's review comment |

`issue` has no `--parent` option. A session that needs a sub-issue link asks
the owner to set it on GitHub.

The documented command line for each, as the poster's own `EXAMPLES` hold
them:

```text
node poster.mjs issue --repo you/your-repo --title-file title.txt --body body.md --label bug
node poster.mjs pull-request --repo you/your-repo --title-file title.txt --body body.md --head my-branch --base main --draft
node poster.mjs issue-comment --repo you/your-repo --body comment.md --issue 12 --as you
node poster.mjs pull-request-review --repo you/your-repo --body review.md --pr 34
node poster.mjs review-thread-reply --repo you/your-repo --body reply.md --pr 34 --comment 5678
```

## Options

Every surface takes `--repo` and `--body`, and may take `--as` and
`--dry-run`. An option's value is checked against a pattern. Of the options,
only `--label`'s values are also scanned, with the title and the body.

| Option | Value | Checked by |
| --- | --- | --- |
| `--repo` | `owner/name`; the owner must be the `gh` login, by name and by what GitHub returns for the repo | `input/repo`, `owner/repo`, `owner/github` |
| `--body` | A file: a regular file, not a link, at most 256 KiB, valid UTF-8 with no byte-order mark, not empty; the body at most 65,536 characters | the `file/` rules, `text/body-length` |
| `--as` | A login the `gh` login must equal; needed when `GH_TOKEN` or `GITHUB_TOKEN` is set | `input/login`, `as/differs`, `as/missing` |
| `--dry-run` | No value. Prints the `gh` arguments and the request with each text replaced by its size, and sends nothing. The content scan, the table check and the wrap and link checks all run; `gh` doesn't, so the login and owner checks don't, and nor does the `--as` check: a dry run can pass where the real run is refused | none |
| `--title-file` | A file read as `--body` is; one line, which may end with one line break, at most 256 characters | the `file/` rules, `text/title-lines`, `text/title-length` |
| `--label` | A label name: letters, digits, spaces and `:._-`, at most 50 characters; once per label. A label the repo doesn't have is created by GitHub, and stays | `input/label` |
| `--head` | A branch, or `owner:branch` with the repo's own owner | `input/branch`, `owner/head` |
| `--base` | A branch | `input/branch` |
| `--draft` | No value; opens the pull request as a draft | none |
| `--issue`, `--pr`, `--comment` | A positive whole number | `input/number` |

## Results and exit codes

The last line is always a `RESULT:` line on standard output. The lines above
it name rules, fields, positions and sizes, never the text; the one
exception is the `NEXT:` line, which holds fixed words, a page and a login.
A line `gh` wrote to standard error is shown as its first line, escaped, or
withheld with only the rule it trips named. The poster never retries.

On exit 1 and exit 3 the poster prints one `NEXT:` line, straight above the
`RESULT:` line, saying what the session does next, so a session that never
sees this page still knows. It is the only line that starts with `NEXT:`. Its
page and login are the ones the poster checked before it sent, never text from
`gh` or the body.

| Exit | Last line | What it means | What a session does |
| --- | --- | --- | --- |
| 0 | `RESULT: verified <surface> <url> as <login>` | What landed is what was sent | Deletes the body file |
| 0 | `RESULT: dry-run <surface>` | Nothing was sent | Nothing |
| 1 | `RESULT: mismatch <url>` | Posted, but a field differs; a `MISMATCH` line names each field, and a `NEXT:` line says the post landed and must not be posted again | Never posts again; deletes the body file; tells the owner which field |
| 1 | `RESULT: unverified <url>` | Posted, but the read-back failed or couldn't be read; a `NEXT:` line says the post landed and must not be posted again, with the link, or with only the page it sits on if the poster never read its id | Never posts again; deletes the body file; opens the URL and tells the owner |
| 2 | `RESULT: refused <count>` | A usage fault or a content refusal; a `REFUSED` line names each rule and where it sits. Nothing was sent | Fixes its own prose, table or link in place and posts again. A lens report refused for a secret, a personal detail, a session id or hidden characters stays local, unedited, and the owner is told where it is, in chat; a table, wrap or link refusal inside one means its fence is too short: fix the fence. A refusal no text fix clears, or a second one it can't explain: stops and tells the owner |
| 3 | `RESULT: failed` | The post call failed. The post may or may not have landed; a `NEXT:` line names the page to look at and the login to look for | Deletes the body file; checks whether it landed, as below; never posts again on its own |
| 4 | `RESULT: unavailable` | A read before posting failed (the login or the repo), or the poster failed before sending. Nothing was sent | Deletes the body file; stops and tells the owner, as the rules file says. `gh auth status` and the network are what to check |

A fault inside the poster ends as exit 4 before it sends, exit 3 while it
sends, and exit 1 after. A label GitHub gives back in another capitalisation
is a `NOTE` line, not a mismatch.

### After exit 3: did it land?

The `NEXT:` line names the page and the login to look for. Read the target's
newest items by that login, and look for the post you meant to send:

- **`issue`:** `gh issue list -R <owner/name> --author @me --state all --limit 5`
- **`pull-request`:** `gh pr list -R <owner/name> --author @me --state all --limit 5`
- **`issue-comment`:** `gh issue view <n> -R <owner/name> --comments`, or `gh pr view <n> -R <owner/name> --comments` on a pull request's conversation; its last comments
- **`pull-request-review`:** `gh api --paginate repos/<owner/name>/pulls/<n>/reviews`, its last items
- **`review-thread-reply`:** `gh api --paginate repos/<owner/name>/pulls/<n>/comments`, its last items

If the post is there, don't post again: treat it as unverified, and give the
owner its URL. If it isn't, tell the owner, and post again only on their word.
If you can't tell, tell the owner, and don't post.

## Rule ids

A `REFUSED` line names one of these. Every one ends the run with exit 2 and
nothing sent.

| Rule | Refused when |
| --- | --- |
| `usage/surface` | The first argument is missing or no surface |
| `usage/argument` | A word that is no option |
| `usage/unknown-option` | An option the surface doesn't take |
| `usage/repeated` | A single-value option given twice |
| `usage/missing-value` | An option with no value after it |
| `usage/missing-option` | An option the surface needs is missing |
| `input/repo` | `--repo` isn't `owner/name` |
| `input/login` | `--as` isn't a GitHub login |
| `input/number` | `--issue`, `--pr` or `--comment` isn't a positive whole number |
| `input/branch` | `--head` or `--base` isn't a branch name |
| `input/label` | A `--label` isn't a label name |
| `owner/head` | `--head` names another owner than the repo's |
| `owner/repo` | The repo's owner, by name, isn't the `gh` login |
| `owner/github` | The owner GitHub returns for the repo isn't the `gh` login: the name was renamed or moved |
| `as/missing` | A token is set in the environment and `--as` isn't given |
| `as/differs` | `--as` isn't the `gh` login |
| `file/unreadable` | The file can't be read |
| `file/link` | The file is a link |
| `file/not-regular` | The file isn't a regular file, or it was replaced by another file while it was read |
| `file/size` | The file is over 256 KiB |
| `file/utf8` | The file isn't valid UTF-8 |
| `file/bom` | The file starts with a byte-order mark |
| `file/empty` | The file, or the title, is empty |
| `text/body-length` | The body is over 65,536 characters |
| `text/title-lines` | The title runs over more than one line |
| `text/title-length` | The title is over 256 characters |
| `secret/token` | A credential's known shape |
| `secret/url-userinfo` | A password in a link's user part |
| `secret/env` | The value of a secret environment variable; the line names the variable, never the value |
| `id/session` | A session id |
| `personal/email` | An email address |
| `text/hidden` | A hidden character |
| `table/header` | A Lens dispositions table's header row isn't exactly `\| Finding \| Lens \| Disposition \| Rerun \|` |
| `table/cells` | A row has the wrong number of cells, or an empty Lens cell |
| `table/disposition` | A Disposition cell doesn't start with `fixed`, `taken`, `dismissed`, `skipped`, `open` or `noted`; or, in a row whose Finding cell is exactly `withheld, see chat`, it is anything but one bare `open`, `fixed`, `taken` or `dismissed` |
| `table/skipped` | `skipped` isn't followed by `, because` |
| `table/auto` | ` (auto` isn't followed by `:`, `)` or `, reversed` |
| `table/state` | A Finding cell doesn't start with a state word (`new`, `updated`, `unchanged` or `absent`), in a row that isn't `skipped` and whose Finding cell isn't exactly `withheld, see chat`; or the word "withheld", in any case, spacing or markup, comes straight after a state word |
| `text/hard-wrap` | A prose line stops mid-sentence and the next line continues the same paragraph, list item or quote |
| `link/relative` | A link's target has no scheme and isn't an anchor on the same page |

## What the scans cover

The content scan reads the title, each label and the body three ways: as
written, and as a reader would see it with its HTML comments dropped and with
their contents kept. Seeing it as a reader means removing invisible characters,
markdown escapes and inline tags, decoding entities, and applying NFKC. The
lists of shapes and names below are kept by hand from the poster's source;
no test holds them.

- **`secret/token`:** a fixed list of shapes: GitHub's tokens, old and
  fine-grained; `sk-` keys; live Stripe keys; npm, GitLab and Google API keys;
  AWS access key ids; Slack tokens; JSON web tokens; private key headers; and
  `AccountKey=` or `Password=` pairs.
- **`secret/url-userinfo`:** a link of the form `scheme://user:password@host`.
- **`secret/env`:** the value, 8 characters or more, of any environment
  variable whose name has a part ending in `TOKEN`, `SECRET`, `KEY`,
  `PASSWORD`, `PASSWD`, `PWD`, `PAT`, `AUTH`, `CREDENTIAL`, `CREDENTIALS` or
  `COOKIE`, except `PWD`, `OLDPWD` and `SSH_AUTH_SOCK`.
- **No path rule.** The scan refuses no path, this machine's own home and
  temp folders, user name and host name included (#364, ADR 0097). Catching
  a path that says something about you is the read before posting's job.
- **`id/session`:** a UUID, a `session_` id, or a Claude Code session link.
  A pull request's body may end with Claude Code's attribution, whose session
  link is let through.
- **`personal/email`:** an email address, except GitHub's `noreply` addresses
  and Anthropic's `noreply` address.
- **`text/hidden`:** tag characters (a subdivision flag aside), direction
  embeddings, overrides and isolates, the zero-width space, word joiners, the
  rarer variation selectors, and a byte-order mark inside the text. The
  joiners and selectors ordinary emoji use are let through.
- **The table check (`table/`):** on the body only, after the content scan.
  It reads a table with a header cell reading `Disposition` under an earlier
  line naming "Lens dispositions", outside any fence, folds (`<details>` blocks) included; the review procedure gives the table's template. Of each row with the template's cell count, it reads the Finding cell's lead word and what follows it (unless the row is `skipped` or the cell is exactly `withheld, see chat`), whether the Lens cell is empty, and the Disposition cell, which in a withheld row must be one bare word (#336, ADR 0090). A
  refusal on a line inside a lens report means the report's fence is too
  short: fix the fence, never the report (ADR 0076). Past 50 table refusals,
  the rest are counted, not listed. It is a backstop too.
- **The wrap check (`text/hard-wrap`):** on the body only, after the table
  check. GitHub shows each single line break in a post, so a paragraph wrapped
  at a column limit lands as a ragged column. It refuses a prose line that
  stops mid-sentence (no `.`, `!`, `?`, `:` or `;` at its end, and no link)
  when the next line continues the same paragraph, list item or quote, and
  names the continuing line once, however many lines are wrapped. It never
  reads a fence, an HTML comment, a table or a heading. A
  line broken on purpose passes: two trailing spaces, a backslash, or a bold
  label such as `**After:**` starting the next line. To fix it, join the
  paragraph or item onto one line; never put prose in a fence, code span or
  comment to get past it. A refusal on a line inside a lens report means the
  report's fence is too short: fix the fence, never the report, as for tables
  (ADR 0076). The poster never rewrites a body.
- **The link check (`link/relative`):** on the body only, after the table
  check. GitHub leaves a link's target as written, so a repository-relative
  link on an issue page is a dead link. It refuses an inline link, an image, a
  reference definition or an HTML `href` or `src` whose target does not start with a
  scheme (`https:`, `mailto:`), `//` or `#`, a root link such as
  `/owner/repo/issues/3` included, and names the target's line and column
  once. It never reads a fence, a code span or an HTML comment, and a footnote
  definition is not a link. To fix it, write the full `https://github.com/...`
  link; never put the link in a fence, code span or comment to get past it. A
  refusal on a line inside a lens report means the report's fence is too
  short: fix the fence, never the report (ADR 0076).

## What the scans don't cover

- **Other personal details:** names, phone numbers and postal addresses. The
  user name in plain prose passes, since it is often the login in the owner's
  own links.
- **A secret with no known shape** and no environment variable behind it.
- **Option values other than `--label`,** which are checked against patterns, not scanned.
- **The rest of the table:** the reason text, a `skipped` row's Finding cell, the
  Rerun cell, the Auto-takes list, escape and gap tables, a table with no
  leading `|`, and any table inside a fence.
- **A session that sets out to get past them.** They catch accidents.
- **The poster itself.** Nothing checks the live file before a session runs
  it; the next dry run shows a changed one as drift (threat model, R14).
- **Text already posted.** Posting again doesn't remove it, and GitHub's edit
  history keeps every earlier version. Rotate a leaked secret, and delete the
  comment or its history entry by hand.
- **A Claude home elsewhere.** The rules file names the default
  `~/.claude`; an install with `--claude-home` elsewhere puts the poster
  where the rule doesn't point.
