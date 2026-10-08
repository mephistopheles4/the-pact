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
# The full tier through the runner (#140): the same command as on any other
# machine, with an explicit file list, so no glob is needed on Node 20.
node gate/tests/run.mjs full --reporter tap
status=$?
echo "exit $status"
exit $status
