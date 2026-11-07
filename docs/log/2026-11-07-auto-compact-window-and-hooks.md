# The auto-compact window and the hand-off hooks

#482, standard tier, specified by pact-compact and built by pact-482-build, led by backlog-head-chef. The owner's words came relayed by the lead session.

A session that auto-compacts lost its place. The pact now sets Claude Code's auto-compact window and installs a hook that keeps a hand-off across compaction (ADR 0140). `auto-compact-window` joins the usage settings: a number of tokens, 100000 to 1000000 in steps of 10000, 400000 when unset, `0` for off, and no project may set it. With it on, the install copies `claude/hooks/compact-handoff.mjs` to `pact/hooks/`, writes `autoCompactWindow`, and merges five hook entries by key, leaving every other hook as it was. The hook asks the session once per turn, from 80000 tokens below the window, to update `~/.claude/pact/handoff/<session id>.md`, asks the compaction summary to name it, and puts it back (up to 8 KB, marked as the session's own notes, data) after compaction. The cloud copy always sets 400000 and has no Off.

The gate changed in these ways. `hooks` left the banned keys of seam A and the install, and the overlay and the allow-list now hold the pact's hooks block exactly; seam A takes `--compact on|off`; the install merges `hooks` by key, never through the deep merge, and records the window it set; the dry run prints the window, each hook event it adds, updates or removes, and a warning per event holding a hook the pact did not install; the cloud tail does the same merge with jq (and the gate's Linux test image gains `jq` to run it). The threat model gained the accepted class "A compromised machine or sandbox", on the owner's confirmation at merge.

The spec was posted in six revisions and read by the spec pair on the fourth and by `executability-lens` alone on the fifth. The owner waived AGENTS.md's rule that a change to the default takes the sensitive route, as ADR 0101 recorded a waiver before; #485 then deleted that rule. The security pair reads the diff at Test. What only a real session shows is the owner's to check in the first sessions after install: the compaction point, the nudge and the hand-off write, the file coming back, and the Desktop Code tab, a `--bg` session, a cloud session and an Opus session.

## Record

- The ask and the spec, revision 6: https://github.com/mephistopheles4/the-pact/issues/482#issuecomment-6709493499
- The owner's proceed, from chat: https://github.com/mephistopheles4/the-pact/issues/482#issuecomment-6709591758
