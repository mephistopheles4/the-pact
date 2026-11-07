# /scry asks where we are

#489, quick tier, built by pact-489. The owner's words came relayed by backlog-head-chef: "scry it is, let's file it and start it".

A new pact command, `/scry`, is the owner's "where are we?" typed into a session. It answers in a fixed shape, one line per item: what needs the owner (with the session's pick), what is in progress and what it waits on, and what landed since the owner last asked, with links. A heading with nothing under it is left out. "Needs me" comes first because it is what the owner scrolls for on a phone. The name avoids Claude Code's built-in `/status`.

It sits beside `/make-it-so` and `/finis` and is owner-typed only (`disable-model-invocation: true`). Like those two it installs only when the configuration lists it, so it joins `PACT_COMMANDS` after `/scriptorium`, in both copies (`gate/shared.mjs`, `gate/install-core.mjs`), in the builder page's optional commands, and in the docs that list the commands. The `/scriptorium` command's own list of commands to skip when it reads the owner's material gains `scry`. The existing owner-only front-matter test and the shipped-commands seam A test now cover it; an install-core test row for the commands block lists it.

## Record

- The ask and the starting text: https://github.com/mephistopheles4/the-pact/issues/489
