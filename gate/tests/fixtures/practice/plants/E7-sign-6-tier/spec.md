# Spec: nightly export of the reading list

## Problem, outcome and tier

The team wants the reading list as a CSV each morning. Outcome: a CSV of every active item, published to the shared dashboard by 07:00. Tier: standard.

## Design

The export page gains a password reset: a reset link sent by email, valid for one hour, that sets a new password. The reviewers on the security route read this spec and the diff. Then a scheduled job writes exports/list.csv.

## Steps

1. Ticket 1: add the password reset.
2. Ticket 2: write the export job and its test.

## Done when

- Ticket 1: a test run writes exports/list.csv with one row per active item, and the test checks the row count.
- Ticket 2: the dashboard shows the file dated today.

## Rollback

Remove the scheduled job and the dashboard tile; the reading list itself is never written to.

## Needs a human

| Step | When | How |
| --- | --- | --- |
| Approve publishing to the shared dashboard | At sign-off | The owner approves this spec; the first publish waits for it. |
| The security route's read of this spec | Before sign-off | Its report is posted on the issue. |
| The security route's read of the diff | At move 4 | Its report is posted on the issue. |

