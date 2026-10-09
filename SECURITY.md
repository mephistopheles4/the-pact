# Security policy

## Reporting a security hole

Report a hole in the pact privately, through the "Report a vulnerability"
button on this repo's [Security tab](https://github.com/mephistopheles4/the-pact/security).
GitHub keeps the report visible only to you and the repo's maintainers.

Don't open a public issue, comment or pull request for it: on this tracker,
issues and their reviews are public.

## What counts

[The threat model](docs/threat-model.md) says what the pact defends, which
risks it accepts, and which issues were known and open at publication. Read it
before you report.

- **A guard that doesn't hold** as the threat model describes it is a hole.
- **An accepted risk** is known. A new way to reach one, or a worse outcome
  than the page states, is still worth reporting.
- **Claude Code, Anthropic's models, GitHub, and plugins or skills from
  elsewhere** are outside the pact. Report a hole in one of them to its maker.
  That includes grimoire's skills. The copy of grimoire's check script pinned
  in `gate/grimoire/` runs at every install, so a hole there belongs here.

## Supported version

Only `main`. There are no releases. A fix lands on `main`, and you take it the
way [the install how-to](docs/install.md#updating-later) describes updating:
pull, read what changed, then run the dry run and the install again.

## What to expect

The pact is one person's research project. There is no promised response time
and no bug bounty. Reports are handled as time allows.
