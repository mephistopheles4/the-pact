#!/bin/bash
# Runs inside the Linux container (#96): clone the bundled commit, print the
# versions, and run every gate test once. TAP keeps each skip's reason.
set -u
git clone -q /in/pact.bundle pact || exit 2
cd pact || exit 2
echo "commit $(git rev-parse HEAD)"
echo "node $(node --version)"
echo "pwsh $(pwsh -NoProfile -Command '$PSVersionTable.PSVersion.ToString()')"
echo "$(git --version)"
echo "user $(id -un) uid $(id -u)"
echo "os $(. /etc/os-release && echo "$PRETTY_NAME")"
# Node 20 does not expand a quoted glob for --test, so the shell expands it.
node --test --test-reporter=tap gate/tests/*.test.mjs
status=$?
echo "exit $status"
exit $status
