# The pact has no secret or personal-data rules

The pact no longer makes Claude treat a secret or a personal detail in its own text specially (#441). Cut from `claude/`, the rendered rules file, the lens files and their contracts:

- **"Secrets" leaves the sensitive-work default.** The list is auth, crypto, input validation and data migrations.
- **A security finding has two clauses:** an attacker in scope in the threat model, or an item on the sensitive-work list. A secret or personal data exposed is no longer a security finding by that alone; with no threat model, the list decides.
- **The read before posting** checks a post against the rest of the review procedure's Posting section, and no longer reads it for a secret's value, a user name, a host name or an email address. No report stays local for a path that holds a user name.
- **No lens carries a rule** on naming a secret by its place, never its value, or on keeping personal data out of its report. The data-lens still inventories a product's secrets and personal data and reports their leak points.
- **`/scriptorium`** no longer reads a builder file or a preset for keys, tokens, addresses or names.
- **The poster** drops `secret/token`, `secret/url-userinfo` and `personal/email`. It keeps `secret/env`, the exact-match refusal of a live environment secret's value, and `text/hidden`; `edit/leak` and the withheld `gh` error line fire on either. A lens report refused for either still stays local.

Amends [0046](0046-the-protected-set-is-five-items.md) (items 2 and 3 of the protected set), [0050](0050-the-risk-floor-drops-anything-published.md) (the list), [0060](0060-the-moves-are-the-owners-practices-and-the-pact-leans-on-judgment.md) (judgment on secrets becomes no rule), [0086](0086-the-poster-refuses-only-this-machines-own-paths.md), [0097](0097-the-poster-refuses-no-path.md) and [0098](0098-the-read-before-posting-looks-for-no-path.md) (the read no longer looks for a user name or host name), and [0100](0100-the-poster-refuses-no-session-id.md) (the poster's remaining refusals).

## Why

The rules cost more than they caught: too much friction, and Claude treated almost everything as personal. The security lenses review a product for where its data can leak; that review stays. In the owner's words: "that's exactly why we have the security lenses on data routes so yeah cut it and leave the lenses do their job."

## What was weighed

- **Narrowing the rules.** Offered once by the lead; the owner chose removal.
- **Cutting the poster's environment-secret refusal too.** Not taken: it matches only the exact value of a secret-named variable in the poster's own environment, so it never fires on ordinary text (decision 388). It sees no credential `gh` keeps in a credential store and no key in a file, and on the default install the poster is off.
- **A product's leaked key as an auth finding.** Not taken: a product's leaked credential is not by itself an auth finding. Its fix is Hardening, offered to the owner as an accepted-risk candidate, never built unasked (decision 378).
- **This repo's own rules** (`AGENTS.md`, `docs/agents/issue-tracker.md`, `docs/agents/gate-tests.md`, `SECURITY.md`, the gate runner's record scrub, the installer's quiet output, the home-paths test) go to a separate issue, filed before merge (decision 354).

## How this was decided

- **2026-10-31.** Decided on #441, spec revision 4, thorough tier on the sensitive route. The removal (decision 348), the security-finding clause and "secrets" (357), keeping the lenses minus their own secret rules (359), adding nothing to the lens agents (360) and keeping `secret/env` with the four leak classes accepted (388) were the owner's words, relayed by the lead. The sensitive route and the separate issue (354), Hardening for a product's leak, one ticket and closing #428 and #429 (378), and the round 1 security fixes (381) were the lead's own picks. The proceed on revision 4 was the lead's own pick under level 3 (decision 398), not the owner's words; it stays open until the owner confirms it.
- **2026-10-31, at Test.** The security pair's read of the local commit found the removal's own cost high: the owner's credential or a personal detail posted to a public tracker, and a reviewed product's secrets in a lens report. Shown the risk to their GitHub account, the owner accepted the change as planned, declining to keep the token-shape refusal over false positives (decision 418, the owner's words, relayed by the lead); the threat model records the classes as R64 to R68.
