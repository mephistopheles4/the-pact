# The poster

The poster posts free text to GitHub as your `gh` account, and edits what a
session posted there, then reads back what landed and checks it against what
it sent. It is a pact tool, off unless
the `tools` list in `~/.claude/pact/config.json` names it (ADR 0074). When it's
on, the install puts it at `~/.claude/pact/tools/poster.mjs`, and the rules
file tells a session to post through it. Its scans catch accidents, not a
session that sets out to get past them. For a secret, its refusal of a live
environment secret's value is the only check, and only where the poster is on
(threat model, Posts are public). The review procedure's read before posting
still comes first, on every install, with or without the poster. It needs
Node 24 or later and `gh`, signed in.

Permission rules on `gh` commands don't see the poster's calls, because the
poster starts `gh` itself; to gate posting, put a rule on the poster's own
command. In auto mode, Claude Code's classifier does see the call, and may
stop a post until the owner allows it.

In this page, "a session" is the Claude Code session running the poster, and
"the owner" is the person whose `gh` account it posts as.

## Running it

Each shell gets its own command form, as `review.md` gives them:

- **A POSIX shell** (Git Bash, Linux, macOS):
  `node ~/.claude/pact/tools/poster.mjs <surface> --post <file> [--dry-run]`
- **PowerShell:**
  `node "$HOME/.claude/pact/tools/poster.mjs" <surface> --post <file> [--dry-run]`

Those two forms and `schema` (below) are the only ones. Any other option is
refused `usage/unknown-option`, on every surface and on the edits too, with no
window where an old form still works, and one fixed `NEXT:` line says the poster
takes a JSON post now and points to `node poster.mjs schema` and the Posting
section of `~/.claude/pact/review.md`. The line holds no argument the session
gave.

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
model, The pact gets loosened).

Every piece of free text comes from a file, so no prose reaches a command
line. A post is one JSON file, the post file, and its body is a second file
the post names, `body_file`, in the post file's own folder. Write both to the
scratch folder. A round comment runs to tens of thousands of characters, and a
body written as one escaped JSON string is where a mistake would land, which
is why the body is a file and only the short text (title, quote, read-back,
reason) is inline. As `review.md` says, delete both files once their post
ends, whatever the result (verified, failed, unverified, mismatch or
unavailable), or once you drop it: they hold the owner's exact words. Keep a
file holding a lens report that the poster refused until the owner has
answered, then delete it. Before the session ends, delete every such file
still there, whatever the owner's answer.

`node poster.mjs schema` prints the schema as JSON Schema (draft 2020-12),
sends nothing and exits 0. It is one frozen object in `poster.mjs`, so the
install still copies one file. The validator is built from node built-ins and
reads only the keywords the schema uses. The rest is code beside it, each with
its own refusal: which fields a surface takes, the kind table, the quote and
read-back rules, the edit rules and the body file. The schema's own description
names them.

**When a session dies, its files stay.** Nothing deletes a file the session
didn't. A lens report kept after a refusal for hidden characters or a live
environment secret's value is an ordinary, unencrypted file
in that session's scratch folder, which the session named to the owner in chat
when it kept the report. If the session is killed before it cleans up, delete
that file by hand. The report may also stay in the session's saved
transcript; for a secret, rotating it is the fix, as for posted text.

## Surfaces

