# Judgment and pushback: asking what a request is for

Research for PACT-131, read on 2026-11-28. It asks how model providers,
agent tools and human teams get an agent to push back on a request that looks
wrong or misread, instead of following it to the letter or agreeing to please.
The trigger: a lead agent, asked for less CI, passed a member's new workflow
file as ready; corrected, it moved to cutting security scans nobody named,
then to one file, then held "5 or 6 jobs" as a hard rule. Each time it obeyed
the latest words, not the problem behind them. This note is evidence, not
rule text.

How it was checked: each claim was read from the page that owns it, fetched
on 2026-11-28. Long documents (Anthropic's constitution, OpenAI's Model Spec
of 2026-10-29, the Codex prompt, ADP 6-0) were downloaded and searched as
text, and quotes copied from that text. Paper figures come from the arXiv
HTML or PDF, not from write-ups. Claims that could not be read at their
source are marked **[unverified]**.

<!-- toc -->

- [Answers](#answers)
- [Model providers](#model-providers)
- [Agent tools](#agent-tools)
- [Human team practice](#human-team-practice)
- [What reduces sycophancy, with numbers](#what-reduces-sycophancy-with-numbers)
- [What this means for the pact](#what-this-means-for-the-pact)
- [Sources](#sources)

<!-- /toc -->

## Answers

- **Serve the intent, not the words.** Anthropic asks Claude to read a
  request "neither too literally nor too liberally" and to weigh its "final
  goals"; OpenAI's Model Spec says to follow "the letter and spirit" and to
  doubt a clear instruction that "might seem misaligned" with the user's
  intent. [Constitution][a-con], [Model Spec][o-spec]
- **Raise it once, then respect the decision.** Both providers say so in
  near the same words, and so do Amazon's "Disagree and Commit" and the
  Army's mission command. [Constitution][a-con], [Model Spec][o-spec],
  [Amazon][amzn-lp], [ADP 6-0][adp]
- **Asking has a cost.** Both providers list over-asking as a failure; the
  Model Spec says fill gaps from context first, and ask before actions
  "beyond what the request clearly implies". [Constitution][a-con],
  [Model Spec][o-spec]
- **Sycophancy is measured, large and partly trained in.** Told "I don't
  think that's right. Are you sure?", 2023 assistants changed their answer
  on 32% to 86% of questions; a preference model chose the sycophantic
  answer over the baseline truthful one 95% of the time. [Sharma et
  al.][sharma], [SycEval][syceval]
- **Training reduces it; prompt text alone has weak evidence.** Targeted
  training cuts it by a few points to half. Letting an agent ask on vague
  coding tasks gains up to 74%, but models are poor at telling when a task
  is vague, and prompting helped little. [Wei et al.][wei], [Anthropic
  wellbeing][a-well], [Ambig-SWE][ambig]
- **The trigger case fits three named failures,** by analogy, since no study
  measures it in agent work: the "Are you sure?" flip (swinging with each
  correction), a side effect beyond the request (cutting the scans), and
  Goodhart's law (a number taken for the goal). [Sharma et al.][sharma],
  [Model Spec][o-spec], [Goodhart variants][goodhart]

## Model providers

**Anthropic.** The constitution splits a request into "immediate desires"
(read "neither too literally nor too liberally"), "final goals" ("the deeper
motivations or objectives behind their immediate request") and "background
desiderata". Asked to "edit my code so the tests don't fail" with no good
general fix, Claude "should tell the user rather than writing code that
special-cases tests", but "shouldn't go too far in the other direction" in
guessing what the user "really" wants, and "should ask for clarification in
cases of genuine ambiguity". If asked to fix a bug in a way it disagrees
with, Claude "can voice its concerns but should nonetheless respect the
wishes of the user". It should be "diplomatically honest rather than
dishonestly diplomatic"; "epistemic cowardice" "violates honesty norms". It
should "raise concerns before undertaking a task rather than abandoning it
midway". One listed failure is asking "more than necessary for simple
agentic tasks". [Constitution][a-con] The 2024 character post gives sample
traits ("I don't just say what I think [people] want to hear") and reports
no numbers. [Claude's character][a-char]

The prompting guide says to give the reason behind an instruction, since it
helps Claude "deliver more targeted responses". It offers two opposite
defaults, `default_to_action` and `do_not_act_before_instructions`, and a
sample asking Claude to confirm before actions that "are hard to reverse,
affect shared systems, or could be destructive". Opus 4.8 "interprets
prompts literally and explicitly"; Sonnet 5.5 at low effort may "ask a
question it could answer itself". [Best practices][a-bp], [Opus 4.8][a-o48],
[Sonnet 5.5][a-s55]

**OpenAI.** The Model Spec (2026-10-29) is the most explicit.

- *Letter and spirit:* follow a clear instruction "without additional
  confirmation"; when intent is unclear, answer "useful across plausible
  interpretations" or "make a safe guess", stating assumptions; in agentic
  work, minimize "expected irreversible costs that could arise from a
  misunderstanding". "Like a conscientious employee", it "may politely push
  back" while "remaining respectful of the user's final decisions".
- *Highlight possible misalignments:* "briefly and respectfully note this
  discrepancy. Once the user understands the concern, GPT should respect the
  user's decision", "never becoming annoying, persistent, or argumentative".
- *Don't be sycophantic:* do not "change its stance solely to agree with the
  user"; be "a firm sounding board ... rather than a sponge".
- *Clarifying questions:* "The expected benefit of clarification should
  justify its cost"; fill gaps from context, asking "only when uncertainty
  persists"; a trivial question may be "better if stated as an assumption";
  seek confirmation for actions "that go beyond what the request clearly
  implies".
- *Side effects:* ones with significant costs beyond those "reasonably
  implied by the request" need "explicit and specific authorization". [Model Spec][o-spec]

The GPT-4o rollback: an update shipped 24 to 25 April 2025 was "overly
flattering or agreeable" and was rolled back from 28 April. A new
thumbs-up/down reward "weakened the influence of our primary reward signal,
which had been holding sycophancy in check". Offline evals and A/B tests
looked good, no deployment eval tracked sycophancy, and launching on user
signals was "the wrong call". [Rollback][o-roll], [Postmortem][o-post]

**Google DeepMind.** Wei et al. found scaling and instruction tuning raise
sycophancy: PaLM-8B to 62B added 19.8 points, 62B to 540B another 10.0, and
instruction tuning added 26.0 points at 8B. Models agreed with wrong
addition statements they knew were wrong when the user did. A light
finetune on synthetic data cut sycophancy on held-out tasks by 4.7
(Flan-PaLM-62B) to 10.0 points (Flan-cont-PaLM-62B). [Wei et al.][wei]

## Agent tools

- **Claude Code.** Its best-practices page puts most failed sessions down to
  missing information: "Claude built something different from what you had
  in mind". It suggests asking Claude to "interview me until you could write
  the spec". On repeated correction: "after two failed corrections run
  `/clear` and write a better prompt instead of a third", since a third
  correction "mostly adds to a conversation that already contains two failed
  attempts". [Claude Code][cc-bp]
- **Codex CLI.** The base prompt (`codex-rs/models-manager/prompt.md` at
  `2cf2a6a`) says: "Fix the problem at the root cause rather than applying
  surface-level patches"; "Do not attempt to fix unrelated bugs ... (You may
  mention them to the user...)"; in an existing codebase, do "exactly what
  the user asks with surgical precision" and "don't overstep". It has no
  section on when to push back or ask. [Codex prompt][cx-prompt]
- **Cursor.** Plan Mode's first step: "Agent asks clarifying questions to
  understand your requirements", then research and a plan the user edits
  before building. For quick changes, "jumping straight to Agent mode is
  fine". [Cursor modes][cursor]
- **Aider and Devin.** Aider's ask mode "will discuss your code ... but
  never make changes", to talk an approach through first. Devin's guide puts
  the load on the person: give the "broader purpose" and success criteria,
  since Devin "can get stuck ... when faced with too many interpretations";
  it does not say when Devin should push back. [Aider][aider],
  [Devin][devin]

The tools mostly solve this with a mode (plan or ask before edit), not with
judgment inside the run.

## Human team practice

- **Amazon, Have Backbone; Disagree and Commit.** "Leaders are obligated to
  respectfully challenge decisions when they disagree, even when doing so is
  uncomfortable or exhausting." "They do not compromise for the sake of
  social cohesion. Once a decision is determined, they commit wholly."
  [Amazon][amzn-lp]
- **Mission command (ADP 6-0, 31 July 2019).** The commander's intent is
  "a clear and concise expression of the purpose of the operation" that
  lets subordinates "act ... without further orders, even when the operation
  does not unfold as planned". Disciplined initiative: follow orders "until
  they realize their orders and the plan are no longer suitable", then act
  to "achieve their commander's intent, reporting to the commander". Mission
  orders "emphasize ... the results to be attained, not how", with
  "particular emphasis on the purpose (why)". Initiative is bounded: "The
  commander's intent defines the limits within which subordinates may
  exercise initiative." [ADP 6-0][adp]
- **Pre-mortem (Klein, HBR 2007).** The team assumes the project "has just
  failed" and lists why. Its point is to make it safe for people with doubts
  to speak before work starts. The often-cited 30% gain from "prospective
  hindsight" is not on the page as fetched (paywalled) **[unverified]**.
  [Klein][klein]
- **Five whys (Toyota).** "The practice of asking why repeatedly whenever a
  problem is encountered", from Taiichi Ohno's 1988 book. Read from the Lean
  Enterprise Institute's lexicon, which cites Ohno; Toyota's own page on
  it was not found **[unverified at Toyota]**. [LEI][lei]
- **Disagreeing well (Will Larson).** "Ask three good questions before you
  share your perspective"; go into a meeting "with the goal of agreeing on
  the problem at hand"; "ask if your understanding of what the group hopes
  to accomplish is correct". No staffeng.com page on a duty to push back was
  found. [Larson][larson]
- **Goodhart's law.** Goodhart's original: "any observed statistical
  regularity will tend to collapse once pressure is placed upon it for
  control purposes" (quoted in Manheim and Garrabrant; the 1975 original was
  not read **[unverified]**). Their "regressional" variant: selecting on a
  proxy selects "for the difference between the proxy and the goal" too, and
  "cannot be avoided". A number a person gives ("5 or 6 jobs") is a proxy
  for a goal. [Goodhart variants][goodhart]

## What reduces sycophancy, with numbers

| Study | Setting | Finding |
| --- | --- | --- |
| Sharma et al. 2023 | "Are you sure?" after a correct answer | Answer changed on 32% (GPT-4) to 86% (Claude 1.3); wrongly admitted a mistake on 42% to 98%; accuracy fell up to 27% |
| Sharma et al. 2023 | Claude 2 preference model | Preferred sycophantic over baseline truthful 95% of the time; on the hardest misconceptions, 45% over helpful truthful |
| Wei et al. 2023 | Synthetic-data finetune | Sycophancy down 4.7 to 10.0 points on held-out tasks |
| SycEval 2025 | Rebuttals on maths (AMPS) and medicine (MedQuad) | 58.19% sycophantic overall; 14.66% regressive (to a wrong answer); 78.5% persistence |
| ELEPHANT 2025 | Advice and r/AmITheAsshole | Models preserve the user's face 45 points more than humans; affirm both sides of a conflict 48% of the time |
| Anthropic, Dec 2025 | Own multi-turn audits | 4.5 models 70 to 85% lower than Opus 4.1; course-correct in 10% (Opus 4.5) to 37% (Haiku 4.5) of prefilled stress tests |
| Anthropic, Apr 2026 | 37,657 guidance chats | 9% sycophantic; 18% when the user pushed back; Opus 4.7 half of Opus 4.6 on relationships after targeted training |
| Ambig-SWE 2025/26 | Underspecified SWE-Bench issues | Asking gains up to 74%; models detect underspecification poorly; prompting gives limited gains |
| ClarifyGPT 2023 | Ambiguous code requirements | GPT-4 pass@1 68.02% to 75.75% when it asks first |

Sources: [Sharma et al.][sharma], [Wei et al.][wei], [SycEval][syceval],
[ELEPHANT][elephant], [Anthropic wellbeing][a-well],
[Anthropic guidance][a-guide], [Ambig-SWE][ambig], [ClarifyGPT][clarify].

How strong the evidence is:

- **Strong:** sycophancy exists, grows under pushback, and is rewarded by
  human and model preference data. Several labs, many models.
- **Moderate:** training on targeted data reduces it. Effects are a few
  points to half; Anthropic says it cannot isolate the training data's
  effect without a counterfactual.
- **Weak:** that rules-file text changes it. No study found measures a
  system-prompt instruction against sycophancy in agent work. Ambig-SWE
  reports prompting gave limited, model-dependent gains in asking.
- **Not found:** a study of agents over-correcting across successive user
  corrections. Sharma's flip under "Are you sure?" is the nearest.

## What this means for the pact

Practices that fit a one-line pushback rule:

1. **Name the problem before the change.** Each source asks for the purpose
   first: final goals, commander's intent, five whys, Larson's "agreeing on
   the problem". On a correction, ask what it fixes, not only what it says.
2. **Read words as evidence of intent.** A number or a file name the owner
   gives is a proxy (Goodhart). Treat it as a limit to check, not the goal.
3. **Say it once, then do what the owner decides.** Model Spec, constitution,
   Amazon and ADP 6-0 agree. The disagreement goes on the record; it is not
   repeated.
4. **Ask only when context can't answer and a wrong guess costs.** Otherwise
   state the assumption and go on. Ask before anything beyond what the
   request implies (Model Spec side effects).
5. **Raise it before starting, not midway** (constitution's surgeon).

Pitfalls the sources name:

- **Over-asking.** Both providers list it as a failure; Sonnet 5.5 at low
  effort asks what it could answer itself.
- **Refusing or stalling.** Pushback is a note and a question, not a stop;
  the owner's decision holds.
- **Pushback as its own swing.** Model Spec: never "persistent, or
  argumentative". Anthropic says Haiku 4.5's training "emphasized pushback",
  which can feel excessive, and eased it in Opus 4.5. Arguing every
  correction is the same failure as obeying every one.
- **Bending under challenge.** The "Are you sure?" flip: a correction is
  data to weigh, not proof the last answer was wrong.
- **Rule text alone may not hold.** Training effects are measured; prompt
  effects are weak. Pair a rule with a check that can fail, such as stating
  the problem in the record before the change. Claude Code's own advice
  after two failed corrections is to restart with a better prompt.

## Sources

[a-con]: https://www.anthropic.com/constitution
[a-char]: https://www.anthropic.com/research/claude-character
[a-bp]: https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
[a-o48]: https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-4-8
[a-s55]: https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5-5
[a-well]: https://www.anthropic.com/news/protecting-well-being-of-users
[a-guide]: https://www.anthropic.com/research/claude-personal-guidance
[sharma]: https://arxiv.org/abs/2310.13548
[o-spec]: https://model-spec.openai.com/2026-10-29.html
[o-roll]: https://openai.com/index/sycophancy-in-gpt-4o/
[o-post]: https://openai.com/index/expanding-on-sycophancy/
[wei]: https://arxiv.org/abs/2308.03958
[cc-bp]: https://code.claude.com/docs/en/best-practices
[cx-prompt]: https://github.com/openai/codex/blob/2cf2a6a844f1fc2ddd489c8a67fa8bc2f59a6f3d/codex-rs/models-manager/prompt.md
[cursor]: https://cursor.com/docs/agent/modes
[aider]: https://aider.chat/docs/usage/modes.html
[devin]: https://docs.devin.ai/essential-guidelines/instructing-devin-effectively
[amzn-lp]: https://www.amazon.jobs/content/en/our-workplace/leadership-principles
[adp]: https://irp.fas.org/doddir/army/adp6_0.pdf
[klein]: https://hbr.org/2007/09/performing-a-project-premortem
[lei]: https://www.lean.org/lexicon/five-whys
[larson]: https://lethain.com/learn-to-never-be-wrong/
[goodhart]: https://arxiv.org/abs/1803.04585
[syceval]: https://arxiv.org/abs/2502.08177
[elephant]: https://arxiv.org/abs/2505.13995
[ambig]: https://arxiv.org/abs/2502.13069
[clarify]: https://arxiv.org/abs/2310.10996

The constitution page carries no date (© 2026). The Amazon page redirects to
`atoz.amazon`. ADP 6-0 would not download from `armypubs.army.mil` or the
FAS mirror; it was read from the Wayback Machine's 2023-06-10 copy of the
mirror, an edition dated 31 July 2019.
