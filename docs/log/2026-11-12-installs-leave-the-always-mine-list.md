# Installs leave the always-mine list

#540, quick tier. The owner asked in the lead's chat to delete the install rule: controlling installs from false positives cost more friction than the protection against new programs was worth.

`claude/CLAUDE.md` no longer lists "installs" among the decisions that wait for the owner's confirm in chat (How Claude helps, Always mine). No other copy of the rule sits in `claude/`: the install apply and mise trust named in `claude/commands/scry.md` and `claude/commands/make-it-so.md` are the repo's own rules in `AGENTS.md`, which stay, as does the pact install's dry run and apply on the owner's go-ahead. `docs/rule-reasons.md` records the removal and its reason on the Always mine row.

The generated files (`cloud-sessions/`, `builder/scriptorium.html`, `builder/default-config/`) are refreshed from the new text.

**Rolling back:** a revert PR, then the normal dry run and the owner's apply.

## Record

- The ask: https://github.com/mephistopheles4/the-pact/issues/540
