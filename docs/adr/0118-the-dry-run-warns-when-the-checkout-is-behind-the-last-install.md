# The dry run warns when the checkout is behind the last install

A user install's dry run, and its apply, print one warning when the last install's commit is not in the history of the commit being installed: the checkout is behind it or on another line, so installing may roll the pact back (#407). It warns and never refuses: a rollback stays a supported route.

## How it works

- **The bootstrap lists the commit's history.** `gate/install.mjs` writes `git rev-list <commit>` to `reachable` in its work folder, from the commit it already checked, never `HEAD`. The list is local, read from the object store under the bootstrap's fixed git environment, and never printed.
- **The runner checks it and compares.** `parseReachable` refuses a list that isn't 40 lower-case hex per line or doesn't hold the commit itself; the runner refuses when the file is missing. `behindLine` compares the record's commit lower-cased and prints it only when it is a commit id; anything else in the record shows as fixed words, so the record can put no text of its own in the line.
- **It comes after the security-defaults line.** That line and the Enough note still come before every other warning ([0066](0066-the-workflow-part-and-the-parts-scriptorium-builds.md)).
- **The boot test allows one more git call, and reads every call whole.** `rev-list` is allowed only as `'rev-list', commit`. Every `git(` call must now be one literal array closed by `]` and then `)` or `,`, so a call extended past its bracket, or given a variable, is reported; that gap was at the base for every subcommand. From the source's tokens, the helper may only be called that way, the git path is used only by the helper, and `commit` is declared once. Review at Test covers what a source check can't read.

## What it guards against

An honest stale checkout: a person or session about to install from a clone that lags the last install. It does not guard against a session that can write the clone, its git folder included, or the install record: such a session can hide the line or force it (R14, R61). The warning itself never changes what is installed; the stage is still checked blob by blob against the commit object. A rollback to a commit from before this change prints nothing, since the checked-out commit's runner decides (R22). A shallow clone may warn falsely.

## What was weighed

- **Refuse instead of warn.** Not taken: undoing an apply and installing an older reviewed commit are supported routes.
- **Degrade to no warning when `rev-list` fails.** Not taken: an unreadable history refuses, as every other git failure in the bootstrap does. The recovery is to repair or re-clone. This can be revisited if it bites.
- **List from `HEAD`**, as the first draft on #399 said. Not taken: the commit id is already checked, can't name a ref, and stays the commit staged if HEAD moves mid-run.
