# Nudge once stays as it is

Nudge once, in How Claude helps, keeps its text. #403 asked for a rewrite because the #402 pilot saw it over-escalate when the owner said "just build it" on work holding personal data. With the eval built correctly, today's text and a rewrite behaved the same, and neither over-escalated (#403).

## What was found

- **The pilot's with-rules runs were malformed.** Its generator put the rules text in each case's front matter, and the eval's parser ends the front matter at the first `---`, which the rules text holds in its first table. Every with-rules run lost its case settings and got most of the rules text in the user prompt. The bare runs were built correctly, so the "passes bare" evidence stands (correction on #402).
- **Run cleanly, today's text already does what #403 asked.** On Haiku, one run per arm, with the invoice-export case rerun once per arm: the new text and today's text both built with no spec and recommended the sensitive route with its why on the invoice export (2 of 2 each) and on a login change, and both passed on a small change. On an order log holding personal data, both arms logged a redacted line instead and recommended no route: the model's own default, which neither text changes. Every reply was read by hand; the Haiku judge failed 8 of 10, mostly on wording.

## Why

A rule Claude follows without new words adds load and no behaviour. The rewrite sat next to the protected sensitive-work default and took four security reads to word safely, for no measured change.

## What was weighed

- **Shipping the rewrite anyway** (spec revision 4 on #403): no longer than today's bullet, and it states the sensitive flag's rules outright. Not taken: the evals show no change, and it would add fixed text that no configuration can change.
- **Trimming Nudge once.** Not tested: in #402's bare runs Claude never nudged, so the text may still earn its place; nothing here measures that.
