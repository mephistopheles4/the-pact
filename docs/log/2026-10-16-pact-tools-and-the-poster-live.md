# Pact tools are opt-in, and the poster is proved live

**2026-10-16.** The poster (#246) was built to post to GitHub under the owner's account and read the post back. As planned, every install would have carried it. The owner wanted the pact's tools chosen the way its commands are, and a check on the Lens dispositions table, which sessions fill by hand and which had drifted in 7 of the 11 tables posted since 2026-10-12 (#280). The owner set the tier: thorough, on the sensitive route, Opus at high, cut into three tickets, each its own session.

## What was built (#280)

- **T1, the `tools` list (#284, PR #290).** A pact tool is off unless the home configuration's `tools` list names it; no project configuration, preset or shared builder file can turn one on. The poster moved to `claude/tools/poster.mjs` and installs to `pact/tools/poster.mjs`. The dry run warns for each tool that is on, Scriptorium gained a "Pact tools" section, and the rules file gains the poster's rule only while it is on (ADR 0074).
- **T2, the table check and the owner lookup (#285, PR #292).** Before it posts, the poster checks the shape of any Lens dispositions table outside a fence against the review procedure's template, and confirms with GitHub that the gh login owns the repo, so a renamed or moved repo can't carry a post elsewhere (ADR 0076).
- **T3, the live proof and close-out (#286).** The poster's reference page, `docs/poster.md`, with a test that holds it to the poster's own lists; R3 and R13 name the poster's scans as a backstop only some installs have, with the read before posting kept for everyone; the install with the poster on; and the live proof on the private sandbox.

## What the live proof showed

Every create surface posted and read back as sent from a scratch folder: an issue, a CRLF body, a recased label (a `NOTE`, not a mismatch), a misspelled label (GitHub created it), a draft pull request, a review and a reply in a line-comment thread. A malformed table was refused with nothing sent, then fixed in place and posted. The two command forms ran in Git Bash, PowerShell 7.6 and Windows PowerShell 5.1, in this worktree session and in a plain one, and the POSIX form ran in the Linux container from #96 with no network, refusing with `usage/surface`.

## What was weighed

- **The wrong shell's form runs on newer shells.** The spec expected a form typed in the other Windows shell to fail with Node's missing-module error. PowerShell 7.6 and Git Bash both expand the other shell's form to the home folder, so it runs the installed poster; only Windows PowerShell 5.1 keeps the tilde literal. The owner amended C10 (q9 A): safety rests on running the poster from the scratch folder, never the repo, so a planted file can't run either way.
- **Who turns the poster on.** The spec says sessions never write the home configuration. A relayed request to do so was held, and the owner gave the go in the build session's chat instead.

## Record

The plans, reviews, decisions and proof are comments on #280 and #286:

- [The spec, revision 5](https://github.com/mephistopheles4/the-pact/issues/280#issuecomment-6205135610)
- [The spec pair's review of revision 4](https://github.com/mephistopheles4/the-pact/issues/280#issuecomment-6205134752)
- [The security pair's review of revision 4](https://github.com/mephistopheles4/the-pact/issues/280#issuecomment-6205135009)
- [Lens dispositions on revision 4](https://github.com/mephistopheles4/the-pact/issues/280#issuecomment-6205135302)
- [Owner decision, from chat: proceed, and the ticket cut](https://github.com/mephistopheles4/the-pact/issues/280#issuecomment-6205417857)
- [C10 amended: the wrong-shell part](https://github.com/mephistopheles4/the-pact/issues/280#issuecomment-6226401920)
- [The live proof's plan](https://github.com/mephistopheles4/the-pact/issues/286#issuecomment-6226412900)
- [The install dry run](https://github.com/mephistopheles4/the-pact/issues/286#issuecomment-6226560275)
- [The live proof, as run](https://github.com/mephistopheles4/the-pact/issues/286#issuecomment-6226627555)
