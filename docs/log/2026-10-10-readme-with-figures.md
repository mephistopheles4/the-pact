# A README with figures

**2026-10-10**: the README is rebuilt around four figures (mephistopheles4/the-pact#202). Short prose sits between a hero illustration and three explanation figures: the four moves, the process tiers with the risk floor, and the review lenses. Each figure ships light and dark. See [ADR 0043](../adr/0043-the-readme-figures-are-generated-svg-kept-true-by-a-rule.md).

- **The figures are generated.** `docs/img/build.mjs` renders each source in `docs/img/src/` as a light and a dark SVG, with only Node's standard library. Text stays text. A line too wide for its box, measured for the widest face in the font stack, fails the render.
- **A fast test keeps them current.** `gate/tests/readme-figures.test.mjs` fails while a committed SVG differs from its source, naming the file and the command that fixes it. It also checks that every image the README shows exists. A hand-edited SVG was seen to fail it, and a rebuild to pass it.
- **A rule keeps them true.** `AGENTS.md` gains "Keep the README in step with the rules": a change to the tiers, the lenses, the models, the risk floor or the roster updates the figure sources, their alt text, the README prose and `docs/reference.md` in the same PR.
- **The detail moved to a reference doc.** `docs/reference.md` takes the full "What's here" table with every agent, the familiars by effort, the map to Anthropic's playbook, and "What never goes in here". `AGENTS.md` points there. The Status section's history note became one line in "Who it's for"; its cloud-sessions paragraph was already in `AGENTS.md`. "Planned" became an issue.
- **Every figure reads without images.** Each has alt text with its point and a collapsed "Text of FIG." block with all of its words.

## What it set out to do

A design session on the owner's private canvas settled the layout, the figures and the prose. The owner approved it as it stood. The plan session asked the open questions, and the owner chose: SVG from one source, a rule rather than a test for the figures' words, a reference doc for the cut sections, and no credit line for the hero. The spec pair and `unstated-lens` read draft 1; revision 2 folded in their findings. The work was thorough by the risk floor, because the README is published, and cut as one ticket.

## Corrections to the canvas

The figures' words come from the canvas, fixed where `claude/CLAUDE.md` says otherwise:

- **FIG. 02:** quick work starts "in chat or on an issue", not only in chat; at standard and thorough, `unstated-lens` also reads the result.
- **FIG. 03:** the spec pair runs only at thorough; the standards pair and `unstated-lens` run at standard and thorough.
- **README prose:** `unstated-lens` runs alone, not in a pair; and after a review the agent acts on its own recommendation for each finding, which you can reverse, rather than only recommending.

## The hero

The hero is the owner's own AI-generated pencil illustration of an emptied office, with the caption "He meant the repo." set as text under it. It replaced an earlier choice, a comic by another author, which was dropped before anything was committed. The owner stated its terms in the build session's chat: the repo's MIT licence. It carries no credit line, by the owner's decision.

Its metadata was read before the first commit. The file holds a JFIF header and the standard sRGB colour profile, and no EXIF, XMP, IPTC or content credentials. Nothing personal was found, so nothing was removed, and the file was committed byte for byte: 1500 × 1500 px, 494 KiB.

## Record

Issue comments on mephistopheles4/the-pact#202:

RECORD_LIST
