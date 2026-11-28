# The coverage hint is advisory, and local by default

An opt-in pact tool, `coverage`, asks a decision model whether the project's threat model already covers a security finding, and the session shows its answer under the finding. The design is [spec 0011](../spec/0011-coverage-hint.md); the tool's use is in [coverage.md](../coverage.md).

The owner asked for an advisory version now, because sessions keep proposing fixes for findings an accepted class already covers.

## The decision

- **A hint, never a ruling.** It says "likely covered", "unsure" or "no entry found", carries no numbers and says it is not a ruling. No rule or code turns it into a disposition, a severity or a route, and every security finding still comes to the owner.
- **Local by default.** The default asks Clef on `127.0.0.1`, so nothing leaves the machine.
- **A hosted backend only by the user's choice, per repo.** Jev, TypeSafe's model, is asked only when the user's own files choose it and list the repo, read from the folder's `origin`. No project file picks a backend or a repo list, and the tool never falls back from Jev to anything.
- **The entries are data.** A project's reviewed `docs/threat-entries.json`, else a draft from its threat model at the base. This repo's file splits the class on text steering a session into one entry per source the boundary lists, and the scope paragraph at its sentence groups, since one broad entry claimed findings it shouldn't. A gate test holds the file to the threat model.
- **The step stays a rule.** `review.md` says when to run it. No hook or tool puts the hint beside a finding.

## What it takes into the threat model

- **What leaves the machine:** a listed repo's security findings and entries go to TypeSafe, held by the tool's checks, against accidents only, and by the read before posting, at most ten findings a round.
- **Scope:** TypeSafe is out, as a provider the user chose, only while zero data retention is confirmed in writing, since the terms as read state no retention limit. Until it is confirmed, a Jev send fits no accepted class and comes to the owner. Nothing enforces the condition, and the owner may still rule on the line.
- **Text into a session:** the tool's answer and hint, bounded by its answer check.
- **Accepted:** what the scan doesn't read reaches TypeSafe; and, on any backend, outside text in a finding or an entries file can steer the hint's state and names, which the owner reads as a hint. The second reaches the local default too, past the agreement the owner gave for the `jev` path, so it is open for the owner.

## What it costs

- **A wrong "likely covered" could lead the owner to wave a real finding through.** The hint says it is not a ruling and can say "unsure". How often it is confidently wrong is checked by hand at Test (the spec's claim 15), and a later change can measure it from the tool's local log.
- **The draft leaves out the "Also accepted" lines,** so a finding only they cover can get "no entry found".
- **What went to TypeSafe can't be deleted request by request** ([its terms](../coverage.md#typesafes-terms)).

## Not taken

- **A hint that routes:** blocking, asking or noting on its state needs its own spec, the owner's labels and the calibration counts.
- **A model picking the entry that decides a fix:** the research didn't support it.
