# `clef ensure` checks for a live supervisor again once it holds the lock

PACT-89. `gate-windows` failed intermittently on the test "callers at the same moment over a stale lock start exactly one supervisor" (PR 654, run 45208428545: two supervisors in round 0). Main's own run on 7dc2b97 passed.

`ensure` checked for a live supervisor once, then took `run.lock`, and went on to delete `run.json` and start a supervisor. A caller whose check ran before another caller's supervisor had written `run.json`, and whose lock attempt ran after that supervisor had let go of the lock, passed both steps: it removed the live `run.json` and started a second supervisor on the same folder, which the lock exists to prevent.

Now, once `ensure` holds the lock, it checks again. A live supervisor found there is returned as it is, the lock is released, and `run.json` is left alone. `ensure` takes the check as an optional `liveCheck` (default `liveSupervisor`), so a test can hold one caller between its two steps without relying on timing.

**What is and isn't shown.** The new test fails with the second check taken out ("no second supervisor was started") and passes with it, and it needs no timing luck. It asserts that `ensure` went through `liveCheck` twice, so it cannot pass on code that ignores the seam. That the CI failure was this window is a hypothesis: it was reproduced on a Windows host only under heavy CPU load (3 of 40 runs, none of 40 idle), and no failing run was caught with a trace.

**Rolling back:** revert the commit; the check returns to once, before the lock.
