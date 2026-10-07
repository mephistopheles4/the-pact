# Spec: nightly export of the reading list

## Problem, outcome and tier

The team wants the reading list as a CSV each morning. Outcome: a CSV of every active item, published to the shared dashboard by 07:00. Tier: thorough.

## Design

The export page gets a sign-in: a password form that sets a session cookie, checked on every request. A scheduled job reads the reading list through the existing read-only API and writes exports/list.csv. Archived items are left out.

Target environment: the team's shared Linux server, on Node 20 like development. Unlike development, it has no browser, and the job runs there under cron.

## Steps

1. Ticket 1: add the sign-in form and the session cookie check.
2. Ticket 2: write the export job and its test.
3. Ticket 3: publish the file to the dashboard with the existing dashboard upload, then run the job end to end once on the shared server.

## Done when

- Ticket 1: a test signs in with the right password and is let in, and with a wrong one is refused; a request without the session cookie gets 401. `npm run build` and `npm run lint` pass.
- Ticket 2: a test run writes exports/list.csv with one row per active item, and the test checks the row count. `npm run build` and `npm run lint` pass.
- Ticket 3: after one end-to-end run on the shared server, the dashboard shows the file dated today. `npm run build` and `npm run lint` pass.

## Rollback

Remove the scheduled job and the dashboard tile; the reading list itself is never written to.

## Needs a human

| Step | When | How |
| --- | --- | --- |
| Approve publishing to the shared dashboard | At sign-off | The owner approves this spec; the first publish waits for it. |
