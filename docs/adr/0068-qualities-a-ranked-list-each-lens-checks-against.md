# Qualities: a ranked list each lens checks against

The rules file gains a `## Qualities` section: the qualities that matter in the owner's work, ranked, each with how it is measured and the lens that checks it. It is a fifth open part Scriptorium builds, and a project may hold a list of its own (#262 addendum 2, from #273's agreed proposal; the owner's decision in chat).

## What changed

- **The `qualities` part.** A three-column table (Quality, Measure, Lens) under a *Scriptorium builds this* mark, between Lenses and Guards. The default holds the nine ISO/IEC 25010:2023 qualities, ranked in row order, each with a measure and the lenses that check it. Fixed prose after the part says how to use it: size the work with it, write acceptance claims from its measures, name the listed quality at stake in an offer's why, and name both sides only when a decision trades one listed quality for another.
- **An open part like the other four.** `qualities` joins the marks a home configuration may edit, and an edit to it gets the dry run's security-defaults line, since dropping the Security row weakens a default. A project configuration still edits no part.
- **The lenses take quality rows.** Each lens file says, in its own words and within its own question, that it may be handed quality rows and checks each against its measure. A row with no measure, on work that plainly touches that quality, is reported as not checked, with the claim that would measure it; it is never a finding. Each lens's contract records the change. No lens gains a tool, and none is added.
- **The review procedure hands them over.** `claude/review.md` has the session hand each lens, as a local file, the rows that name it, from the project's own list where there is one. It batches the missing measures into one add-or-skip question for the owner, and records a skip once in the Lens dispositions table.
- **A project's own list.** A project's `.claude/pact-config.json` may hold a `qualities` key: a list of rows, each a `quality`, a `measure` (which may be empty) and a list of `lenses`, every field one line of text. The renderer compiles the project rules file's table from those three fields alone, under a fixed heading and a fixed sentence saying the list takes the place of the home list in that repo. It takes no other text from the file, though each field is the project's own one-line text; a bar in one is escaped, and a list holds at most nine rows. This is the one thing a project configuration may set that is not a tighter value. The project's dry run leads its warnings with a security-defaults line pointing at the list in the project's config file.
- **The builder.** Agents is its own dialog beside Settings, holding the agents, the lens roster and the Qualities list; each lens takes one or more qualities as chips. The builder file gains a `qualities` key, compiled by `builder/parts.mjs` byte for byte against the pact's default.

## Why

- **The lenses asked their question with no sense of what mattered.** A lens checked a change against its claims, but nothing told it that, here, performance outranked flexibility. A ranked list with measures gives every lens the same priorities, and gives the owner one place to set them.
- **A measure turns a quality into a claim.** "Reliable" can't fail; "a failure, and the recovery accepted" can. Writing claims from the measures is how the list reaches the tests.
- **Projects differ in what matters.** A tool's qualities are not a service's. So a project may replace the list, though not loosen anything else.

## What was weighed

- **The project allowance loosens.** Unlike every other project setting, a project's list can drop the Security row in that repo. Accepted: a cloned repo still can't install itself, since the owner runs the project install and reads its dry run, and the threat model records the risk. The renderer takes only the three one-line fields, so no paragraph rides in.
- **Strict checks on the project's fields** (the nine names exactly, a length cap, no URL, at most 16 rows), as #273's proposal had them. Dropped under [ADR 0069](0069-the-pact-is-vetted-like-a-skill.md): the gate checks install mechanics only, so each field only has to stay on one line, which keeps the table a table. Which qualities and measures a project lists is the owner's to judge.
- **The same sentence word for word in every lens.** Dropped with the gate's word checks (ADR 0069): each lens says it in the words that fit its question.
- **Putting the list in the offers paragraph.** Rejected: that paragraph is protected item 1, and the list is a part a person edits. It sits in its own section, outside every protected text.
