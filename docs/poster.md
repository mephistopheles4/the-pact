# The poster

The poster posts free text to GitHub as your `gh` account, and edits what a
session posted there, then reads back what landed and checks it against what
it sent. It is a pact tool, off unless
the `tools` list in `~/.pact/config.json` names it. When it's
on, the install puts it at `~/.pact/tools/poster.mjs`, and the rules
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

With an agent app pinned, the poster posts as the app: [poster-app](poster-app.md).

In this page, "a session" is the Claude Code session running the poster, and
"the owner" is the person whose `gh` account it posts as.

<!-- toc -->

- [Running it](#running-it)
- [Surfaces](#surfaces)
  - [Kinds](#kinds)
  - [The quote and the read-back](#the-quote-and-the-read-back)
  - [The two quotes](#the-two-quotes)
  - [How the poster builds the body](#how-the-poster-builds-the-body)
  - [Edits](#edits)
- [The post fields](#the-post-fields)
- [Results and exit codes](#results-and-exit-codes)
  - [After exit 3: did it land?](#after-exit-3-did-it-land)
- [Rule ids](#rule-ids)
- [What the scans cover](#what-the-scans-cover)
- [What the scans don't cover](#what-the-scans-dont-cover)

<!-- /toc -->

## Running it

Each shell gets its own command form, as `review.md` gives them:

- **A POSIX shell** (Git Bash, Linux, macOS):
  `node ~/.pact/tools/poster.mjs <surface> --post <file> [--dry-run]`
- **PowerShell:**
  `node "$HOME/.pact/tools/poster.mjs" <surface> --post <file> [--dry-run]`

Those two forms and `schema` (below) are the only ones. Any other option is
refused `usage/unknown-option`, on every surface and on the edits too, with no
window where an old form still works, and one fixed `NEXT:` line says the poster
takes a JSON post now and points to `node poster.mjs schema` and the Posting
section of `~/.pact/review.md`. The line holds no argument the session
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
is why the body is a file and only the short text (title, quote, read-back)
is inline. As `review.md` says, delete both files once their post
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
didn't. A lens report kept after a refusal sits unencrypted in that session's
scratch folder, which the session named to the owner in chat: delete it by
hand. It may also stay in the saved transcript; for a secret, rotating it is
the fix, as for posted text.

## Surfaces

| Surface | What it makes | Its own post fields |
| --- | --- | --- |
| `issue` | An issue, with any labels | `kind`, `title`, `labels`, `quote`, `intent` |
| `pull-request` | A pull request from a branch in the same repo | `kind`, `title`, `head`, `base`, `draft`, `quote`, `intent` |
| `issue-comment` | A comment on an issue or a pull request's conversation | `kind`, `issue`, `answers` (a `decision` only), `quote`, `intent` |
| `pull-request-review` | A review that only comments, never approving or asking for changes, with a body and no line comments | `kind`, `pr`, `quote`, `intent` |
| `review-thread-reply` | A reply in an existing line-comment thread on a pull request | `kind`, `pr`, `comment` (the id of the thread's review comment), `quote`, `intent` |
| `issue-edit` | A new body for an issue | `issue`, `quote`, `intent` |
| `pull-request-edit` | A new body for a pull request | `pr`, `quote`, `intent` |
| `issue-comment-edit` | A new body for a comment on an issue or a pull request's conversation | `issue`, `comment` (the id of the comment edited), `quote`, `intent` |
| `review-thread-reply-edit` | A new body for a reply in a line-comment thread | `pr`, `comment` (the id of the reply edited), `quote`, `intent` |

Every surface also takes `repo`, `signer` and `body_file`, and may take `as`.
`quote` and `intent` are required or refused by kind on a create post, and on
an edit the item decides (Edits, below). An `issue`, `pull-request` or `spec`
post, and an edit of an item that has them, also takes `intent_none` and
`start_none` (The two quotes, below).

The documented post for each surface, as the poster's own `EXAMPLES` hold them
as JSON objects. Each goes in its own post file, beside the `body_file` it
names:

```json
{ "repo": "you/your-repo", "kind": "issue", "title": "A clear one-line title", "labels": ["bug"], "signer": "plan-12", "quote": [{ "text": "The words the owner said, exactly.", "source": "chat", "when": "2026-11-11", "role": "both" }], "intent": { "text": "What the session took those words to mean.", "status": "pending" }, "body_file": "body.md" }
{ "repo": "you/your-repo", "kind": "pull-request", "title": "A clear one-line title", "head": "my-branch", "base": "main", "draft": true, "signer": "pr-12", "quote": [{ "text": "The words the owner said, exactly.", "source": "chat", "when": "2026-11-11", "role": "both" }], "intent": { "text": "What the session took those words to mean.", "status": "pending" }, "body_file": "body.md" }
{ "repo": "you/your-repo", "kind": "note", "issue": 12, "as": "you", "signer": "build-12", "body_file": "comment.md" }
{ "repo": "you/your-repo", "kind": "review", "pr": 34, "signer": "review-34", "body_file": "review.md" }
{ "repo": "you/your-repo", "kind": "reply", "pr": 34, "comment": 5678, "signer": "build-34", "body_file": "reply.md" }
{ "repo": "you/your-repo", "issue": 12, "signer": "build-12", "body_file": "body.md" }
{ "repo": "you/your-repo", "pr": 34, "signer": "pr-34", "body_file": "body.md" }
{ "repo": "you/your-repo", "issue": 12, "comment": 4321, "signer": "build-12", "body_file": "comment.md" }
{ "repo": "you/your-repo", "pr": 34, "comment": 8765, "signer": "build-34", "body_file": "reply.md" }
```

They are the nine examples, one per surface in the table's order; the
`EXAMPLES` map holds the same objects, and a test runs each as a dry run. This
block is kept equal to the map by hand, since no test reads this page. The four
edit examples edit an item that is not an ask item. An edit of an ask item
(any issue, pull request, spec or decision posted with a quote) also carries
that item's own `quote` (or `intent_none` and `start_none`) and `intent`, copied from the item (Edits). A
`pull-request-edit` signs as the create example does.

### Kinds

A create post declares a `kind`, and a fixed table ties each kind to the
surfaces it may go to and to its quote and read-back:

| Kind | Surfaces | `quote` and `intent` | Rendered mark |
| --- | --- | --- | --- |
| `issue` | `issue` | required: two quotes, each a passage or a no-owner-words reason (The two quotes) | none |
| `pull-request` | `pull-request` | required: two quotes, each a passage or a no-owner-words reason | none |
| `spec` | `issue-comment` | required: two quotes, each a passage or a no-owner-words reason | none |
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

- `chat`: the owner said it in this session's chat.
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

A quoted create post takes `intent`, or `intent_skip` in its place, never both: a
one-line reason (at most 200 characters) that there is no reading to give. A
`decision` takes no `intent_skip`. The body shows it as `## Understood intent`,
then `Skipped: <reason>`, with no read-back line, and it is an ask item an edit
carries as `quote` and `intent_skip`, word for word.

`intent` is the session's read-back of the quote, with a `status`:
`pending`, `confirmed` or `corrected`. A create post takes `pending`, or
`confirmed` only when there is a passage and every passage's source is `chat`
(`post/status` otherwise): a relay or a goal holder's reply never confirms a
read-back. No work waits on a pending one (`review.md`). `corrected` and
`intent.comment` are refused on a create post. The
poster renders the read-back line itself:

- `Read-back: not yet confirmed.` for `pending`
- `Read-back: confirmed in this session's chat.` for a `confirmed` create post
- `Read-back: confirmed in comment <id>.` and `Read-back: corrected in comment <id>.`
  after an edit moves the status, with the struck original and the corrected
  text for a correction

`intent.text`, `intent.corrected`, `intent_skip`, `intent_none` and `start_none` are refused `post/owned-line` when a line
holds a heading, a fence opening, an HTML heading tag or one of the poster's
owned lines (below), read as that section says. An unclosed HTML comment or fold in the body before the signature is refused `text/hidden-line`.

### The two quotes

An `issue`, `pull-request` or `spec` carries two of the owner's quotes: the
words that started the intent and the words that started this task. Each
passage has a `role`: `intent`, `start`, or `both` for one passage that did
both. Each of the two is a passage with that role, or a one-line reason in
`intent_none` or `start_none` (1 to 200 characters, the form of `intent_skip`)
that no owner words are behind it, such as `it came from a session's note`.
`intent_none` is about the quote; `intent_skip` is about the read-back. A post
that leaves a side with neither, or fills it with both, is refused
(`post/missing quote.intent` or `quote.start`, `post/field`), and a passage
with no `role` is refused `post/missing quote[n].role`. With both sides
reasoned, `quote` may be left out. A `decision` quotes the owner's decision
words, takes no `role`, `intent_none` or `start_none`, and keeps its one
`quote`.

The source line ends with ` Started the intent.`, ` Started the task.` or
` Started the intent and the task.`, and a reason shows as `No owner words
started the intent: <reason>` or `No owner words started the task: <reason>`,
after the passages. An item posted before the roles has neither line, and an
edit carries what the item holds.

### How the poster builds the body

The poster owns these parts and renders them in this order, one blank line
between each: for a `decision`, the mark line and the `Answers:` line when
`answers` names the item (`issue <n>`, `pull request <n>` or `comment <id>`);
`## The ask` with each passage as a block quote and a source line, then any no-owner-words line;
`## Understood intent` with the intent text and its read-back line; the `body_file` text;
`Signed: <signer>`. So this repo's PR checkbox line opens the `body_file`, not
the whole PR body.

The **owned lines** are the lines the poster writes: a `Signed:` or `Posted by`
signature line, a decision mark, a line starting `Read-back:`,
`## The ask`, `## Understood intent`, a source line, `Corrected read-back:` and
a line starting `Answers:`. The source line follows its passage, and is one of:

- `Said in this session's chat, <when>.` for a `chat` passage
- `Relayed by <via> from its chat, <when>.` for a `relayed` one
- `From the owner's comment <comment>, <when>.` for a `tracker` one

Each ends with its role line when it has one, and a line starting `No owner
words started the intent:` or `No owner words started the task:` is owned too.

A `body_file` that holds one outside a fence is refused `post/owned-line`. The
poster matches a line in any case and behind quote and list markers, with its
format characters removed, as written and after NFKC. It folds no markup, no
entities and no look-alike letters.

### Edits

An edit replaces the body of something the poster's login posted, and nothing
else: no title, label or state. A review's body can't be edited. Read the
item's current body with `gh api repos/<owner>/<name>/<path> --jq .body`,
where the path is `issues/<n>`, `pulls/<n>`, `issues/comments/<id>` or
`pulls/comments/<id>`, and write the `body_file` as the session's part of it:
the text between the poster's own parts, with no signature line, since the
poster adds it. The post names the item (`issue`, `pr`, `comment`) and the
item's own `signer`, and the poster renders the new body as it renders any
other (How the poster builds the body). It appends nothing else: GitHub's edit
history shows what changed.

An edit runs in two stages. Before any `gh` call it runs the shape, kind and
owned-line checks and the per-field scans. After the login, the `as` check and
the read of the item, and before it sends, it runs the item's checks, the
content scan of the whole rendered body and the body bound. So a dry run of an
edit reads nothing and prints one fixed line saying which checks did not run
(`edit/ask`, `edit/status`, `edit/confirm`, `post/tracker` and the content scan
of the full body): an edit isn't checked in full until it is sent.

The author, target and signature checks are the edit's controls. The decision
check is a best-effort backstop: it reads the source text, not GitHub's
rendered page, and a form its readings don't see passes (What the scans don't
cover).

The routine use of `issue-comment-edit` is the review procedure's status
comment, signed `status-<n>` and edited after each round; it never holds what
`edit/decision` refuses.

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
switch that opens `## The ask` but has no read-back line, and no `Skipped: ` reason under the heading,
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
nothing sent. A later correction of a corrected item is a new `decision`
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
`title`, each label, each passage's `text`, `intent.text`,
`intent.corrected`, `intent_skip`, `intent_none` and `start_none`.

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
| `signer` | The session's label: a lowercase letter or digit, then lowercase letters, digits and hyphens, at most 50 characters; or `pr-<KEY>-<n>`, KEY a capital, then 1 to 9 capitals or digits | `post/pattern`, `post/signer`, `edit/unsigned` |
| `quote` | 1 to 5 passages (The quote and the read-back), each with a `role` on an `issue`, `pull-request` or `spec` | `post/missing`, `post/when`, `post/tracker`, `post/field`, `post/pattern` |
| `intent_none`, `start_none` | In place of that quote's passages: one line, 1 to 200 characters, with no leading or trailing space, why no owner words are behind it (The two quotes) | `post/missing`, `post/pattern`, `post/length`, `post/field`, `post/owned-line`, `text/hidden-line` |
| `intent` | The read-back: `text` of 1 to 2,000 characters, a `status`, and on an edit `comment` and `corrected` | `post/status`, `post/owned-line`, `text/hidden-line` |
| `intent_skip` | In place of `intent`: one line, 1 to 200 characters, with no leading or trailing space, why there is no reading | `post/missing`, `post/pattern`, `post/length`, `post/field`, `post/owned-line`, `text/hidden-line` |
| `body_file` | A bare file name in the post file's own folder (no slash, backslash or colon, not `.` or `..`), read like the post file; its text at most 65,536 characters, and the whole rendered body too | the `file/` rules, `post/pattern`, `post/owned-line`, `text/body-length` |

`--dry-run` takes no value. It prints the `gh` arguments and the request with
each text replaced by its size, and sends nothing. The post checks and the
content scan run;
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
sees this page still knows. An exit 2 prints one `NEXT:` line for each rule it
refused, above `RESULT:`, saying what to do instead: every rule below but the
`owner/` and `as/` ones, whose `where` already names the login or the repo to
fix. The exit 1 and exit 3 line's
page and login are the ones the poster checked before it sent, never text from
`gh` or the body.

| Exit | Last line | What it means | What a session does |
| --- | --- | --- | --- |
| 0 | `RESULT: verified <surface> <url> as <login>` | What landed is what was sent | Deletes the post file and the body file |
| 0 | `RESULT: dry-run <surface>` | Nothing was sent | Nothing |
| 1 | `RESULT: mismatch <url>` | Posted, but a field differs; a `MISMATCH` line names each field, and a `NEXT:` line says the post landed and must not be posted again | Never posts again; deletes the post file and the body file; tells the owner which field |
| 1 | `RESULT: unverified <url>` | Posted, but the check of what landed failed or couldn't be read; a `NEXT:` line says the post landed and must not be posted again, with the link, or with only the page it sits on if the poster never read its id | Never posts again; deletes the post file and the body file; opens the URL and tells the owner |
| 2 | `RESULT: refused <count>` | A usage fault or a content refusal; a `REFUSED` line names each rule and where it sits. Nothing was sent | Fixes what the `REFUSED` lines name and posts again. A lens report refused for hidden characters or a live environment secret's value stays local, unedited, and the owner is told where it is, in chat. A refusal no text fix clears, or a second one it can't explain: tells the owner and goes on |
| 3 | `RESULT: failed` | The post call failed. The post may or may not have landed; a `NEXT:` line names the page to look at and the login to look for | Checks whether it landed, as below, and never posts again on its own; then deletes the post file and the body file |
| 4 | `RESULT: unavailable` | A read before posting failed (the login or the repo), or the poster failed before sending. Nothing was sent | Deletes the post file and the body file; tells the owner and goes on, as `review.md` says. `gh auth status` and the network are what to check |

An edit ends the same ways, with its own words. Its link is the item's,
known before it sends. Its exit 1 `NEXT:` line says the edit landed and must
never be sent again. Its exit 3 line names the item and says to compare its body
with the body that was sent. A failed or unusable read of the item, a 404 included,
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
- **`issue-edit`, `pull-request-edit`, `issue-comment-edit`, `review-thread-reply-edit`:** open the link the `NEXT:` line names and compare the item's body with the body file you sent, between the poster's own parts; if they match, never send the edit again, and tell the owner its link

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
| `usage/unknown-option` | Any option but `--post <file>` and `--dry-run`, or any option after `schema`; one fixed `NEXT:` line follows, and it stands for a missing `--post` too |
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
| `post/field` | A field the schema knows but this surface or kind refuses (`kind` on an edit, `labels` on a pull request, `answers` off a `decision`, `quote`, `intent`, `intent_skip`, `intent_none` or `start_none` where the kind or item refuses them, a quote side given both a passage and its reason, `role` off an `issue`, `pull-request` or `spec`, `quote[n].comment` off a `tracker` passage, `via` off a `relayed` one) |
| `post/missing` | A required field is missing, or a quote side has neither a passage nor its reason |
| `post/type` | A field has the wrong type |
| `post/pattern` | A value misses its pattern or enum, such as a `body_file` of `..`, `a/b`, `a\b`, `c:x` or a link name |
| `post/length` | A value is over its bound or under its minimum |
| `post/kind` | A kind on a surface outside its row of the kind table |
| `post/signer` | A `status` post whose `signer` isn't `status-<issue>`, or another kind signed `status-<n>` |
| `post/status` | A create post of `corrected`, one of `confirmed` with a `relayed` or `tracker` passage, or a chat-marked `decision` posted `pending` |
| `post/when` | A passage's `when` isn't a real date, carries a time of day, or is after tomorrow in UTC |
| `post/tracker` | A `tracker` passage whose comment is another author's, in another repo, doesn't hold the passage's text, or whose text outside its `[left out]` spans is under 20 characters, with touching spans or more than three; `where` is `quote[n].comment` or `quote[n].text`, and none of the comment's text is printed |
| `post/owned-line` | A `body_file` outside a fence, or `intent.text`, `intent.corrected`, `intent_skip`, `intent_none` or `start_none`, holds a line the poster owns, or the intent fields hold a heading, a fence opening or an HTML heading |
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
| `edit/decision` | The item or the new body holds the words "owner decision" |
| `edit/ask` | An edit of an ask item whose `quote`, `intent`, `intent_skip`, `intent_none` or `start_none` differs from the item's own: a passage's text, source, comment, `when` or `role`, a no-owner-words reason, or the read-back text |
| `edit/status` | A read-back move other than staying, or `pending` to `confirmed` or `corrected`; or a move with no `intent.comment`; or a kept status whose comment or corrected text differs |
| `edit/confirm` | The cited decision isn't the `gh` login's, isn't on the item's own issue or pull request, isn't a chat-marked confirmed ask item, doesn't name the item in `Answers:`, has an intent text the move doesn't match, or doesn't hold exactly one signature label; `where` is `intent.comment`, and none of the comment's text is printed |
| `secret/env` | The value of a secret environment variable; the line names the variable, never the value |
| `text/hidden` | A hidden character |

## What the scans cover

The content scan reads each text field above and the whole rendered body: as
written; as two normalised copies, one with HTML comments removed and one with
only their markers removed; and as the first copy with each link folded to its
text and the marks `*`, `` ` ``, `~`, `[` and `]` removed. A normalised copy has
invisible and control characters, markdown escapes and inline tags removed,
character references decoded and NFKC applied, again until nothing changes, at
most five rounds. It decodes a number of at most seven decimal or six hex
digits, and a name, with its semicolon, only from a short list in the poster's
source, which holds every name whose value is a hidden character
([ADR 0177](adr/0177-the-poster-keeps-its-controls-and-drops-accident-checks.md)).

Control characters are stripped though GitHub's comments show most of them
as U+FFFD: stripping only ever adds refusals. The lists of names below are
kept by hand from the poster's source; no test holds them.

- **No token-shape, URL-password or email rule.** The scan refuses no
  credential shape, password in a link or email address: the pact has
  no rule on a secret or a personal detail in a session's own text.
- **`secret/env`:** the value, 8 characters or more, of any environment
  variable whose name has a part ending in `TOKEN`, `SECRET`, `KEY`,
  `PASSWORD`, `PASSWD`, `PWD`, `PAT`, `AUTH`, `CREDENTIAL`, `CREDENTIALS` or
  `COOKIE`, except `PWD`, `OLDPWD` and `SSH_AUTH_SOCK`. In a Codex shell, the
  pact's [shell policy](install.md#codexs-shell-environment-policy) drops the
  names with `KEY`, `SECRET` or `TOKEN`, so the poster can't refuse their values
  there.
- **No path rule.** The scan refuses no path, this machine's own home and
  temp folders, user name and host name included.
- **No session-id rule.** The scan refuses no UUID, `session_` id or Claude
  Code session link, so a scratchpad path, a GitHub attachment link and
  Claude Code's attribution post on any surface. A session
  link opens only for the account that owns the session.
- **`text/hidden`:** tag characters (a subdivision flag aside), direction
  embeddings, overrides and isolates, the zero-width space, word joiners, the
  rarer variation selectors, and a byte-order mark inside the text, each written
  as the character itself. The joiners and selectors ordinary emoji use are let
  through.

## What the scans don't cover

- **Any secret or personal detail** other than a live environment secret's
  value: a token `gh` keeps in a credential store, a key in a file, a name,
  an email address.
- **A refused value written in a form no copy reads as the page does**
  (threat model, Posts are public): a look-alike letter from another script, a
  renderer other than GitHub's comments, two tricks at once that no single copy
  reads together, or a form only a page-faithful reading would catch:
  - a character reference past the digit cap, or a name off the short list or
    written without its semicolon;
  - a tag shape the page shows as text and the copies remove: one made by
    decoding, in a fence or code span, escaped, with a tag name GitHub filters,
    with a no-break space, or one HTML's grammar rejects;
  - raw HTML the page hides or ends where the copies don't, such as a processing
    instruction, a declaration or a CDATA section;
  - a tag carried onto the next line of a block quote.
- **An encoded hidden character,** such as `&#x200B;`, `&#8203` or
  `&ZeroWidthSpace;`: every copy strips the character it decodes to.
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
  (or skip reason) as they are. The owner edits or deletes it by hand, GitHub's history keeps the
  old text, and a later session's edit carries the quote as the item now holds
  it.
- **An older ask-shaped item.** One that opens `## The ask` but has no read-back
  line or `Skipped: ` reason isn't an ask item, so the poster can't carry its ask through an edit
  (Edits).
- **Windows file names.** A `body_file` name that ends in a dot or names a
  device is not refused (noted as a hardening candidate).
- **Fields the schema doesn't check beyond their pattern,** which are checked
  against patterns and bounds, not scanned: `repo`, `as`, `signer`, `head`,
  `base` and `via`.
- **The body's shape.** No check reads a table, a fence, line wrapping or a
  link's target. A create post whose body leaves a fence open posts, and the
  fence then swallows its own `Signed:` line, so every later edit of it is
  refused `edit/unsigned`.
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
  edit of owner-typed text with no signature line and of a decision mark; they
  catch accidents (threat model, Who counts as you).
- **Text already relied on.** An edit can change a post someone has acted on,
  such as an approved spec, a hand-off or a pull request body at merge, and in
  a repo whose rule counts the owner's account's last edit, the item still
  counts. Only GitHub's edit history shows the change (threat model, Who counts
  as you); for a status comment, the round comments stay the record. A pull
  request body signed `pr-<n>` shares its label with every pull request on issue
  n, so a wrong `pr` among them passes too.
- **The decision mark and owned lines in disguise.** The checks read the source
  text, plain and after NFKC, not GitHub's rendered page, so a decision mark or
  an owned line written with a look-alike letter, markup such as bold, or an
  entity passes. These gaps are accepted by class (threat model, Who counts as
  you); reading GitHub's rendered page instead is #419.
- **A change between the read and the write.** The poster reads the item, then
  writes it; a change made between the two is overwritten unseen. A session
  that drafts from its own earlier read widens that window to its drafting
  time, so a change made since, a removed line included, comes
  back. A refusal when the item changed since that read
  is #419.
- **A home folder elsewhere.** `review.md` names `~/.pact`; an install with
  `--home` elsewhere puts the poster where the rule doesn't point.
