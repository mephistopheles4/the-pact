# The poster

The poster posts free text to GitHub as your `gh` account, and edits what a
session posted there, then reads back what landed and checks it against what
it sent. It is a pact tool, off unless
the `tools` list in `~/.claude/pact/config.json` names it (ADR 0074). When it's
on, the install puts it at `~/.claude/pact/tools/poster.mjs`, and the rules
file tells a session to post through it. Its scans catch accidents, not a
session that sets out to get past them. For a secret, its refusal of a live
environment secret's value is the only check, and only where the poster is on
(threat model, R3, R13 and R64). For hidden characters and a Lens
dispositions table, the review procedure's read before posting still comes
first, on every install, with or without the poster (R29). It needs Node 24 or
later and `gh`, signed in.

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
line. Write the body, any title and any edit's reason to files in the scratch
folder. As the
rules file says, delete a file once its post ends, whatever the result
(verified, failed, unverified, mismatch or unavailable), or once you drop it.
Keep a file holding a lens report that the poster refused until the owner has
answered, then delete it. Before the session ends, delete every such file
still there, whatever the owner's answer.

**When a session dies, its files stay.** Nothing deletes a file the session
didn't. A lens report kept after a refusal for hidden characters or a live
environment secret's value is an ordinary, unencrypted file
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
| `issue-edit` | A new body for an issue | `--issue`, `--reason` and `--signed` |
| `pull-request-edit` | A new body for a pull request | `--pr`, `--reason` and `--signed` |
| `issue-comment-edit` | A new body for a comment on an issue or a pull request's conversation | `--issue`, `--comment`, the id of the comment edited, `--reason` and `--signed` |
| `review-thread-reply-edit` | A new body for a reply in a line-comment thread | `--pr`, `--comment`, the id of the reply edited, `--reason` and `--signed` |

`issue` has no `--parent` option. A session that needs a sub-issue link asks
the owner to set it on GitHub.

`--comment` names the comment being answered on `review-thread-reply`, and
the comment being edited on the two comment edits.

The documented command line for each, as the poster's own `EXAMPLES` hold
them:

```text
node poster.mjs issue --repo you/your-repo --title-file title.txt --body body.md --label bug
node poster.mjs pull-request --repo you/your-repo --title-file title.txt --body body.md --head my-branch --base main --draft
node poster.mjs issue-comment --repo you/your-repo --body comment.md --issue 12 --as you
node poster.mjs pull-request-review --repo you/your-repo --body review.md --pr 34
node poster.mjs review-thread-reply --repo you/your-repo --body reply.md --pr 34 --comment 5678
node poster.mjs issue-edit --repo you/your-repo --body body.md --reason reason.txt --signed build-12 --issue 12
node poster.mjs pull-request-edit --repo you/your-repo --body body.md --reason reason.txt --signed build-12 --pr 34
node poster.mjs issue-comment-edit --repo you/your-repo --body comment.md --reason reason.txt --signed build-12 --issue 12 --comment 4321
node poster.mjs review-thread-reply-edit --repo you/your-repo --body reply.md --reason reason.txt --signed build-12 --pr 34 --comment 8765
```

### Edits

