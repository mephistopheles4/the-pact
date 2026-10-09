# A short security policy

**2026-10-09**: the-pact has a [`SECURITY.md`](../../SECURITY.md) (mephistopheles4/the-pact#198). The repo's Security tab had shown "Security policy: Disabled", and the owner chose a short file.

- **Report privately,** through the Security tab's "Report a vulnerability" button, never in public. Leave secrets out of the report and say where they are.
- **What counts,** in the threat model's own terms: a boundary that doesn't hold is a hole; a rule that fails is usually an accepted risk, unless the way in is new. Claude Code, Anthropic's models, GitHub and outside plugins and skills are out of scope, and so is grimoire, except the check script pinned in `gate/grimoire/`.
- **Supported version:** `main` only, taken the way the install how-to describes updating.
- **What to expect:** one person's research project, no promised response time, no bounty, and fix work that is reviewed in public.
- **The threat model** links back from its reporting section, which now points to the policy instead of repeating it. It also gains R19 and a note on the advisory channel.
- **A test** in `gate/tests/docs-index.test.mjs` fails when either link is lost. It was seen to fail on a misspelt link in each file.

## What it set out to do

The owner wanted the Security tab to point reporters somewhere, with four things in the file: private reporting, scope by link to the threat model, honest expectations, and `main` as the supported version. The file is its own spec, so one Opus session wrote it and ran move 4. It was thorough by the risk floor, because it is published and about security.

## What the reviews found

Seven lenses read the first commit: the QA pair, `unstated-lens`, the standards pair and the security pair. All four cross calls passed. The QA pair found nothing: every claim held, and private reporting read back as on.

- **The fix process would publish a reported hole.** Both security lenses found the same gap on their own. The policy promised a private report, but security work always takes the thorough tier, and that tier posts its spec and security reviews on the public tracker before the fix ships. The pact's only embargo covers escape rows. The owner chose to say so plainly: the policy now says details may become public once fix work starts, and the threat model labels it R19. A rule for private fix work is a follow-up.
- **A private report is a stranger's text.** `adversarial-lens` noted that neither the threat model nor the tracker how-to named the advisory channel, or the temporary private fork a reporter can open. The threat model now says the existing rule covers both.
- **Words a stranger can't follow.** `reader-lens` found "grimoire" used without saying what it is, "guard" where the threat model says boundary and rule, and the reporting steps written twice. All three were fixed.
- **Reporter data.** `data-lens` asked the policy to tell reporters to leave secrets out, and to ask about credit. Both lines were added.
- **One dismissal.** `conventions-lens` asked whether the one-type-per-document rule binds a security policy. The file keeps GitHub's usual shape and hands the update steps to the install how-to.

The fixes after the review were not reread by the lenses.

## Record

Issue comments on mephistopheles4/the-pact#198:

- **Brief:** 6088045087.
- **Cross sections:** standards pair 6088160716, `unstated-lens` 6088161082, security pair 6088177353, QA pair 6088209183.
- **Owner decision, from chat, and Lens dispositions:** 6088302832.

Follow-up filed: #199, a rule for fixing a privately reported hole out of public view.
