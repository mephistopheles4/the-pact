# The poster as an agent app

With the agent-identity switch on, an app pinned in
`~/.claude/pact/github.json` and `gh-app.mjs` installed under
`~/.claude/pact/tools/` beside the poster (the pin's definition,
[agent-identity](agent-identity.md)), the poster is in **app mode**: every post
and edit goes out as the bot of the pinned app whose bot login is the post's
`as`, else `claude`'s, on a `post`-set installation token the helper mints for
that provider and the one repo. With any of those absent, or no app named and no
`claude` entry, the poster is as [poster.md](poster.md) says,
posting as your `gh` login, and none of this applies: a checkout's copy, with the
switch off, stays yours. A `github.json` that isn't the pinned shape stops the
run (`pin/check`) and never reads as owner mode. The home folder is the
environment's, as for the pin file and the helper.

## What changes in app mode

- **`as` is required** and must be a pinned bot's login, matched exactly (`as/not-app`, told with the
  other content refusals, so a dry run shows it).
- **The pin is checked once per run,** against GitHub's own records, by the
  helper's pin check: the app's id, owner and exact permissions with no event
  subscribed, the bot's login, id and type, and `GET user` under your own `gh`
  login against the pin's owner. A check that fails or can't run ends
  `REFUSED pin/check pin`. A refused or failed mint ends `REFUSED app/token token`.
  Each carries one `NOTE:` line naming only the helper's fixed reason id. Nothing
  is sent, and nothing falls back to your login.
- **Reads stay yours.** The repo read, the item an edit reads, a tracker comment
  and every read-back run on your `gh` login with the token variables stripped.
  Only the POST or PATCH carries the app's token.
- **Which login each check compares.** `as`, `edit/author` and the read-back's
  author are the bot. `post/tracker` and the repo's owner (`owner/repo` by the
  pin's login, `owner/github` by its id) are the pin's owner, so a tracker
  comment the app wrote is refused when quoted as the owner's.
- **The token is a secret.** A field or body that holds it is refused
  `secret/env` (named `app token`), and a `gh` error line that holds it is
  withheld.
- **A dry run** still checks `as`, reads nothing, mints nothing, and says
  `dry-run: the pin check and the token mint did not run`.

## Decisions from chat

A `decision` whose passages are all `chat` opens `Heard in chat by <signer>.`,
never `Owner decision, from chat.`, so the record never shows the owner's mark
under the bot. That line is an owned line in either mode (a `body_file` can't
hold it: `post/owned-line`), and an item that holds one isn't edited
(`edit/decision`).

`edit/confirm` accepts a decision by the pin's owner with the owner's mark, or by
the bot with a `Heard in chat by <label>.` line naming its own signature label;
a mark under the other author, or naming another label, is refused. The reason
then reads `, confirmed, as heard in chat by <label>` where the owner's mark's
reads `, heard by <label>`.

## Rule ids

| Rule | Refused when |
| --- | --- |
| `as/not-app` | `as` is missing or isn't the app's bot login |
| `pin/check` | `github.json` isn't the pinned shape, or the pin check fails or can't run |
| `app/token` | the helper refused or failed to mint the `post` token |

Every one ends exit 2 with nothing sent, as in [poster.md](poster.md).
