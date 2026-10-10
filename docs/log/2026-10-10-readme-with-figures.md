# A README with figures

**2026-10-10**: the README is rebuilt around a hero illustration and three figures (mephistopheles4/the-pact#202). Short prose sits between a hero illustration and three explanation figures: the four moves, the process tiers with the risk floor, and the review lenses. Each figure ships light and dark. See [ADR 0043](../adr/0043-the-readme-figures-are-generated-svg-kept-true-by-a-rule.md).

- **The figures are generated.** `docs/img/build.mjs` renders each source in `docs/img/src/` as a light and a dark SVG, with only Node's standard library. Text stays text. A line too wide for its box, measured for the widest face in the font stack, fails the render.
- **A fast test keeps them current.** `gate/tests/readme-figures.test.mjs` fails while a committed SVG differs from its source, naming the file and the command that fixes it. It also checks that every image the README shows exists. A hand-edited SVG was seen to fail it, and a rebuild to pass it.
- **A rule keeps them true.** `AGENTS.md` gains "Keep the README in step with the rules": a change to the tiers, the lenses, the models, the risk floor or the roster updates the figure sources, their alt text, the README prose and `docs/reference.md` in the same PR.
- **The detail moved to a reference doc.** `docs/reference.md` takes the full "What's here" table with every agent, the familiars by effort, the map to Anthropic's playbook, and "What never goes in here". `AGENTS.md` points there. The Status section was dropped: the owner chose to leave its history note to ADR 0035, and its cloud-sessions paragraph was already in `AGENTS.md`. "Planned" became #207.
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

## What the reviews found

Five lenses read the result: the QA pair, `unstated-lens` and the standards pair. All three cross calls passed.

- **Main had moved.** `behaviour-lens` found that main had switched to the Node install (#204) since the branch began, so the README told readers to run a script that no longer exists. The branch merged main, and Install and Depends on now follow its how-to. No test reads the README's install text, so only a reviewer could have caught this.
- **Three test gaps.** `integrity-lens` found that nothing checked the figures' words stay text in the font stack, that the 15% slack could drop to 5% unnoticed, and that a dark file was found anywhere rather than as its picture's dark source. Each gap got a check, and each check was seen to fail on a planted mutant.
- **Words a stranger can't follow.** `reader-lens` found "seam" used for two ideas and never defined, "familiars" as an undefined second name for the agents, and models not named as models. Seam is now defined once, and the lenses figure reads "Review lenses".
- **A lost fact.** `unstated-lens` found that the history line had dropped that two old commits name a private folder. The clause went back in, and then the owner removed the whole line: ADR 0035 holds the history note.
- **One dismissal.** `conventions-lens` asked whether an Install section with a command mixes a how-to into an explanation. The spec asks for it, so it stays at one command and a pointer.

The owner then settled the hero: it is the original download, the alt text doesn't say it is AI-generated, and its 494 KiB stands as it is. The owner's look at the rendered README, in light and dark on desktop and phone, comes before the merge.

## Record

Issue comments on mephistopheles4/the-pact#202:

- **Triage and design decisions:** 6089869833, 6091611823.
- **Spec:** draft 1 6092581711; revision 2 6092675102.
- **Spec review:** spec pair 6092651214, `unstated-lens` 6092651325, Lens dispositions 6092675250.
- **Owner decisions, from chat:** proceed 6093423454; one ticket 6093440703; the hero's terms and its metadata record 6093884463.
- **Build evidence and publish sweep:** 6093898492; the full humanizer list 6094059443.
- **Move 4:** standards pair 6093951302, `unstated-lens` 6093951456, QA pair 6094002609, Lens dispositions 6094107419.

Follow-up filed: #207, the vendor-neutral split that the README's "Planned" section held.