An edit replaces the body of something the poster's login posted, and nothing
else: no title, label or state. A review's body can't be edited. Start the new
body from the item's current body, read with `gh api repos/<owner/name>/<path>
--jq .body`, where the path is `issues/<n>`, `pulls/<n>`,
`issues/comments/<id>` or `pulls/comments/<id>`, and keep its signature line
and every `Edited:` line as they are. The poster sends that body with one
reason line after it, as its own paragraph:

```text
Edited: <reason> (<label>)
```

The reason is the `--reason` file's one line; the label is `--signed`. The
line breaks it adds follow the body's: CRLF when the body holds one, else LF.
A reason names the kind of fix ("fixed a wrong link"), never the text taken
out.

Before it sends, the poster reads the item and refuses the edit, with nothing
sent, when:

- **another account wrote it** (`edit/author`), or it isn't where the options
  say (`edit/target`): a comment on another issue or pull request, an issue
  number that is a pull request's, or a thread's first comment, which the
  poster never makes. An item another account wrote is read no further, so
  its text never reaches the slower checks below (#394);
- **it isn't signed by `--signed`** (`edit/unsigned`), on the item or on the
  new body. A signature line is a whole line, outside a fence, a quote and a
  closed HTML comment, that is exactly `Signed: <label>` or `Posted by <label>.`; a
  body that also holds another label's signature line is refused too. A bare
  label is never a signature, so a post signed only with its label, or a pull
  request body with no signature line, can't be edited. Sign a post you may
  need to edit with a `Signed: <label>` line;
- **it is a review record** (`edit/record`, best effort), on the item or the
  new body: a heading or a fold's summary that names a word ending in
  `-lens`, a fold summary that opens "Lens dispositions" or "Crossed
  findings", or the Lens dispositions header row, `Finding`, `Lens`,
  `Disposition` and `Rerun` whatever its spacing. It skips fences on each
  normalised and folded view of the text, so a shape quoted inside a fence can
  be refused too. A record stays as it was posted; a correction is a new
  comment;
- **it holds a decision mark** (`edit/decision`, best effort), on the item or
  the new body: the words "owner decision", in any case, spacing or markup, on
  the text as written and on each normalised copy the content scan reads, each
  also with its links and marks folded, with a fixed set of look-alike letters
  folded first.
  Text that only mentions the words can't be edited either;
- **it holds what the content scan refuses** (`edit/leak`): a hidden
  character or a live environment secret's value. An edit can't remove it, since GitHub's
  history keeps every version, so tell the owner instead;
- **the new body drops, changes, adds or hides a reason line**
  (`edit/reasons`): the body must end in exactly the item's reason lines, in
  order. As a best effort, no other line may read as one, and nothing above
  them may open an HTML comment or a fold it doesn't close. Reason lines pile
  up, as the record of each change.

The author, target, signature, leak and append-only reason checks are the
edit's controls. The record and decision checks, and the reason lines' "in
plain sight" part, are a best-effort backstop: they guess at how GitHub
renders a body, and a form their readings don't see passes (What the scans
don't cover).

The scans that read a post read the edit too: the reason, and the body with
its reason line.

Since #394 the edit checks read more forms of the text, so an edit of a post
that passed before can now be refused. For `edit/record` or `edit/decision`,
reword, or post a new comment. A new `edit/leak` means the item may already
show a hidden character or a secret's value on the page, and its history keeps it: tell the
owner, and never edit around it.

A repo's own rule can still say a text is never edited. In this repo, a
probe's expected result and its run records stay as posted after a run
(`docs/agents/changing-rules.md`, A probe the owner asks for); a correction
there is a new comment.

## Options

Every surface takes `--repo` and `--body`, and may take `--as` and
`--dry-run`. An option's value is checked against a pattern. Of the options,
only `--label`'s values are also scanned, with the title and the body.

| Option | Value | Checked by |
| --- | --- | --- |
| `--repo` | `owner/name`; the owner must be the `gh` login, by name and by what GitHub returns for the repo | `input/repo`, `owner/repo`, `owner/github` |
| `--body` | A file: a regular file, not a link, at most 256 KiB, valid UTF-8 with no byte-order mark, not empty; the body at most 65,536 characters | the `file/` rules, `text/body-length` |
| `--as` | A login the `gh` login must equal; needed when `GH_TOKEN` or `GITHUB_TOKEN` is set | `input/login`, `as/differs`, `as/missing` |
| `--dry-run` | No value. Prints the `gh` arguments and the request with each text replaced by its size, and sends nothing. The content scan, the table check, the fence check and the wrap and link checks all run; `gh` doesn't, so the login and owner checks don't, and nor does the `--as` check: a dry run can pass where the real run is refused | none |
| `--title-file` | A file read as `--body` is; one line, which may end with one line break, at most 256 characters | the `file/` rules, `text/title-lines`, `text/title-length` |
| `--label` | A label name: letters, digits, spaces and `:._-`, at most 50 characters; once per label. A label the repo doesn't have is created by GitHub, and stays | `input/label` |
| `--head` | A branch, or `owner:branch` with the repo's own owner | `input/branch`, `owner/head` |
| `--base` | A branch | `input/branch` |
| `--draft` | No value; opens the pull request as a draft | none |
| `--issue`, `--pr`, `--comment` | A positive whole number | `input/number` |
| `--reason` | An edit's reason: a file read as `--title-file` is; one line, which may end with one line break, at most 200 characters | the `file/` rules, `text/reason-lines`, `text/reason-length` |
| `--signed` | The editing session's label: a lowercase letter or digit, then lowercase letters, digits and hyphens, at most 50 characters | `input/signed` |

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
| 2 | `RESULT: refused <count>` | A usage fault or a content refusal; a `REFUSED` line names each rule and where it sits. Nothing was sent | Fixes its own prose, table or link in place and posts again. A lens report refused for hidden characters or a live environment secret's value stays local, unedited, and the owner is told where it is, in chat; a table, wrap, link or fence refusal inside one means its fence is too short: fix the fence. A refusal no text fix clears, or a second one it can't explain: stops and tells the owner |
| 3 | `RESULT: failed` | The post call failed. The post may or may not have landed; a `NEXT:` line names the page to look at and the login to look for | Deletes the body file; checks whether it landed, as below; never posts again on its own |
| 4 | `RESULT: unavailable` | A read before posting failed (the login or the repo), or the poster failed before sending. Nothing was sent | Deletes the body file; stops and tells the owner, as the rules file says. `gh auth status` and the network are what to check |

An edit ends the same ways, with its own words. Its link is the item's,
known before it sends. Its exit 1 `NEXT:` line says the edit landed and must
never be sent again. Its exit 3 line names the item and says to look there for
the reason line. A failed or unusable read of the item, a 404 included,
is exit 4, with nothing sent. A dry run of an edit doesn't read the item, so
the item's checks don't run.

A fault inside the poster ends as exit 4 before it sends, exit 3 while it
sends, and exit 1 after. A label GitHub gives back in another capitalisation
is a `NOTE` line, not a mismatch.

### After exit 3: did it land?

For a post, the `NEXT:` line names the page and the login to look for. Read
the target's newest items by that login, and look for the post you meant to
send:

- **`issue`:** `gh issue list -R <owner/name> --author @me --state all --limit 5`
- **`pull-request`:** `gh pr list -R <owner/name> --author @me --state all --limit 5`
- **`issue-comment`:** `gh issue view <n> -R <owner/name> --comments`, or `gh pr view <n> -R <owner/name> --comments` on a pull request's conversation; its last comments
- **`pull-request-review`:** `gh api --paginate repos/<owner/name>/pulls/<n>/reviews`, its last items
- **`review-thread-reply`:** `gh api --paginate repos/<owner/name>/pulls/<n>/comments`, its last items
- **`issue-edit`, `pull-request-edit`, `issue-comment-edit`, `review-thread-reply-edit`:** open the link the `NEXT:` line names and look for the edit's reason line at the end of the body; if it is there, never send the edit again, and tell the owner its link

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
| `input/signed` | `--signed` isn't a session label |
| `text/reason-lines` | The reason runs over more than one line |
| `text/reason-length` | The reason is over 200 characters |
| `edit/author` | The item's author isn't the `gh` login |
| `edit/target` | The item isn't where the options say, or is a pull request read as an issue, or a thread's first comment |
| `edit/unsigned` | The item or the new body has no signature line for `--signed`, or has one for another label |
| `edit/record` | The item or the new body is a review record |
| `edit/decision` | The item or the new body holds the words "owner decision" |
| `edit/leak` | The item holds what the content scan refuses: a hidden character or a live environment secret's value |
| `edit/reasons` | The new body doesn't end in exactly the item's reason lines, holds another line that reads as one, or opens a comment or fold above them it doesn't close |
| `secret/env` | The value of a secret environment variable; the line names the variable, never the value |
| `text/hidden` | A hidden character |
| `table/header` | A Lens dispositions table's header row isn't exactly `\| Finding \| Lens \| Disposition \| Rerun \|` |
| `table/cells` | A row has the wrong number of cells, or an empty Lens cell |
| `table/disposition` | A Disposition cell doesn't start with `fixed`, `taken`, `dismissed`, `skipped`, `open` or `noted`; or, in a row whose Finding cell is exactly `withheld, see chat`, it is anything but one bare `open`, `fixed`, `taken` or `dismissed` |
| `table/skipped` | `skipped` isn't followed by `, because` |
| `table/auto` | ` (auto` isn't followed by `:`, `)` or `, reversed` |
| `table/state` | A Finding cell doesn't start with a state word (`new`, `updated`, `unchanged` or `absent`), in a row that isn't `skipped` and whose Finding cell isn't exactly `withheld, see chat`; or the word "withheld", in any case, spacing or markup, comes straight after a state word |
| `fence/unclosed` | A fence is left open: the body ends inside it, or a `mermaid` fence runs into another fence or a fold's tag |
| `text/hard-wrap` | A prose line stops mid-sentence and the next line continues the same paragraph, list item or quote |
| `link/relative` | A link's target has no scheme and isn't an anchor on the same page |

## What the scans cover

The content scan reads the title, each label and the body as written and as
normalised copies, each meant to show the text as a reader sees it on
GitHub's page (#394, ADR 0122):

- **The floor,** two copies built as before #394, one with HTML comments
  dropped and one with their contents kept: invisible characters, markdown
  escapes and inline tags removed every round, the old short list of named
  references decoded, NFKC applied. It is frozen, so no form refused before
  #394 passes now.
- **The page copy:** block-quote markers stripped, then the source's own raw
  HTML removed once, block by block, as GitHub's grammar reads it (tags with
  any quoted attribute value and ASCII spacing, but for the nine tag names
  GitHub filters; comments, declarations, and processing instructions and
  CDATA sections up to their first `>`), keeping backslash escapes
  and code spans as text; then, until nothing changes, escapes removed, every
  HTML5 named reference decoded (the semicolon-less legacy names by longest
  prefix), numeric references of any length decoded, invisible and control
  characters stripped, and NFKC applied. It never removes a tag twice, so
  text that decoding makes tag-shaped stays, as the page shows it.
- **The bare copy:** the same, removing nothing, for a tag the page shows as
  text in a fence or elsewhere the page copy reads otherwise.
- **The wide copy:** the same as the page copy, but read over the whole text
  with any Unicode spacing in a tag and no tag filter, as the first build of
  #394 read it, for a tag the HTML parser reads inside an HTML block where the
  grammar doesn't, such as one with a no-break space before `=`.
- **The page copy with its marks folded:** `*`, backticks, `~` and link
  syntax dropped, `_` kept.

Control characters are stripped though GitHub's comments show most of them
as U+FFFD: stripping only ever adds refusals. The lists of names below are
kept by hand from the poster's source; no test holds them.

- **No token-shape, URL-password or email rule.** The scan refuses no
  credential shape, password in a link or email address (#441): the pact has
  no rule on a secret or a personal detail in a session's own text.
- **`secret/env`:** the value, 8 characters or more, of any environment
  variable whose name has a part ending in `TOKEN`, `SECRET`, `KEY`,
  `PASSWORD`, `PASSWD`, `PWD`, `PAT`, `AUTH`, `CREDENTIAL`, `CREDENTIALS` or
  `COOKIE`, except `PWD`, `OLDPWD` and `SSH_AUTH_SOCK`.
- **No path rule.** The scan refuses no path, this machine's own home and
  temp folders, user name and host name included (#364, ADR 0097). A
  link whose target is a local path is still refused, by `link/relative`,
  since it lands as a dead link.
- **No session-id rule.** The scan refuses no UUID, `session_` id or Claude
  Code session link, so a scratchpad path, a GitHub attachment link and
  Claude Code's attribution post on any surface (#366, ADR 0100). A session
  link opens only for the account that owns the session.
- **`text/hidden`:** tag characters (a subdivision flag aside), direction
  embeddings, overrides and isolates, the zero-width space, word joiners, the
  rarer variation selectors, and a byte-order mark inside the text. The
  joiners and selectors ordinary emoji use are let through.
- **The table check (`table/`):** on the body only, after the content scan.
  It reads a table with a header cell reading `Disposition` under an earlier
  line naming "Lens dispositions", outside any fence, folds (`<details>` blocks) included; the review procedure gives the table's template, and its review comment folds the table, with the fold's summary line as the line naming "Lens dispositions" (#401). Of each row with the template's cell count, it reads the Finding cell's lead word and what follows it (unless the row is `skipped` or the cell is exactly `withheld, see chat`), whether the Lens cell is empty, and the Disposition cell, which in a withheld row must be one bare word (#336, ADR 0090). A
  refusal on a line inside a lens report means the report's fence is too
  short: fix the fence, never the report (ADR 0076). Past 50 table refusals,
  the rest are counted, not listed. It is a backstop too.
- **The fence check (`fence/unclosed`):** on the body only, after the table
  check. A fence left open swallows what follows it, the review comment's
  folds and its table included, from the reader and from the table check. It
  refuses a body that ends inside a fence, read as the table check reads
  fences, and a `mermaid` fence that runs into a line no diagram holds:
  another fence or a fold's tag. It names the opening fence's line and column.
  It reads nothing inside a closed fence, so a diagram's labels are checked
  only by the content scans above. A refusal on a line inside a lens report
  means the report's fence is too short: fix the fence, never the report (#401).
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
  scheme of two letters or more (`https:`, `mailto:`), `//` or `#`, a root
  link such as `/owner/repo/issues/3` and a drive-letter path such as
  `D:/work/x.md` included (#364), and names the target's line and column
  once. It never reads a fence, a code span or an HTML comment, and a footnote
  definition is not a link. To fix it, write the full `https://github.com/...`
  link; never put the link in a fence, code span or comment to get past it. A
  refusal on a line inside a lens report means the report's fence is too
  short: fix the fence, never the report (ADR 0076).

## What the scans don't cover

- **Any secret or personal detail** other than a live environment secret's
  value: a token `gh` keeps in a credential store, a key in a file, a name,
  an email address (#441).
- **A refused value written in a form no copy reads as the page does**
  (threat model, R13): two tricks at once that no single copy reads together,
  a look-alike letter from another script, a renderer other than GitHub's
  comments, or a raw-HTML or markdown structure the page copy reads
  differently from GitHub's page.
- **Option values other than `--label`,** which are checked against patterns, not scanned.
- **The rest of the table:** the reason text, a `skipped` row's Finding cell, the
  Rerun cell, the Auto-takes list, escape and gap tables, a table with no
  leading `|`, and any table inside a fence.
- **The review comment's human layer** (#401): its title, signal table, boxes
  and counts, and what its diagrams say. The content scans read all of it,
  diagrams included; the table, wrap and link checks never read inside a
  fence, and nothing checks the counts against the table or that a withheld
  finding stays out. The review procedure's rules alone hold those.
- **A session that sets out to get past them.** They catch accidents.
- **The poster itself.** Nothing checks the live file before a session runs
  it; the next dry run shows a changed one as drift (threat model, R14).
- **Text already posted.** Posting again doesn't remove it, and nor does an
  edit: GitHub's edit history keeps every earlier version. An edit is never the
  fix for a leak. Tell the owner; rotate a leaked secret, and the owner
  deletes the comment or its history entry by hand.
- **Who signed.** A label is plain text, so any session can sign with any
  label and edit any post signed in the two forms, an owner's comment that
  holds a session's pasted signature line included. The edit checks stop an
  edit of owner-typed text with no signature line, of a review record, and of a
  decision mark; they catch accidents (threat model, R2).
- **Text already relied on.** An edit can change a post someone has acted on,
  such as an approved spec, a hand-off or a pull request body at merge, and in
  a repo whose rule counts the owner's account's last edit, the item still
  counts. The reason lines and GitHub's history show the change (threat model,
  R2).
- **The best-effort checks' gaps.** The record, decision and "in plain sight"
  checks read the source text, not GitHub's rendered page, so a form their
  readings don't see passes: a look-alike letter outside the fixed set; a
  heading as an HTML element, or a setext heading whose lens name sits on an
  earlier line; an older record layout; fence and comment markup that GitHub
  reads differently from the poster; a fold or comment tag balanced by one in
  a fence, a code span or a closed comment, or carried in a reason; and a
  reason line forged with an entity, emphasis or an escape. They also refuse
  some text that isn't a record, such as a record shape quoted inside a fence.
  These gaps are accepted by class (threat model, R2); reading GitHub's
  rendered page instead is #419.
- **A change between the read and the write.** The poster reads the item, then
  writes it; a change made between the two is overwritten unseen. A session
  that drafts from its own earlier read widens that window to its drafting
  time, so a change made since, a removed line included, comes
  back (threat model, R60). A refusal when the item changed since that read
  is #419.
- **A Claude home elsewhere.** The rules file names the default
  `~/.claude`; an install with `--claude-home` elsewhere puts the poster
  where the rule doesn't point.
