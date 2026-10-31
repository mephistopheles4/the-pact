# The cleaner's --recoverable flag

#446, the-pact part (S2.8) of grimoire 484, thorough tier on the sensitive route. Specified by plan-484 and built by build-484, led by the headchef. The spec go on revision 4 was the lead's own pick under level 3 (decision 422), not the owner's words.

Grimoire 484 makes cleanup one typed act. The owner's `/brigade done` is the only yes, and the Brigade mod runs `show` and `remove` itself with no look before removal. So with `--recoverable` the cleaner keeps any worktree whose removal could lose what git doesn't hold, or could run a program. That covers ignored files or links; a `filter.` key of local or worktree scope, a failed config read, or a populated submodule, where no `status` runs; and assume-unchanged or skip-worktree entries. Every git call then pins `status.showUntrackedFiles=normal` and `GIT_NO_LAZY_FETCH=1`, and the flag needs git 2.45. The flag joins each candidate's facts, so a tag from a run without it never passes a run with it. The rules file's cleaner part gains two sentences: calling `clean_up` after a typed `/brigade done` needs no other yes, and a `/brigade done` is never a session's yes to run the cleaner itself.

The build wrote three gate tests on real git first (`gate/tests/cleaner.test.mjs`, #446 C1 to C3) and the render and docs check (`gate/tests/tools.test.mjs`). The Linux image's git is 2.39, so there a stand-in answers `git version` alone, and every other call runs on real git.

## Record

- The spec, revision 4: https://github.com/mephistopheles4/grimoire/issues/484#issuecomment-6546031880
- Ticket 0's measures: https://github.com/mephistopheles4/grimoire/issues/484#issuecomment-6546301488
- The issue: https://github.com/mephistopheles4/the-pact/issues/446
