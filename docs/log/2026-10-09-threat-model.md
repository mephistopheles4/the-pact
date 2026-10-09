# A threat model for readers who install the pact

**2026-10-09** — the-pact has a threat model, [`docs/threat-model.md`](../threat-model.md), linked from the README and the install how-to (mephistopheles4/the-pact#190). It names five attackers, says for each what the pact does today and what it accepts, and labels 18 accepted risks, R1 to R18, so the prune (#189) can decide what to cut against them.

- **One explanation page,** written alongside #10's final rescan, so it describes the pact as it publishes.
- **Rules and boundaries kept apart.** Each guard is called a rule (text a model follows), a boundary (enforced by code) or an ask prompt. Most of the pact is rules.
- **A residual-risk chart and matrix,** modelled on grimoire's threat model at the owner's request. R11, auto mode, is the one risk in "act now".
- **A "Reporting a security hole" section,** pointing at GitHub's private vulnerability reporting, which the owner turns on right after the flip.
- **A test** in `gate/tests/docs-index.test.mjs` fails when the README or the how-to loses its link to the page.
- **A rule in AGENTS.md:** a change that alters a defence the page names, or closes an issue it lists, updates the page in the same PR.

## What it set out to do

The owner wanted others installing the pact to know how it could break, and then tweak it as they like. The doc is its own spec, so one Opus session drafted it on the issue, ran the reviews and opened the PR. Thorough by the risk floor: it is published and about security.

## What the reviews found

Seven lenses read draft 1: the security pair and `unstated-lens` on its sections, and the standards pair and the QA pair on its diff. All four cross calls passed. Of 41 findings, 40 were taken and one dismissed (an unconfirmed claim about model fallback).

- **The cloud copy.** `adversarial-lens` found that the repo's cloud setup still writes an old copy of the rules, without the tracker rule. The draft had said it in the past tense, and called the cloud "fail safe". The page now says not to point a cloud session at a public tracker until its setup holds the current copy (#179, #181).
- **Risks the draft left out:** a fooled session posting a decision mark under the owner's account (R2), a foothold written for later sessions (R14), a cloned repo's instruction files (R15), and trust in this repo's publisher (R8).
- **Data the draft left out.** `data-lens` found that reports stay public after a fix (R3), that four lenses carry no rule against quoting a secret (R13), and that periodic totals go to this repo's tracker by default (R18).
- **An overclaim about the gate.** `behaviour-lens` found that a committed edit to a gated clause and to the gate's own copy of it installs; the dry run shows only that the gate changed (R17).
- **Terms used before they were defined:** the security route, the stops, a probe and the open parts of the moves. Both standards lenses flagged the same ones.
- **A check that couldn't fail.** `integrity-lens` found no test guarded the new links. The new test was seen to fail on a misspelt link.

The owner approved draft 3 without another lens round. The chart, the matrix and the risks added after the review were checked against the lenses' own evidence, not reread by them.

## Follow-ups filed

- **#192:** give four lenses the no-secret rule, and say it beats posting a report word for word.
- **#193:** send periodic totals to the installer's own tracker by default.
- **#194:** ship the tracker reads in the installed payload, not a live file in this repo.

## Record

Issue comments on mephistopheles4/the-pact#190:

- **Brief:** 6085569258.
- **Draft 1:** 6085667735.
- **Cross sections:** security pair 6085790232, standards pair 6085790599, QA pair 6085790990, `unstated-lens` 6085791505.
- **Lens dispositions:** 6085838360.
- **Draft 2:** 6085871093.
- **Draft 3, the chart and matrix:** 6086011909.
- **Owner decision, from chat:** 6086050191.

On #10: the after-the-flip step for private reporting, 6086057708.
