# The apply guard asks on an apply, not a mention

The ask rules that guard the install no longer fire on any command that names the installer. They fire on the spellings of an apply. A dry run, a read, a search or a diff of the installer runs without a prompt. This supersedes [ADR 0042](0042-the-apply-guard-asks-on-any-command-naming-the-install.md) in part: its rules for the install record and for rulesets and branch protection stay as they were.

## What it covers

- **The Node installer, 24 rules.**
  - `PowerShell(*--apply*)` and `Bash(*--apply*)`: the one flag spelling the script reads, wherever the script is named, so a name in one statement and the flag in the next still asks.
  - After each of `install.mjs` and `install-run.mjs`, under PowerShell: `--a` (the flag split by quotes after it), `$`, `@`, `(`, `%` and a backtick, the words a rule can't read. Under Bash, with the first letter dropped as before: `--a`, `$`, a backtick and a backslash.
  - `--rev` after `install.mjs` in each shell: a dry run that writes the owner's rendered rules to a review folder still asks, since the folder may sit in a repo checkout.
  - No dash forms: PowerShell 7.6 passes a dash-like character to a native program as typed (checked in #210), and the script refuses it.
- **The old PowerShell installer, 18 rules.** ADR 0020's spellings of its apply switch come back, with the splat's space dropped, which closes ADR 0020's miss (d). Each shell also gets `$` and a backtick, and PowerShell gets `(` and `%`. The three dash forms stay, because PowerShell binds the script's own parameters and reads them as a hyphen.
- **Kept broad, 6 rules:** the install record's two, since the record is the dry run's drift baseline and a write has no closed set of spellings; and the four ruleset and protection rules.
- **Seam A requires all 48 in the overlay,** whatever the allow-list says, with a "stays required when dropped" bad case for each. A near miss in place of a required rule (a hyphen for a dash, a splat that needs its space, a retired broad rule) fails as missing.
- **The tests check the rules against a model of Claude Code's matching,** as its permissions docs describe it: `*` matches any text, PowerShell matches without regard to case, and a compound command is split into parts. Each apply form in the fixtures asks; each mention, read, search and dry run runs. A control shows the retired broad rules ask on every mention.
- **The live file keeps what it had.** The merge only adds rules, so a broad rule an earlier pact installed stays until the owner deletes it. `docs/install.md` lists the six to delete, by hand.

## The misses, accepted (threat model R22)

- the old installer named in one statement and run with its switch from a variable in the next: no name-free rule fits, since PowerShell takes any prefix of `-Apply`;
- a Node flag split by an escape no rule lists, such as a caret through `cmd`, or quotes before its `a`;
- a wrapped apply line, if the live matcher splits it before the flag;
- a name built at run time with the flag also hidden, as in ADR 0042;
- a dry run of installer code under edit, which now runs unprompted against the real Claude home; `docs/install.md` advises a throwaway home for it.

The model is built from the same docs the rules rely on, so it can't show what the live matcher does with escapes or wrapped lines. The owner chose no live prompt check (#210).

## Why

- **Every mention prompted.** A build that works on the installer names it in every diff, search and read, and each one asked the owner, though nothing installed. The prompts trained the owner to approve, which was ADR 0042's own habit risk.
- **ADR 0042's reason was that naming the file is the one thing every spelling shares.** For the Node script that is no longer true in the other direction: the script reads exactly one flag spelling, so the flag itself is shared by every apply, wherever the script is named. The words PowerShell hands a native command that a rule can't read (a variable, a splat, a subexpression, a parenthesised expression, the stop-parsing token), which 0042 feared, each have a rule after the name.
- **The binding is elsewhere too.** An apply needs the owner's go-ahead in chat (the gated install-go-ahead clause) and the full commit id the owner's dry run printed. The ask rule is a prompt, not a boundary.
- **The security pair read the spec before the build** and added the name-free flag rule, the escape rules, the old installer's indirection rules, the review-folder rule, and the "by hand" cleanup step.

## How this was decided

- **2026-10-10** in mephistopheles4/the-pact#210, as added scope: the owner's decision in `tickets-53`'s chat ("it's too aggressive"), confirmed in `build-210`'s chat. Spec revisions 1 and 2 are on #210, with the security pair's reports. The owner kept the record and ruleset rules broad, chose no live check, and removed the six broad rules from the live file early.
