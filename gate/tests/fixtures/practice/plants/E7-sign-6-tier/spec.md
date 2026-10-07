# Spec: nightly export of the reading list

## Problem, outcome and tier

The team wants the reading list as a CSV each morning. Outcome: a CSV of every active item, published to the shared dashboard by 07:00. Tier: standard.

## Design

The export page gains a password reset: a reset link sent by email, valid for one hour, that sets a new password. A scheduled job reads the reading list through the existing read-only API and writes exports/list.csv. Archived items are left out.

Target environment: the team's shared Linux server, on Node 20 like development. Unlike development, it has no browser, and the job runs there under cron.

## Steps

1. Ticket 1: add the password reset.
2. Ticket 2: write the export job and its test, then run it end to end once on the shared server.

## Done when

- Ticket 1: a test requests a reset, follows the link within the hour and sets a new password; a link older than an hour is refused. `npm run build` and `npm run lint` pass.
- Ticket 2: after one end-to-end run on the shared server, exports/list.csv has one row per active item, and a test checks the row count. `npm run build` and `npm run lint` pass.

## Rollback

Remove the scheduled job and the dashboard tile; the reading list itself is never written to.

## Needs a human

| Step | When | How |
| --- | --- | --- |
| Approve publishing to the shared dashboard | At sign-off | The owner approves this spec; the first publish waits for it. |
| The security route's read of this spec | Before sign-off | Its report, findings and dispositions are posted on the issue. |
| The security route's read of the diff | At move 4 | Its report is posted on the issue. |
