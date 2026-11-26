# The machine is trusted, and its guards catch mistakes

Amends [ADR 0154](0154-threat-models-are-boundaries-first-and-capped.md)'s scope (spec 0007 S2 items 63 to 70, 73 and 75). The programs, processes and agents the owner starts on the machine, sessions and lenses included, are trusted. The pact guards against their mistakes, never against their turning hostile; one steered by outside text stays in scope. The owner, by voice: "Whatever I start running on my machine, whether it's a process or an agent, we shouldn't be fighting it ... when we protect against mistakes, we don't need to be as robust as protecting against attackers."

## What changed

- **The tree check catches a lens's mistakes.** Its second run may be read from anywhere; a lens that forges it is accepted under Review rests on rules.
- **The install** keeps its temp-then-replace write and every check on what comes from the clone. It loses the checks that re-read something to catch a change between two moments, the file modes set against other accounts, and the refusal of a `NODE_OPTIONS` preload.
- **Clef's supervisor takes no token.** Any program on the machine may call it; `Host` and `Origin` still keep web pages out.
- **The cleaner, the poster and the hand-off hook** lose their swap, hooks and planted-link re-checks and the hand-off folder's owner-only mode.
- **No rule keeps the owner's user name, home path or live settings' names out of a post or a commit.** "Never post a secret" stays.
- **Releases need no app or key** (spec 0007 S2 item 74): the release job tags candidates with its own token, and only the owner creates a stable tag, so [ADR 0173](0173-the-threat-model-takes-codex-and-antigravity.md)'s release app and its key are gone.
- **The threat model** files what starts and ends on the machine as the machine's and drops its hostile-agent lines and open gaps.

## What stays

Guards at the outside boundary: outside tracker and pull request text, outsiders' code, a clone's files and programs, downloads and the network, release tags, and secrets leaving in a post. Rules on whose words count, since they stop outside text passed on by a steered session from counting as the owner's. The deny and ask rules, as speed bumps. `gh-app`'s refusals of `auth`, `extension`, `alias`, `config` and a leading flag, which keep the bot's token out of the owner's own `gh` login and settings.

## What it costs

- A program or agent on the machine that does turn hostile, such as a lens steered by what it reads, meets no race or forgery check. What it sends out still counts under Text steers a session.
- Other accounts on the machine can read backups, Clef's run files and hand-off notes the install and tools wrote with default modes.
