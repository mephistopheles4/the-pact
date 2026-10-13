# Scriptorium tidied, and the qualities no longer ranked

**2026-10-13.** #279 began as one layout ask, the pact commands shown as an accordion like the parts. While prototyping #278's Cost limits in a copy of Scriptorium, the owner added three more: a square + for Add agent, one height for every field, and tag pickers that keep their select. Asked what the Qualities ranking did, the answer was nothing, so its removal joined #279 too. The owner set the tier: quick.

## What was built (PR #282)

- **Pact commands are an accordion,** the first section in Settings, with the same checkboxes, the locked `/scriptorium` and "Leave as is" as before.
- **Add agent is a square +** beside the name box. Its accessible name stays "Add agent", and its error message keeps its own line.
- **One control height.** The design system has no input or select, so the page sets `--control-h` from the spacing scale (36px) for text inputs, number inputs, selects and the square button.
- **Tag pickers** show their chips above the select, as the Tools field does, fill their row, and keep the select when every option is chosen, disabled and reading "nothing left to add".
- **The qualities are a list, not a ranking** (ADR 0073, amending ADR 0068). "ranked" left the rules file, a project's fixed sentence, the glossary, the README and the install how-to, and Scriptorium dropped the numbers and the ↑ ↓ buttons on Qualities. Nothing had acted on the order: no rule said what it did, and no lens saw it.

## What the review found

The QA pair read the layout fixes. `integrity-lens` found the page test no longer checked the + button's accessible name; the test now finds it by "Add agent" and checks it shows "+". `behaviour-lens` found the error message squeezing the name box and the roster's tag pickers no longer filling their row; both were fixed before merge.

## Notes for next time

- In a cloud container the installer's tests need the `GIT_CONFIG_*` variables unset, and the `changed` tier needs `--base origin/main` when the local `main` is behind; otherwise it runs the full suite.
- The poster's "gh absent from PATH" test fails in a container with a GitHub token set, on `main` as well.

## Record

- The ask and its tier: #279's body; the owner's decisions to tier it quick and add the ranking removal and the + button: mephistopheles4/the-pact#279 (comment 6148771381).
- Why the ranking went: the #278 record, mephistopheles4/the-pact#278 (comment 6148773586).
- The QA pair's review and dispositions: mephistopheles4/the-pact#282 (comment 6149289326).
