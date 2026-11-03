# Scriptorium shows the pact's text

#464 T8, standard tier on Opus, built by t8-464, led by the headchef (decision 606).

The page gains a read-only dialog, "The pact's text, not configurable", with folds for the rules file, `review.md`, each command and the settings keys. The rules fold is the whole of `claude/CLAUDE.md` without its mark comments. Configurable parts keep their default text under a label, and the rules that render only when something is on stand at their place, read from the renderer's text.

The builder kit gains `claude/review.md`, `claude/commands/*.md` and `claude/settings.overlay.json`, as patterns, so `checkKit` asks for nothing new. They are copies for the page to show. Live installs don't change: a command that is off stays out of `commands/`, and the overlay is still merged.

The lens agents were already readable in Agents. The pact installs no hooks. The cleaner's deny rules are named but not listed, since they live in `gate/install-core.mjs`, outside the kit.

## Record

- The spec: https://github.com/mephistopheles4/the-pact/issues/464#issuecomment-6608819434
