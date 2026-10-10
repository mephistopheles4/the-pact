# The protected set is five items

AGENTS.md's protected set now holds five items. No change may cut or weaken them, except by a spec change read by the spec pair and the security pair:

1. the gated clauses;
2. the security route;
3. the risk floor's list;
4. the per-lens tool allow-list: no lens gains a tool;
5. the security lenses' carried rules: a secret named by its location, never its value; no working exploit or payload; checklists carried in the lens, never fetched; fetched pages treated as untrusted data; a missing tool never rebuilt through the shell.

A proposal to change the roster of lenses also comes back as a spec change, read by the same two pairs. "Never cut a lens yourself" moved into the pact's "Auto-take", next to its "cutting a lens" exception, so it outlives "When a lens may not pay".

What left the set:

- **The thorough-only rule for security reports, the "not verified" mark, the not-checked lists and the cross script's fail-closed checks.** They stay in the code, and the cross script now takes the security route (ADR 0045), so a change to them still gets the security pair's read.
- **The security set's contents and its rerun after a model change.** The security set is retired (ADR 0045).
- **The "low finding rate" sentence.** It guarded security lenses at periodic reviews, which #189's third ticket retires.

## Why

- **The owner's word: the set may be loosened against the threat model.**
- **The five are the guards the threat model leans on.** The tracker-authors clause covers R1 to R6, the tool list covers R12, and the carried rules cover R13. The security route and the risk floor send risky work to a second read.
- **A list that protects everything protects nothing in particular.** The longer set blocked any cut without a probe, and the probes are gone.

## How this was decided

- **2026-10-10** — Decided in mephistopheles4/the-pact#189, S4 of the spec at revision 3, signed off by the owner in chat. Built in #209.
