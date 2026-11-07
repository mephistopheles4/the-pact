# A session keeps its place through auto-compaction

Every install and every cloud session now sets Claude Code's auto-compact window to 400000 tokens and installs one hook script, `pact/hooks/compact-handoff.mjs`, called from five hook entries in `settings.json` (#482). The `auto-compact-window` setting moves the window or, at `0`, turns all of it off; the cloud has no Off. The settings overlay carries the hooks block, and `hooks` is no longer a banned key in seam A or the install.

This reverses the part of #34 (2026-10-01, "Hold the settings overlay to an exact allow-list") that banned `hooks` in the overlay so that no change to the overlay could make every session run a command. It also records two choices the owner made for this change.

## What changes

- `hooks` leaves `BANNED_SETTINGS` in `gate/seam-a-core.mjs` and `gate/install-core.mjs`; the other eleven banned keys stay. The allow-list holds the pact's hooks block exactly, tokens included, and nothing checks a hook command's shape beyond that.
- The pact's hooks never go through the deep merge. They merge by key: a pact entry is an inner hook equal to the overlay's for that event, its window aside, with the installed script's path as its first argument. The first group holding one is updated in place, and only that inner hook when the owner's own command shares its group; a missing one is added after the event's other groups; a second copy is taken out. Every other hook, the owner's or another tool's, stays as it was, and a hook that names the script but is not the pact's entry draws the dry run's warning. Off removes only the pact's inner hooks, and a group, an event or `hooks` only when that leaves it empty. The installer and the cloud's jq do the same.
- The dry run warns, once per event, of a hook the pact did not install, and lists each pact event it adds, updates or removes.
- A rollback past this change needs the window turned off first (install docs).

## Why

A session that auto-compacts loses its place. The owner: "remove the ban, hooks are important", and "for cloud sessions I don't see why we would disable it by default, I think it's important to have it on at 400k at default for all sessions". On by default means the cloud has no Off, and a change that turns it off is a commit merged on the owner's word.

## Choices the owner made

- **This change took no sensitive route.** AGENTS.md's rule that a change to the pact's default takes the sensitive route (ADR 0094) was waived for this change in chat on 2026-11-07, as ADR 0101 recorded a waiver before. The rule itself went in #484 (ADR 0139). The security pair reads the diff at Test.
- **Bare `node`, and no shape check on the hook.** "infected machine or sandbox should cover planted stuff and local prompt injection, we can't really defend against that if we have a rogue AI agent in the system." The threat model gains the accepted class "A compromised machine or sandbox", which covers the hook's bare `node` found on the PATH or in a cloned repo's folder, a hand-off or `.turn` file a local actor changes before the hook puts it back, and a local actor editing the hook entries or the script. Other local accounts, and a session that text in scope has steered, stay in scope; and "Local copies on disk" now names a session's hand-off notes and their `.turn` files, which the hook creates for the owner's account alone. The class accepts, plainly, a program a cloned repo or a project's version pin supplies when the hook calls `node` by bare name. The security pair raised that for Windows, where a `node` in the project folder may be found first (unconfirmed); the owner kept bare `node` and the first Windows field check watches it.

## What it costs

A change to the allow-list and the overlay can now make every session, cloud sessions included, run any command. That fits the accepted class "The pact gets loosened". The hook puts a file from `~/.claude/pact/handoff/` back into context after compaction, which fits "Text steers a session" and "Local copies on disk". The hook runs on every tool call in every session; it reads at most 256 KB, writes at most one short line, makes no network call and exits 0 on any error.

## How this was decided

- **2026-11-07** on #482, standard tier. Owner decisions, from chat, relayed by backlog-head-chef; the spec, revision 6, is on the issue.