| Surface | What it makes | Its own post fields |
| --- | --- | --- |
| `issue` | An issue, with any labels | `kind`, `title`, `labels`, `quote`, `intent` |
| `pull-request` | A pull request from a branch in the same repo | `kind`, `title`, `head`, `base`, `draft`, `quote`, `intent` |
| `issue-comment` | A comment on an issue or a pull request's conversation | `kind`, `issue`, `answers` (a `decision` only), `quote`, `intent` |
| `pull-request-review` | A review that only comments, never approving or asking for changes, with a body and no line comments | `kind`, `pr`, `quote`, `intent` |
| `review-thread-reply` | A reply in an existing line-comment thread on a pull request | `kind`, `pr`, `comment` (the id of the thread's review comment), `quote`, `intent` |
| `issue-edit` | A new body for an issue | `issue`, `reason`, `quote`, `intent` |
| `pull-request-edit` | A new body for a pull request | `pr`, `reason`, `quote`, `intent` |
| `issue-comment-edit` | A new body for a comment on an issue or a pull request's conversation | `issue`, `comment` (the id of the comment edited), `reason`, `quote`, `intent` |
| `review-thread-reply-edit` | A new body for a reply in a line-comment thread | `pr`, `comment` (the id of the reply edited), `reason`, `quote`, `intent` |

Every surface also takes `repo`, `signer` and `body_file`, and may take `as`.
`quote` and `intent` are required or refused by kind on a create post, and on
an edit the item decides (Edits, below). The issue surface has no parent
field, since a link carries no text. A session links a ticket to its parent
with `gh api`, as
[tickets as sub-issues](agents/issue-tracker.md#tickets-as-sub-issues) says;
every text it posts still goes through the poster.

The documented post for each surface, as the poster's own `EXAMPLES` hold them
as JSON objects. Each goes in its own post file, beside the `body_file` it
names:

```json
{ "repo": "you/your-repo", "kind": "issue", "title": "A clear one-line title", "labels": ["bug"], "signer": "plan-12", "quote": [{ "text": "The words the owner said, exactly.", "source": "chat", "when": "2026-11-11" }], "intent": { "text": "What the session took those words to mean.", "status": "pending" }, "body_file": "body.md" }
{ "repo": "you/your-repo", "kind": "pull-request", "title": "A clear one-line title", "head": "my-branch", "base": "main", "draft": true, "signer": "pr-12", "quote": [{ "text": "The words the owner said, exactly.", "source": "chat", "when": "2026-11-11" }], "intent": { "text": "What the session took those words to mean.", "status": "pending" }, "body_file": "body.md" }
{ "repo": "you/your-repo", "kind": "note", "issue": 12, "as": "you", "signer": "build-12", "body_file": "comment.md" }
{ "repo": "you/your-repo", "kind": "review", "pr": 34, "signer": "review-34", "body_file": "review.md" }
{ "repo": "you/your-repo", "kind": "reply", "pr": 34, "comment": 5678, "signer": "build-34", "body_file": "reply.md" }
{ "repo": "you/your-repo", "issue": 12, "signer": "build-12", "reason": "fixed a wrong link", "body_file": "body.md" }
{ "repo": "you/your-repo", "pr": 34, "signer": "pr-34", "reason": "fixed a wrong link", "body_file": "body.md" }
{ "repo": "you/your-repo", "issue": 12, "comment": 4321, "signer": "build-12", "reason": "fixed a wrong link", "body_file": "comment.md" }
{ "repo": "you/your-repo", "pr": 34, "comment": 8765, "signer": "build-34", "reason": "fixed a wrong link", "body_file": "reply.md" }
```

They are the nine examples, one per surface in the table's order; the
`EXAMPLES` map holds the same objects, and a test runs each as a dry run. This
block is kept equal to the map by hand, since no test reads this page. The four
edit examples edit an item that is not an ask item. An edit of an ask item
(any issue, pull request, spec or decision posted with a quote) also carries
that item's own `quote` and `intent`, copied from the item (Edits). A
`pull-request-edit` signs `pr-<n>`, n the issue the pull request works on, as
the create example does.

### Kinds

A create post declares a `kind`, and a fixed table ties each kind to the
surfaces it may go to and to its quote and read-back:

| Kind | Surfaces | `quote` and `intent` | Rendered mark |
| --- | --- | --- | --- |
| `issue` | `issue` | required | none |
| `pull-request` | `pull-request` | required | none |
| `spec` | `issue-comment` | required | none |
| `decision` | `issue-comment` | required | `Owner decision, from chat.` when every passage's source is `chat`, else `Relayed owner words, not a decision mark.` |
| `status` | `issue-comment` | refused | none |
| `lens-report` | `issue-comment`, `pull-request-review` | refused | none |
| `note` | `issue-comment` | refused | none |
| `review` | `pull-request-review` | refused | none |
| `reply` | `review-thread-reply` | refused | none |

A kind on a surface outside its row is refused `post/kind`, and `quote` or
`intent` on a kind that refuses them is refused `post/field`. A `status` post
needs `signer` to be `status-<issue>`, and a signer starting `status-` is
refused on every other kind (`post/signer`). A `decision` with the chat mark is
posted `confirmed` (`post/status` otherwise), since the owner's words in the
session's chat are the decision; a relayed `decision` carries no mark, stays
editable and may be `pending`.

### The quote and the read-back

`quote` is 1 to 5 passages, each the owner's words verbatim with a `source`
and a `when` (a date, `YYYY-MM-DD`, no later than tomorrow in UTC):

- `chat`: the owner typed it in this session's chat.
- `relayed`: a lead session passed it on from its own chat; `via` names that
  lead by its session label, and is refused on any other source.
- `tracker`: it comes from an owner comment on the tracker; `comment` is that
  comment's id, and is refused on any other source. The poster reads it
  before it sends, refuses `post/tracker` unless the comment is in the same repo,
  by the `gh` login, and holds the passage's text, with each `[left out]` span
  matched by a plain substring search, and ends `unavailable` if the read fails.

A `[left out]` span is how a passage drops words that trip the content scan or
hold a personal detail. The text outside its spans must be 20 characters or
more, no two spans touch, and a passage holds at most three. The session
tells the owner in chat what it left out.

`intent` is the session's read-back of the quote, with a `status`:
`pending`, `confirmed` or `corrected`. A create post takes `pending`, or
`confirmed` only when every passage's source is `chat`
(`post/status` otherwise): a relay or a goal holder's reply never confirms a
read-back. `corrected` and `intent.comment` are refused on a create post. The
poster renders the read-back line itself:

- `Read-back: not yet confirmed.` for `pending`
- `Read-back: confirmed in this session's chat.` for a `confirmed` create post
- `Read-back: confirmed in comment <id>.` and `Read-back: corrected in comment <id>.`
  after an edit moves the status, with the struck original and the corrected
  text for a correction

`intent.text` and `intent.corrected` are refused `post/owned-line` when a line
holds a heading, a fence opening, an HTML heading tag or one of the poster's
owned lines (below), read as the page shows it. An unclosed HTML comment or fold in the body before the signature is refused `text/hidden-line`.

### How the poster builds the body

The poster owns these parts and renders them in this order, one blank line
between each: for a `decision`, the mark line and the `Answers:` line when
`answers` names the item (`issue <n>`, `pull request <n>` or `comment <id>`);
`## The ask` with each passage as a block quote and a source line;
`## Understood intent` with the intent text and its read-back line; the `body_file` text;
`Signed: <signer>`; on an edit, the reason lines. So this repo's PR checkbox line
opens the `body_file`, not the whole PR body.

The **owned lines** are the lines the poster writes: a `Signed:` or `Posted by`
signature line, a reason line, a decision mark, a line starting `Read-back:`,
`## The ask`, `## Understood intent`, a source line, `Corrected read-back:` and
a line starting `Answers:`. The source line follows its passage, and is one of:

- `Said in this session's chat, <when>.` for a `chat` passage
- `Relayed by <via> from its chat, <when>.` for a `relayed` one
- `From the owner's comment <comment>, <when>.` for a `tracker` one

A `body_file` that holds
one outside a fence is refused `post/owned-line`. The prose check skips the
quote's lines, since they are the owner's words verbatim, so a hard-wrapped
quote posts while the same wrap in the `body_file` is refused `text/hard-wrap`.

### Edits

An edit replaces the body of something the poster's login posted, and nothing
else: no title, label or state. A review's body can't be edited. Read the
item's current body with `gh api repos/<owner>/<name>/<path> --jq .body`,
where the path is `issues/<n>`, `pulls/<n>`, `issues/comments/<id>` or
`pulls/comments/<id>`, and write the `body_file` as the session's part of it:
the text between the poster's own parts, with no signature line and no
`Edited:` line, since the poster adds both. The post names the item (`issue`,
`pr`, `comment`), the item's own `signer` and a `reason`, and the poster
renders the new body as it renders any other (How the poster builds the body),
ending with the item's reason lines carried forward in order and one new line,
as its own paragraph:

```text
Edited: <reason> (<signer>)
```

The line breaks it adds follow the body's: CRLF when the body holds one, else
LF. A reason names the kind of fix ("fixed a wrong link"), never the text
taken out, and is one line of at most 200 characters.

An edit runs in two stages. Before any `gh` call it runs the shape, kind and
owned-line checks and the per-field scans. After the login, the `as` check and
the read of the item, and before it sends, it runs the item's checks, the
reason carry, the content scan of the whole rendered body and the body bound.
So a dry run of an edit reads nothing and prints one fixed line saying which
checks did not run (`edit/ask`, `edit/status`, `edit/confirm`, `post/tracker`,
the reason carry and the content scan of the full body): an edit isn't checked
in full until it is sent.

Before it sends, the poster reads the item and refuses the edit, with nothing
sent, when:

- **another account wrote it** (`edit/author`), or it isn't where the post
  says (`edit/target`): a comment on another issue or pull request, an issue
  number that is a pull request's, or a thread's first comment, which the
  poster never makes. An item another account wrote is read no further, so
  its text never reaches the slower checks below (#394);
- **it isn't signed by `signer`** (`edit/unsigned`), on the item or on the
  rendered body. A signature line is a whole line, outside a fence, a quote
  and a closed HTML comment, that is exactly `Signed: <label>` or `Posted by <label>.`; a
  body that also holds another label's signature line is refused too. A bare
  label is never a signature, so a post signed only with its label, or a pull
  request body with no signature line, can't be edited. A body the poster
  posts always carries its `signer` as the `Signed:` line, and a pull request
  body is signed `pr-<n>`, n the issue it works on, or with no issue the
  session's label. For a body already posted
  unsigned, the owner types the fix on GitHub, from a changed line the
  session scanned with an `issue-comment` post of kind `note` and `--dry-run` (`claude/review.md`, The
  poster);
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
  Text that only mentions the words can't be edited either, and that includes a
  quote whose own words hold them: a post that quotes the words "owner
  decision" is uneditable;
- **it holds what the content scan refuses** (`edit/leak`): a hidden
  character or a live environment secret's value. An edit can't remove it, since GitHub's
  history keeps every version, so tell the owner instead;
- **the new body drops, changes, adds or hides a reason line**
  (`edit/reasons`): the rendered body must end in exactly the item's reason
  lines, in order, then the new line. A `body_file` never holds a reason line
  (`post/owned-line`), nothing above them may open an HTML comment or a fold
  it doesn't close, and reason lines pile up, as the record of each change. A
  **status edit**, `issue-comment-edit` with `signer` `status-<n>` and n the
  `issue` value, is the one exception (#503): the item's reason lines are not
  compared or carried, and the poster adds the newest, so the comment ends in
  exactly one.

The author, target, signature, leak and append-only reason checks are the
edit's controls; on a status edit the append-only check is removed, accepted
by the owner (decision 180, ADR 0144). The record and decision checks, and the
reason lines' "in plain sight" part, are a best-effort backstop: they guess at
how GitHub renders a body, and a form their readings don't see passes (What the
scans don't cover).

The scans that read a post read the edit too: the reason, and the whole
rendered body with its reason line.

The routine use of `issue-comment-edit` is the review procedure's status
comment, signed `status-<n>` and edited after each round (#412); it holds none
of what `edit/record` and `edit/decision` refuse, and as a status edit it ends
in its newest reason line only (#503).

#### Ask items and the read-back

An item is an **ask item** when its body starts with `## The ask` and a blank
line (after the mark line and one `Answers:` line, for a `decision`), a
`## Understood intent` line follows, and the first line after it that reads as
a read-back line comes before the body part. An edit of an ask item carries
the `quote` and `intent` the item holds, and the poster checks that they match
the item's own, byte for byte (`edit/ask`): a posted quote can't be changed
through the poster. A session rebuilds `quote` and `intent` from the posted
item, never from a kept file. A `status` edit and an item that isn't an ask
item carry neither, and a `quote` or `intent` on them is refused
`post/field`.

**An older ask-shaped item is not an ask item.** A body written before the
switch that opens `## The ask` but has no read-back line, such as #524's own,
fails the strict test, so an edit replaces it whole and its ask can't be
carried over. Don't edit one through the poster: post a comment, or ask the
owner to edit it by hand.

An edit may move an ask item's read-back from `pending` to `confirmed` or to
`corrected`, and no other move (`edit/status`). Such a **read-back edit** gives
`intent.comment`, the id of a `decision` comment that heard the owner, and the
poster reads that comment before it sends and refuses `edit/confirm` unless it
meets all of these:

- its author is the `gh` login, and it is on the item's own issue or pull
  request, in the same repo;
- it is an ask item whose first line is `Owner decision, from chat.` and whose
  read-back line is `Read-back: confirmed in this session's chat.`;
- its `Answers:` line names the edited item (`issue <n>`, `pull request <n>`
  or `comment <id>`);
- on a move to `confirmed`, its intent text equals the item's; on a move to
  `corrected`, its intent text equals the edit's `intent.corrected` and
  differs from the item's;
- it has exactly one signature label.

A comment by another author is read no further, no text from the cited comment
reaches the output, and a failed or unusable read ends `unavailable` with
nothing sent. The poster appends `, heard by <label>` to the reason, taking
the label from the cited decision's signature, after the reason's own bound
is checked. A later correction of a corrected item is a new `decision`
comment: the item keeps its first correction, and the work follows the newest
decision.

The session that heard the owner first posts the `decision` (source `chat`,
posted `confirmed`, `answers` naming the item), then edits the original with
that comment's id.

A repo's own rule can still say a text is never edited. In this repo, a
probe's expected result and its run records stay as posted after a run
(`evals/README.md`, Probes); a correction
there is a new comment.

## The post fields

Every surface takes one JSON post file, `--post <file>`, a regular file, not a
link, at most 256 KiB, valid UTF-8 with no byte-order mark, not empty,
parsed with `JSON.parse`. A parse failure, or a top level that isn't an object,
is refused `post/json`, and the parser's message is never printed. The poster
reads own keys only, so `__proto__`, `constructor` and `toString` are unknown
fields. A field's value is checked against its type and pattern. The text
fields are also scanned, each as its own field, so a refusal names it:
`title`, each label, each passage's `text`, `intent.text` and
`intent.corrected`.

| Field | Value | Checked by |
| --- | --- | --- |
| `repo` | `owner/name`; the owner must be the `gh` login, by name and by what GitHub returns for the repo | `post/pattern`, `owner/repo`, `owner/github` |
| `as` | A login the `gh` login must equal; needed when `GH_TOKEN` or `GITHUB_TOKEN` is set | `post/pattern`, `as/differs`, `as/missing` |
| `kind` | One of the nine kinds (Kinds, above); not on an edit | `post/pattern`, `post/kind`, `post/field` |
| `title` | One line of 1 to 120 characters, no space at either end | `post/length`, `post/pattern` |
| `labels` | 0 to 10 label names: letters, digits, spaces and `:._-`, at most 50 characters. A label the repo doesn't have is created by GitHub, and stays | `post/pattern` |
| `answers` | `issue <n>`, `pull request <n>` or `comment <id>`; a `decision` only | `post/pattern`, `post/field` |
| `head`, `base` | A branch; `head` may be `owner:branch` with the repo's own owner | `post/pattern`, `owner/head` |
| `draft` | A boolean; opens the pull request as a draft | `post/type` |
| `issue`, `pr`, `comment` | A positive whole number, a JSON number | `post/type`, `post/pattern` |
| `signer` | The session's label: a lowercase letter or digit, then lowercase letters, digits and hyphens, at most 50 characters | `post/pattern`, `post/signer`, `edit/unsigned` |
| `quote` | 1 to 5 passages (The quote and the read-back) | `post/missing`, `post/when`, `post/tracker`, `post/field` |
| `intent` | The read-back: `text` of 1 to 2,000 characters, a `status`, and on an edit `comment` and `corrected` | `post/status`, `post/owned-line`, `text/hidden-line` |
| `body_file` | A bare file name in the post file's own folder (no slash, backslash or colon, not `.` or `..`), read like the post file; its text at most 65,536 characters, and the whole rendered body too | the `file/` rules, `post/pattern`, `post/owned-line`, `text/body-length` |
| `reason` | An edit's reason: one line of at most 200 characters | `post/length`, `post/pattern` |

`--dry-run` takes no value. It prints the `gh` arguments and the request with
each text replaced by its size, and sends nothing. The post checks, the content
scan, the table check, the fence check and the wrap and link checks all run;
`gh` doesn't, so the login and owner checks don't, nor does the `as` check,
nor the tracker read: a create post's dry run prints one fixed line saying so
(`post/tracker did not run`). A dry run can pass where the real run is refused.

A wrong type is refused `post/type`, a missing required field `post/missing`, a
pattern or enum miss `post/pattern`, an over-length value `post/length`, and a
field no surface knows `post/unknown`. A field the schema knows and the
surface or kind refuses is `post/field`. Each refusal's `where` names the
field by its JSON path, such as `quote[1].when`, never its value; an unknown
key is named by its path only when it can't carry text, else by position.
Two duplicate keys in a post file keep the last, which the poster accepts: the
scan and the check of what landed both read only what is rendered.

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
| 0 | `RESULT: verified <surface> <url> as <login>` | What landed is what was sent | Deletes the post file and the body file |
| 0 | `RESULT: dry-run <surface>` | Nothing was sent | Nothing |
| 1 | `RESULT: mismatch <url>` | Posted, but a field differs; a `MISMATCH` line names each field, and a `NEXT:` line says the post landed and must not be posted again | Never posts again; deletes the post file and the body file; tells the owner which field |
| 1 | `RESULT: unverified <url>` | Posted, but the check of what landed failed or couldn't be read; a `NEXT:` line says the post landed and must not be posted again, with the link, or with only the page it sits on if the poster never read its id | Never posts again; deletes the post file and the body file; opens the URL and tells the owner |
| 2 | `RESULT: refused <count>` | A usage fault or a content refusal; a `REFUSED` line names each rule and where it sits. Nothing was sent | Fixes its own prose, table or link in place and posts again. A lens report refused for hidden characters or a live environment secret's value stays local, unedited, and the owner is told where it is, in chat; a table, wrap, link or fence refusal inside one means its fence is too short: fix the fence. A refusal no text fix clears, or a second one it can't explain: stops and tells the owner |
| 3 | `RESULT: failed` | The post call failed. The post may or may not have landed; a `NEXT:` line names the page to look at and the login to look for | Deletes the post file and the body file; checks whether it landed, as below; never posts again on its own |
| 4 | `RESULT: unavailable` | A read before posting failed (the login or the repo), or the poster failed before sending. Nothing was sent | Deletes the post file and the body file; stops and tells the owner, as `review.md` says. `gh auth status` and the network are what to check |

An edit ends the same ways, with its own words. Its link is the item's,
known before it sends. Its exit 1 `NEXT:` line says the edit landed and must
never be sent again. Its exit 3 line names the item and says to look there for
the reason line. A failed or unusable read of the item, a 404 included,
is exit 4, with nothing sent. A dry run of an edit doesn't read the item, so
the item's checks don't run, and it says so (Edits).

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
| `usage/unknown-option` | Any option but `--post <file>` and `--dry-run`, or any option after `schema`; one fixed `NEXT:` line follows |
| `usage/repeated` | `--post` or `--dry-run` given twice |
| `usage/missing-value` | `--post` with no file after it |
| `usage/missing-option` | `--post` is missing |
| `owner/head` | `head` names another owner than the repo's |
| `owner/repo` | The repo's owner, by name, isn't the `gh` login |
| `owner/github` | The owner GitHub returns for the repo isn't the `gh` login: the name was renamed or moved |
| `as/missing` | A token is set in the environment and `as` isn't given |
| `as/differs` | `as` isn't the `gh` login |
| `post/json` | The post file isn't JSON, or its top level isn't an object; `where` is always `post file` |
| `post/unknown` | A field no surface knows, `__proto__`, `constructor` and `toString` included |
| `post/field` | A field the schema knows but this surface or kind refuses (`kind` on an edit, `reason` on a create, `labels` on a pull request, `answers` off a `decision`, `quote` or `intent` where the kind or item refuses them, `quote[n].comment` off a `tracker` passage, `via` off a `relayed` one) |
| `post/missing` | A required field is missing |
| `post/type` | A field has the wrong type |
| `post/pattern` | A value misses its pattern or enum, such as a `body_file` of `..`, `a/b`, `a\b`, `c:x` or a link name |
| `post/length` | A value is over its bound or under its minimum |
| `post/kind` | A kind on a surface outside its row of the kind table |
| `post/signer` | A `status` post whose `signer` isn't `status-<issue>`, or another kind signed `status-<n>` |
| `post/status` | A create post of `corrected`, one of `confirmed` with a `relayed` or `tracker` passage, or a chat-marked `decision` posted `pending` |
| `post/when` | A passage's `when` isn't a real date, carries a time of day, or is after tomorrow in UTC |
| `post/tracker` | A `tracker` passage whose comment is another author's, in another repo, doesn't hold the passage's text, or whose text outside its `[left out]` spans is under 20 characters, with touching spans or more than three; `where` is `quote[n].comment` or `quote[n].text`, and none of the comment's text is printed |
| `post/owned-line` | A `body_file` outside a fence, or `intent.text` or `intent.corrected`, holds a line the poster owns, or the intent fields hold a heading, a fence opening or an HTML heading |
| `text/hidden-line` | The rendered body, before its `Signed:` line, opens an HTML comment or a fold it doesn't close |
| `file/unreadable` | The file can't be read |
| `file/link` | The file is a link |
| `file/not-regular` | The file isn't a regular file, or it was replaced by another file while it was read |
| `file/size` | The file is over 256 KiB |
| `file/utf8` | The file isn't valid UTF-8 |
| `file/bom` | The file starts with a byte-order mark |
| `file/empty` | The post file or the body file is empty |
| `text/body-length` | The `body_file` text, or the whole rendered body, is over 65,536 characters |
| `edit/author` | The item's author isn't the `gh` login |
| `edit/target` | The item isn't where the post says, or is a pull request read as an issue, or a thread's first comment |
| `edit/unsigned` | The item or the rendered body has no signature line for `signer`, or has one for another label |
| `edit/record` | The item or the new body is a review record |
| `edit/decision` | The item or the new body holds the words "owner decision" |
| `edit/leak` | The item holds what the content scan refuses: a hidden character or a live environment secret's value |
| `edit/reasons` | The rendered body doesn't end in exactly the item's reason lines and the new one, or opens a comment or fold above them it doesn't close; on a status edit, it holds more than the newest |
| `edit/ask` | An edit of an ask item whose `quote` or `intent` differs from the item's own: a passage's text, source, comment or `when`, or the read-back text |
| `edit/status` | A read-back move other than staying, or `pending` to `confirmed` or `corrected`; or a move with no `intent.comment`; or a kept status whose comment or corrected text differs |
| `edit/confirm` | The cited decision isn't the `gh` login's, isn't on the item's own issue or pull request, isn't a chat-marked confirmed ask item, doesn't name the item in `Answers:`, has an intent text the move doesn't match, or doesn't hold exactly one signature label; `where` is `intent.comment`, and none of the comment's text is printed |
| `secret/env` | The value of a secret environment variable; the line names the variable, never the value |
| `text/hidden` | A hidden character |
| `table/header` | A Lens dispositions table's header row isn't exactly `\| Finding \| Lens \| Disposition \| Rerun \|` |
| `table/cells` | A row has the wrong number of cells, or an empty Lens cell |
| `table/disposition` | A Disposition cell doesn't start with `fixed`, `taken`, `dismissed`, `skipped`, `open` or `noted`; or, in a row whose Finding cell is exactly `withheld, see chat`, it is anything but one bare `open`, `fixed`, `taken` or `dismissed` |
| `table/skipped` | `skipped` isn't followed by `, because` |
| `table/auto` | ` (auto` isn't followed by `:`, `)` or `, reversed` |
| `table/state` | A Finding cell doesn't start with a state word (`new`, `updated`, `unchanged` or `absent`), in a row that isn't `skipped` and whose Finding cell isn't exactly `withheld, see chat`; or the word "withheld", in any case, spacing or markup, comes after a state word, after any marks and one severity word (`high`, `medium` or `low`), a `security?` after it and the colon (#478) |
| `fence/unclosed` | A fence is left open: the body ends inside it, or a `mermaid` fence runs into another fence or a fold's tag |
| `text/hard-wrap` | A prose line stops mid-sentence and the next line continues the same paragraph, list item or quote |
| `link/relative` | A link's target has no scheme and isn't an anchor on the same page |

## What the scans cover

The content scan reads the title, each label, each passage's `text`,
`intent.text` and `intent.corrected`, each as its own field so a refusal names
it, and the whole rendered body, as written and as normalised copies, each
meant to show the text as a reader sees it on GitHub's page (#394, ADR 0122):

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
  (threat model, Posts are public): two tricks at once that no single copy reads together,
  a look-alike letter from another script, a renderer other than GitHub's
  comments, or a raw-HTML or markdown structure the page copy reads
  differently from GitHub's page.
- **A quote's provenance.** The fields are unverified (threat model, Who
  counts as you): `source` is the session's own word, so the rule that only a
  `chat` source can confirm a read-back catches a mistaken relay, not a session
  set on getting past it, and a `tracker` passage is checked only against the
  comment it cites, which the poster can't tell from a session's own post under
  the same login. A `[left out]` span is the session's word that it left words
  out, and nothing checks that. A post that quotes the owner is a record of what
  the session said the owner said.
- **A misquote or a leaked span, once posted.** A posted quote can't be changed
  through the poster: an edit of an ask item must keep its quote and read-back
  as they are. The owner edits or deletes it by hand, GitHub's history keeps the
  old text, and a later session's edit carries the quote as the item now holds
  it.
- **An older ask-shaped item.** One that opens `## The ask` but has no read-back
  line isn't an ask item, so the poster can't carry its ask through an edit
  (Edits).
- **Windows file names.** A `body_file` name that ends in a dot or names a
  device is not refused (noted as a hardening candidate, #524).
- **Fields the schema doesn't check beyond their pattern,** which are checked
  against patterns and bounds, not scanned: `repo`, `as`, `signer`, `head`,
  `base` and `via`.
- **The rest of the table:** the reason text, a `skipped` row's Finding cell, the
  Rerun cell, the Auto-takes list, escape and gap tables, a table with no
  leading `|`, and any table inside a fence.
- **The review comment's opening** (#401, #478): its title line, signal
  table, 1 to 3 diagrams and count line, and what the diagrams say. The content scans read
  all of it, diagrams included; the table, wrap and link checks never read
  inside a fence, and nothing checks the counts against the table, the number
  of diagrams, their labels or that a withheld finding stays out.
- **A session that sets out to get past them.** They catch accidents.
- **The poster itself.** Nothing checks the live file before a session runs
  it; the next dry run shows a changed one as drift (threat model, The pact gets loosened).
- **Text already posted.** Posting again doesn't remove it, and nor does an
  edit: GitHub's edit history keeps every earlier version. An edit is never the
  fix for a leak. Tell the owner; rotate a leaked secret, and the owner
  deletes the comment or its history entry by hand.
- **Who signed.** A label is plain text, so any session can sign with any
  label and edit any post signed in the two forms, an owner's comment that
  holds a session's pasted signature line included. The edit checks stop an
  edit of owner-typed text with no signature line, of a review record, and of a
  decision mark; they catch accidents (threat model, Who counts as you).
- **Text already relied on.** An edit can change a post someone has acted on,
  such as an approved spec, a hand-off or a pull request body at merge, and in
  a repo whose rule counts the owner's account's last edit, the item still
  counts. The reason lines and GitHub's history show the change (threat model,
  Who counts as you); on a status comment, which keeps only its newest reason
  line, GitHub's history alone shows the earlier ones, and the round comments
  stay the record. A pull request body signed `pr-<n>` shares its label with
  every pull request on issue n, so a wrong `pr` among them passes too.
- **The best-effort checks' gaps.** The record, decision and "in plain sight"
  checks read the source text, not GitHub's rendered page, so a form their
  readings don't see passes: a look-alike letter outside the fixed set; a
  heading as an HTML element, or a setext heading whose lens name sits on an
  earlier line; an older record layout; fence and comment markup that GitHub
  reads differently from the poster; a fold or comment tag balanced by one in
  a fence, a code span or a closed comment, or carried in a reason; and a
  reason line forged with an entity, emphasis or an escape. They also refuse
  some text that isn't a record, such as a record shape quoted inside a fence.
  These gaps are accepted by class (threat model, Who counts as you); reading GitHub's
  rendered page instead is #419.
- **A change between the read and the write.** The poster reads the item, then
  writes it; a change made between the two is overwritten unseen. A session
  that drafts from its own earlier read widens that window to its drafting
  time, so a change made since, a removed line included, comes
  back. A refusal when the item changed since that read
  is #419.
- **A Claude home elsewhere.** `review.md` names the default
  `~/.claude`; an install with `--claude-home` elsewhere puts the poster
  where the rule doesn't point.
