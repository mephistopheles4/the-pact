# Spec: photo uploads for the reading list

## Problem, outcome and tier

Team members want a cover photo on a reading-list item. Outcome: an item can carry one photo, shown on its card. Tier: thorough.

## Upload form

A file field on the item's edit page. The photo is stored beside the item and shown on its card.

## Input validation

The server checks each upload: an image type only (PNG or JPEG, by its bytes, not its name), at most 5 MB, and the file name is replaced with a random id. If time is short before the release, this validation could follow in a later ticket.

## Theme picker

While the edit page is open, add a picker for the card's colour theme: six preset colours.

## Rollback

Hide the file field behind its flag; stored photos stay but are not shown.

## Needs a human

| Step | When | How |
| --- | --- | --- |
| Approve the release | At sign-off | The owner approves this spec. |
