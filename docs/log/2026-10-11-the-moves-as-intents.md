# The moves as intents, and the rules cut to what judgment and the harness can't cover

**2026-10-11.** The rules file, `claude/CLAUDE.md`, was rewritten from a long list of rules into three parts (mephistopheles4/the-pact#186, built in #232). First come the four moves, stated once as intents with their why. Next comes a short floor of what holds in every workflow and every repo. Last comes the software preset, cut to the sentences that pass a keep test. The gated `move-4` clause is the only clause that changed. The file went from about 6,250 words to 5,043, with every rule the spec chose to keep still in place. ADR 0056 records the decision, the keep test, every deletion and what covers it.

## What it set out to do

The owner, from chat on #186: the more rules there are, the more friction they cause, and they weren't paying for it. Leave more to the model's judgment, and lean on Claude Code's harness and the model's own safety training. A session should read less and ask the owner less, and still stop in the same places.

## What was built

- **`## The moves`**, a new section above "Implementing a change". The four moves run at every seam: where work is handed on, published or decided. Any move can send the work back. A session starts at the move the owner's record on the issue shows. A checkpoint is the owner's decision, or an earlier check of the owner's that has been seen to fail; a lens advises and is never a checkpoint on its own.
- **The floor**, a paragraph in that section. It points at the gated clauses and restates none of them, and it declares two required slots. Risky work gets an independent review before it ships, and every result gets a review that could have failed. In software, the security route and the QA pair fill them. Only a change to the rules file, installed through the gate, narrows the risky list or swaps a reviewer. A new test, `gate/tests/floor.test.mjs`, holds the floor word for word. It passed on the new text and failed when a floor sentence was removed.
- **The software preset**, each section of "Implementing a change" rewritten to its row in the spec's table. Stops, auto-take exceptions, prohibitions and precedence lines were kept. Restated reasons, report formats the cross script checks, and mechanics the model works out were cut. The PR carries a stop inventory of 88 rows, mapping each such line in the old file to its place in the new one, or to ADR 0056.
- **`move-4`** opens with the owner's three tests of ownership and adds "Your confidence is never evidence."
- **`AGENTS.md`** puts the moves section on the security route. `CONTEXT.md` pins seam, checkpoint, floor, slot, filler and preset. The README, FIG. 01 and the reference table show the moves running at every seam. The threat model's R15 and R23 record the floor's "may only add" line and the owner's acceptance of risky-list option A. The builder page and the cloud copy were regenerated.

## What the build found

- **Pinned text won twice, as the spec says it must.** One existing test plants a weakening on move 4's exact line breaks, so move 4 keeps today's breaks across that span, with the spec's words byte for byte. The lead answered q1 with option A. The cloud copy's two edits anchor on two parallel-session paragraph openings, and a test pins the edits by digest. Those openings, tool names included, stay word for word, though the spec's table had cut the tool names.
- **The word budget could not be met.** The spec capped the file at 3,500 words. About 2,700 words cannot move: the gated clauses, the open parts of moves 1 to 4, the approved moves section and the pinned strings. That left about 800 words for the 25 or so rows the spec keeps, which need about 2,000 even written tersely. The build stopped and asked (q2). The owner chose A: the budget leaves this ticket, the cut ends where the keep rows allow, and the size target moves to #233. #233 follows Anthropic's guidance for CLAUDE.md files: under 200 lines, procedures that are needed only sometimes moved into skills, and must-always rules as hooks or gate checks. The `tracker-authors` trim is filed as #235.
- **One move-2 phrase collided with a preset test.** The test looks for "You question me until" and expects to find it first in move 2. The moves section now says "You ask me questions until", with the meaning unchanged.

## Record

- The spec, rev 5, signed off: mephistopheles4/the-pact#186 (comment 6109423411).
- Its reviews and dispositions: the security pair on rev 2 (6109152268, 6109154395) and rev 4 (6109356685, 6109378494); the spec pair and `unstated-lens` on rev 3 (6109207595, 6109208596, 6109222334).
- The owner's decisions on #186: 6104666592, 6108942180, 6109285401, 6109423226; the contract moved to #233 (#233's body).
- The build ticket and its questions: #232, q1 (6109605165) and q2 (6109634854, answered in 6109818737).
- Move 4's reports and Lens dispositions: on #232, listed in the PR.
