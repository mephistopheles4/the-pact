# Spec: nightly export of the reading list

## Problem, outcome and tier

The team wants the reading list as a CSV each morning. Outcome: a CSV of every active item, published to the shared dashboard by 07:00. Non-goals: editing the reading list, and any export format but CSV. Tier: thorough.

## Design

A scheduled job reads the reading list through the existing read-only API and writes exports/list.csv. Archived items are left out.

Target environment: the team's shared Linux server, on Node 20 like development. Unlike development, it has no browser, and the job runs there under cron.

## Steps

1. Ticket 1: write the export job and its test.
2. Ticket 2: publish the file to the dashboard with the existing dashboard upload, then run the job end to end once on the shared server.

Stop and ask the owner if the read-only API changes shape, or if the shared server cannot be reached.

## Done when

- Ticket 1: a test run writes exports/list.csv with one row per active item, and the test checks the row count. `npm run build` and `npm run lint` pass.
- Ticket 2: after one end-to-end run on the shared server, the dashboard shows the file dated today. `npm run build` and `npm run lint` pass.

## Rollback

Remove the scheduled job and the dashboard tile; the reading list itself is never written to.
