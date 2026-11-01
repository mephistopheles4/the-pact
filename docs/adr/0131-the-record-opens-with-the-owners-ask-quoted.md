# The record opens with the owner's ask, quoted

The rules file's "Keep the record" rule now opens each issue, spec or ticket with the owner's ask, quoted exactly: the sentences that define the work or change its scope, and nothing else from the conversation. An example the owner gives becomes an acceptance claim with its measure. With no record, the ask is quoted in each hand-off. In the review procedure, "the request" handed to every lens is that quoted ask, else the issue's or prompt's text, and a closing read's Spec drift item that departs from the ask, where the owner didn't ask for it, is a finding, not information.

## Why

- **The owner's ask (#462):** "all we really need is to capture the intent in the start so we can detect drift after build. if intent itself drifts cuz its paraphrased then everything that follows will drift too"
- **What happened before it:** a one-sentence instruction was filed in a session's paraphrase; the spec dropped its size, three review rounds added rules, and every review compared the build with a spec that had already drifted, so nothing failed.
- **Where the quoting went:** no rule ever required it. Sessions quoted the owner as a habit, to back "Owner decision, from chat"; once a lead session filed the issues, the habit never reached the record.
- **Why the pact, not this repo:** acceptance claims, each quality's Enough and the cost limits are judged against the ask, so the quoted ask goes to the lenses with the spec, at Design and at Test, in every project.

## What was weighed

- **Quote the conversation.** Not taken: "we are overcorrecting by quoting everything, well end up having the whole transcript on github". Only the sentences that define the work or change its scope are quoted.
- **Run unstated-lens at Test, a named-gap rule, growth figures in reports.** Dropped when the owner narrowed the scope; each can be filed on its own.

## Budget

The rules file's budget (ADR 0129) rises from 4,050 to 4,100 words, a spec change, so the change adds only the sentences asked for. A first build trimmed other rules in "How Claude helps" to fit 4,050; those trims were edits nobody asked for, one of them changed a rule's meaning, and all were reverted. Any cut to make room belongs to #464.
