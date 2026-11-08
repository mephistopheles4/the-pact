# /scry answers with numbered asks

#515, standard tier with the security pair, built by pact-515. The ask came in the lead's words and was filed with the owner's go in chat. The owner's own words: "What you just did there with what I'm asking from you is kind of what I want this [scry] command to do, and it hasn't been working very well so far because it's a lot confusing what's going on when I use it."

`/scry` no longer answers with three headings (#489). It answers with numbered asks first, each with a bold question, the one or two facts needed to answer it and the lead's pick in italics; then the steps only the owner can take, unnumbered; then a short "Moving" and "Done" tail. It uses no decision ids, session ids or tab names. The owner replies by number: "Yes, 1 to N", "yes to 2 and 4" or "yes except 3" answers those numbers with the lead's picks, and other words per number answer that number.

The reply rule is the security-sensitive part, since a short numbered yes now stands in for the owner's confirm on acts the rules reserve to them. The security pair read the spec twice and once more at the end. What it settled, all in `claude/commands/scry.md`:

- An ask that needs its own yes (an install apply, mise trust, a deletion by hand, a release or publish to users, a message to someone outside the session, and any step the session can't undo or isn't sure it can) is reached only by a reply that names its number. A range or an exclusion never reaches it.
- Only the owner's own typed reply answers; a relayed reply or a standing goal's text never does. The text carries this itself, since the command installs in every project and this repo's `AGENTS.md` does not.
- Facts are read again just before each act; a merge goes against the head commit the ask described. A number whose facts changed is asked again.
- Earlier numbers are void after a compaction or a resume. After acting, the session names each number and what it did; any record names the ask in words.
- An ask carries a summary of its evidence and where to see the rest, never raw output or a secret.
- `/make-it-so` never takes a step that needs its own yes, nor a number already answered; after a `/scry` answer it is "Yes, 1 to N".

A merge stays inside "Yes, 1 to N", on the described head commit. That was the lead's pick under its standing goal, not the owner's in chat, and the security pair asked for the owner to see both sides; the cheaper middle option is a merge that touches hooks, settings or root-run setup needing its own yes. The sensitive-route flag is also still open for the owner: the route was declined by the lead's decision, and the change matches the list through "authorization".

The Brigade pane's to-do wording lives in grimoire's `head-chef` skill and is filed as mephistopheles4/grimoire#556. Until it lands, `/scry` and the pane differ.

The builder page's `scry` blurb is written in the page itself, so it was edited there; the rebuild refreshed the embedded copy of both command files. The default configuration and the cloud scripts carry neither command and regenerated with no change. No gate code changed and no gate test was added.

**Rolling back:** revert the PR, then reinstall the reverted text through the dry run and the owner's apply.

## Record

- The ask and the first spec: https://github.com/mephistopheles4/the-pact/issues/515 and its comment https://github.com/mephistopheles4/the-pact/issues/515#issuecomment-6724212790
- Design round 1 (the spec pair): https://github.com/mephistopheles4/the-pact/issues/515#issuecomment-6724347119 ; revision 2: https://github.com/mephistopheles4/the-pact/issues/515#issuecomment-6724348515
- Design round 2 (the security pair): https://github.com/mephistopheles4/the-pact/issues/515#issuecomment-6724453478 ; revision 3: https://github.com/mephistopheles4/the-pact/issues/515#issuecomment-6724461356
- The closing read and its five amendments: https://github.com/mephistopheles4/the-pact/issues/515#issuecomment-6724624396
