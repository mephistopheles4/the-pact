# Ticket: user search

## What to build
`GET /users/search?name=...` returns the users with that name, through `findUserByName(name)`.

## Done when
- A search by an exact name returns that user's id, name and email.
- An unknown name returns an empty list.
