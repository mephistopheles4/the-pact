# plan-reviewer, round 1, on draft 1 — verbatim

REVISE

Headline: User-only list omits `implement`; the gen check warns today
Blocker: The plan says exactly four named skills are user-only. But `implement` also carries `disable-model-invocation: true`, and move 3 names it ("with `implement` or otherwise"). Wording 1 says "Use the other named skills yourself". That tells the model to use `implement`, which it cannot do, and which move 3 forbids in the main session anyway. The gen.ps1 check has a second problem. It compares every installed skill's flag against the four names, and several other installed skills also carry the flag (`implement`, `setup-matt-pocock-skills`, `handoff`, `grill-me`). So ticket 2's done-criterion, "prints no warning against the current install", fails on day one. That criterion cannot be met as written.
Evidence: C:\Users\mephi\.claude\skills\implement\SKILL.md:4, setup-matt-pocock-skills\SKILL.md:4, handoff\SKILL.md:5, grill-me\SKILL.md:4 (all `disable-model-invocation: true`); claude\CLAUDE.md:97-98; plan lines 31, 55, 64, 83.
Minimum revision: Scope both the rule and the check to the skills that "Implementing a change" names. Then either add `implement` to the user-only list or explicitly exclude it, since move 3 already forbids it. State that the gen check compares only the named skills, not every installed skill.
Acceptance check: Every skill named in "Implementing a change" is in exactly one group: user-only (flag present), model-run (flag absent), or missing. On the current install, the gen check's comparison set gives no warning without any list edits.

Headline: The gen check breaks gen.ps1's rule never to read live config
Blocker: gen.ps1 promises it "Never reads the live ~/.claude". It builds only from repo copies, so its output is reproducible. The stale-list check makes gen read `~/.claude/skills/`. Its result then depends on the machine it runs on, and it breaks the script's own stated invariant. The plan does not acknowledge the conflict or settle it. The done-criterion "a warning when a fifth name is added to a copy of the list" is also unclear. It does not say which list is copied, or how the builder injects it, so the check cannot be repeated.
Evidence: cloud-sessions\gen.ps1:3-4; plan lines 64, 83.
Minimum revision: Choose and record one of two options. Either (a) move the check to a separate read-only script or step, leaving gen.ps1's invariant intact, or (b) change the invariant comment on purpose and give the reason. Then state exactly how the fifth-name test is set up.
Acceptance check: The plan names where the check lives and whether gen.ps1's header comment changes. Ticket 2 gives a reproducible way to trigger the warning.

Headline: The override-line wording is missing, yet ticket 1 says verbatim
Blocker: Ticket 1 goes to `spec-builder` with the instruction "verbatim from this plan", and the owner signs off on "the three wordings". The "What no skill overrides" addition is given only as a paraphrase: "a skill may not start a user-only skill for the owner". Its sentence and its position are not written. That leaves a wording decision to a fully-specified builder, outside what the owner approved. The done-criterion "the text matches" cannot be checked for that line.
Evidence: plan lines 62, 82, 97; claude\CLAUDE.md:48-55.
Minimum revision: Write the exact override sentence and say where it goes in the paragraph. Add it to the wordings approved at sign-off.
Acceptance check: The plan contains a quoted sentence for "What no skill overrides". Ticket 1's text-match check covers all four insertions.

Headline: Offload probes P2–P4 have no control run
Blocker: AGENTS.md says a probe's pass counts only once the probe has been seen to fail, and that every run is recorded verbatim. P0 is an informal observation of a cloud session. The plan does not cite a verbatim record of it. At most it is a control for P1: the model had no trigger line. P2–P4 test the offload response and the no-repeat rule, and have no control run or planted bad case. So their passes cannot count under the repo rules.
Evidence: AGENTS.md "Testing a change to an agent or a rule"; plan lines 89-93.
Minimum revision: Add a control run for P2–P4 on the pre-change config: the same fresh-session script, recorded verbatim. Or add a planted bad case the probe must catch. Point P0 at a verbatim record, or re-run it as a recorded control.
Acceptance check: The probe section lists, for each of P1–P4, a recorded failing control or a planted bad case, with where its verbatim record will be committed.
