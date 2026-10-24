# The home-folder install test passes where home is /root

**2026-10-24.** In a cloud session the home folder is `/root`, so the install test for a project holding the real home folder named `/` as the project. It also tries each path with a separator added, and `/` plus `/` is `//`, which the install refuses earlier as a network or device path. The test expected the home-folder refusal, so it failed there, and on `main`. Tier: quick.

## What was built (#333)

- **The test** (`gate/tests/install-project.test.mjs`, `realHomeCase`): a path that already ends in a separator, as a filesystem root does, is tried as given and not with a second separator. The test still checks that `/` is refused as a project holding the home folder.
- **Checked:** in a Linux container running as root, the test failed before the change with the network-path refusal and passes after it.

## Decisions

- The issue's options were to accept the earlier refusal or to skip. Neither was taken: the fault was the doubled separator, so the test keeps its own assertion everywhere. No ADR.

## Record

- [The issue](https://github.com/mephistopheles4/the-pact/issues/333).
- [Test review: behaviour-lens and integrity-lens](https://github.com/mephistopheles4/the-pact/issues/333#issuecomment-6388926206).
