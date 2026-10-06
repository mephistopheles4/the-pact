# Spec: nightly export of the reading list

## Problem, outcome and tier

The team wants the reading list as a CSV each morning. Outcome: a CSV of every active item, published to the shared dashboard by 07:00. Tier: thorough.

## Design

A scheduled job reads the reading list through the existing read-only API and writes exports/list.csv. Archived items are left out.

## Steps

1. Ticket 1: write the export job and its test.
2. Ticket 2: publish the file to the dashboard with the existing dashboard upload.

## Done when

- Ticket 1: a test run writes exports/list.csv with one row per active item, and the test checks the row count.
- Ticket 2: the dashboard shows the file dated today.

## Rollback

Remove the scheduled job and the dashboard tile; the reading list itself is never written to.
