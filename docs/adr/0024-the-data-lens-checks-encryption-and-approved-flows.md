# The data lens checks encryption and approved flows

`data-lens` asks two questions beyond where data is stored and where it leaks: is each secret or personal item encrypted at rest and in transit, and is each flow that takes data out of the app approved by the spec, the issue or the app's written rules?

- **Encryption.** For each secret or personal item, the lens says whether it is encrypted at rest and in transit, and by what. An item stored or sent unencrypted is a finding, `high` when it reaches someone who should not have it.
- **Approved flows.** For each flow out of the app, the lens names the rule that approves it, or writes `not approved`. A flow that is not approved is a finding.
- **The checklist grows to match.** Beyond the three OWASP ASVS 5.0.0 chapters #35 revision 7 named for this lens (V13 Configuration, V14 Data Protection, V16 Security Logging and Error Handling), it also carries V11 Cryptography and V12 Secure Communication, with their section titles, pinned to 5.0.0 and never fetched.
- **The word is "unencrypted".** Never "in the clear", which teaches a banned headline word.

## Why

- **They are the owner's words for the lens's question:** "The data lens is a little similar, but more towards the data privacy side. Is our data always encrypted, at rest, and in transit? Does it stay private according to the app rules or specs? If data goes out of the app somewhere, where does it go to? And is that an approved data flow?"
- **Encryption needs its chapters.** Judging encryption at rest and in transit without V11 and V12 would leave the lens without the checklist the pact asks every lens to carry. The change widens a checklist, not a tool, so it is no roster change.
- **"In the clear" failed a security-set case.** The first wording said "stored or sent in the clear". On run 62 (D1) the lens wrote a headline ending "kept in clear", and "clear" is a banned headline word. The fix path changed the text to "unencrypted" and named the trap in the headline rule; D1 then passed on the fixed lens.

## How this was decided

- **2026-10-07** — Decided in mephistopheles4/the-pact#100. The owner's words came in chat at the contract interview and were folded in at `7575cac`; the "go" on the contract is `6f9eefb`. Run 62's failure and the stop are comments 6046588304 and 6046588609; the owner's "I agree with build-100's fix" (relayed) chose the fix, built in `1f65c9f` and reinstalled from `4e544ad`.
