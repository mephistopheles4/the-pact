# The poster

The poster posts and edits on GitHub as the owner's `gh` login, from one JSON
post, then reads back what landed and checks it against what it sent. It is a
pact tool, off unless the `tools` list in `~/.claude/pact/config.json` names
it. When it's on, the install puts it at `~/.claude/pact/tools/poster.mjs`, and
the rules file tells a session to post through it. Its scans catch accidents,
not a session that sets out to get past them; its refusal of a live
environment secret's value is the only secret check, and only where the poster
is on (threat model, Posts are public). It needs Node 24 or later and `gh`,
signed in.

Permission rules on `gh` commands don't see the poster's calls, because the
poster starts `gh` itself; to gate posting, put a rule on the poster's own
command. In auto mode, Claude Code's classifier does see the call, and may
stop a post until the owner allows it.

## Running it

- **The schema:** `node poster.mjs schema` prints the post's JSON Schema, sends nothing and exits 0; `review.md` gives each shell's command form.
- **The files:** a post is one JSON file, `--post <file>`, and its body is a second file it names, `body_file`, in the same folder; `--dry-run` runs every check that needs no `gh` call and sends nothing, so it can pass where the real run is refused.
- **A killed session:** nothing deletes a file the session didn't, so delete a post or kept report it left behind by hand.

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

### The quote and the read-back

- **The quote:** 1 to 5 passages of the owner's words verbatim, each with a `when` and a `source`: `chat` (this session's chat), `relayed` (a lead passed it on; `via` names it) or `tracker` (an owner comment, `comment` its id, which the poster reads and matches before it sends).
- **The read-back:** `intent` is the session's reading of the quote, `pending`, `confirmed` or `corrected`; a create post is `confirmed` only when every passage's source is `chat`.
- **The body:** the poster renders, in order, a `decision`'s mark and `Answers:` lines, `## The ask` with each passage and its source line, `## Understood intent` with the read-back line, the `body_file` text, `Signed: <signer>` and, on an edit, the reason lines; these are its **owned lines**, refused `post/owned-line` in a `body_file` or the intent.

### Edits

An edit replaces the body of something the poster's login posted, and nothing
else: no title, label or state. A review's body can't be edited. Read the
item's current body with `gh api repos/<owner>/<name>/<path> --jq .body`,
where the path is `issues/<n>`, `pulls/<n>`, `issues/comments/<id>` or
`pulls/comments/<id>`, and write the `body_file` as the session's part of it:
the text between the poster's own parts, with no signature line and no
`Edited:` line, since the poster adds both. The post names the item (`issue`,
`pr`, `comment`), the item's own `signer` and a `reason`, and the poster
renders the new body as it renders any other (The quote and the read-back),
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
  its text never reaches the slower checks below;
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
  `issue` value, is the one exception: the item's reason lines are not
  compared or carried, and the poster adds the newest, so the comment ends in
  exactly one.

The author, target, signature, leak and append-only reason checks are the
edit's controls; on a status edit the append-only check is removed, accepted
by the owner. The record and decision checks, and the
reason lines' "in plain sight" part, are a best-effort backstop: they guess at
how GitHub renders a body, and a form their readings don't see passes (What the
scans don't cover).

The scans that read a post read the edit too: the reason, and the whole
rendered body with its reason line.

The routine use of `issue-comment-edit` is the review procedure's status
comment, signed `status-<n>` and edited after each round; it holds none
of what `edit/record` and `edit/decision` refuse, and as a status edit it ends
in its newest reason line only.

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

**An older ask-shaped item,** one that opens `## The ask` with no read-back line, is not an ask item: don't edit it through the poster; post a comment, or ask the owner to edit it by hand.

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

A repo's own rule can still say a text is never edited. In this repo, a
probe's expected result and its run records stay as posted after a run
(`evals/README.md`, Probes); a correction
there is a new comment.

## Results and exit codes

The last line is always a `RESULT:` line on standard output. The lines above
it name rules, fields, positions and sizes, never the text. On exit 1 and exit
3, a `NEXT:` line straight above it says what the session does next. The
poster never retries.

| Exit | Last line | What it means |
| --- | --- | --- |
| 0 | `RESULT: verified <surface> <url> as <login>` | What landed is what was sent |
| 0 | `RESULT: dry-run <surface>` | Nothing was sent |
| 1 | `RESULT: mismatch <url>` | Posted, but a field differs; a `MISMATCH` line names each field |
| 1 | `RESULT: unverified <url>` | Posted, but the check of what landed failed or couldn't be read |
| 2 | `RESULT: refused <count>` | A usage fault or a content refusal; a `REFUSED` line names each rule and where it sits. Nothing was sent |
| 3 | `RESULT: failed` | The post call failed, and the post may or may not have landed |
| 4 | `RESULT: unavailable` | A read before posting failed, or the poster failed before sending. Nothing was sent |

An edit ends the same ways, with the item's own link. A fault inside the
poster ends as exit 4 before it sends, exit 3 while it sends, and exit 1 after.

## What the scans cover

The content scan reads each text field and the whole rendered body, as written
and as normalised copies meant to show the text as GitHub's page does, and
refuses a live environment secret's value (`secret/env`) and hidden characters
(`text/hidden`), but no token shape, email address, path or session id. On the
body only, the table, fence, wrap and link checks then refuse a malformed Lens
dispositions table, an unclosed fence, a hard-wrapped paragraph and a relative
link. A refusal on a line inside a lens report means the report's fence is too
short: fix the fence, never the report.

## What the scans don't cover

- **Any secret or personal detail** but a live environment secret's value, and refused text in a form no copy reads as GitHub's page does (threat model, Posts are public).
- **A session that sets out to get past them,** a quote's provenance, and who signed: a source and a label are the session's word (threat model, Who counts as you).
- **Text already posted or relied on:** GitHub's history keeps every version, so an edit never fixes a leak; tell the owner, who rotates a leaked secret and deletes the text by hand.
