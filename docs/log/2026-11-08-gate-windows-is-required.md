# gate-windows is a required check on main

#474, quick tier, built by pact-474.

Main's ruleset required only `gate`, so a PR could merge while `gate-windows` was still pending or failing. #473 merged that way. ADR 0095 planned for both checks to be required once `gate-windows` had its first green run on `main`, and that run had long since happened.

On 2026-11-08 the head chef's session added `gate-windows` to the required checks of main's ruleset (24786267), with GitHub Actions (integration 15368) as its source. It made the change through the API, under the owner's account, on the owner's approval in chat. A read of the ruleset afterwards lists both `gate` and `gate-windows`, each from integration 15368, with no bypass actors. The PR that carries this log was blocked from merging while its own `gate-windows` run was pending.

By the owner's choice, the threat model names neither check. ADR 0095 and this log hold the read.

Every merge now waits for the slower Windows job. If `gate-windows` stops reporting, for example when its image label retires, it blocks every merge until the label moves or the check is dropped.

**Rolling back:** the owner removes `gate-windows` from the ruleset's required checks. No code changed.

## Record

- The ask: https://github.com/mephistopheles4/the-pact/issues/474
