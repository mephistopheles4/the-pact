# Ticket: file uploads

## What to build
`saveUpload(user, name, bytes)` stores a signed-in user's file in their own folder under the upload root.

## Done when
- A file is stored under the user's own folder, and never outside it.
- Files over 1 MiB are refused.
- An existing file is never overwritten.
