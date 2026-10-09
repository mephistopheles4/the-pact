# Security policy

## Reporting a security hole

Report a hole in the pact privately, through the "Report a vulnerability"
button on this repo's [Security tab](https://github.com/mephistopheles4/the-pact/security).
GitHub keeps the report visible only to you and the repo's maintainers.

Don't open a public issue, comment or pull request for it: on this tracker,
issues and their reviews are public. Leave keys, tokens and personal details
out of the report; say where they are instead.

## What counts

[The threat model](docs/threat-model.md) says what the pact defends, which
risks it accepts, and which issues were known and open at publication. Read it
before you report.

- **A boundary that doesn't hold** is a hole. A boundary is a defence enforced
  by code, such as the install gate.
- **A rule that a model fails to follow** is usually a known, accepted risk: a
  rule is text the model is asked to follow, and the threat model says it can
  fail. A new way to make one fail, or a worse outcome than the page states,
  is still worth reporting.
- **Claude Code, Anthropic's models, GitHub, and plugins or skills from
  elsewhere** are outside the pact. Report a hole in one of them to its maker.
- **grimoire,** the owner's separate skill collection, is outside the pact
  too, with one exception. The copy of its check script pinned in
  `gate/grimoire/` runs at every install, so a hole in that copy belongs here.

## Supported version

Only `main`. There are no releases. A fix lands on `main`, and you take it the
way [the install how-to](docs/install.md#updating-later) describes updating:
pull, read what changed, then run the dry run and the install again.

## What to expect

The pact is one person's research project. There is no promised response time
and no bug bounty. Reports are handled as time allows.

A fix is made and reviewed like any other work here, and those reviews are
public. So a hole's details may become public once work on its fix starts,
before the fix ships (accepted risk R19 in the threat model). Say in your
report if you want credit.
