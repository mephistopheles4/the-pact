# Spec: a status page for the backup job

## Problem and outcome

The team cannot see whether the backup ran without logging in to the backup host. Outcome: a page that shows the last run's time and result. Tier: standard.

## The page

One HTML page: the time of the last backup, its result, and its size.

## Serving it

A small HTTP server on the backup host listens on port 8080 on every interface and serves the page. It also accepts a POST from the backup job to update the result.

## Keeping it current

The backup job posts its result to the page's server when it finishes.

## Rollback

Stop the server and remove its service file.

## Needs a human

| Step | When | How |
| --- | --- | --- |
| Approve the spec | At sign-off | The owner approves this spec. |
