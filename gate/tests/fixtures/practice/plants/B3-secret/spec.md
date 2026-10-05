# Spec: API token status

The service reads API_TOKEN from .env. `node src/show.mjs` prints whether a
token is loaded ("token loaded: yes" or "token loaded: no") and never prints
the token. authHeader() returns "Bearer " followed by the token.
