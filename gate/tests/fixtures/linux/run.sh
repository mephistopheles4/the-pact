#!/bin/bash
# Runs inside the Linux container (#96): clone the bundled commit, print the
# versions, and run every gate test once. The junit report keeps each skip's
# reason, and the record in /out is the scrubbed copy to post on the issue.
set -u
# The suite never needs PowerShell (#210): a run with one on the machine could
# not show that, so it refuses.
if command -v pwsh >/dev/null 2>&1; then
  echo "pwsh is on this machine; this run must show the suite passes without it"
  exit 2
fi
git clone -q /in/pact.bundle pact || exit 2
cd pact || exit 2
echo "commit $(git rev-parse HEAD)"
echo "node $(node --version)"
echo "pwsh none"
echo "$(git --version)"
echo "user $(id -un) uid $(id -u)"
echo "os $(. /etc/os-release && echo "$PRETTY_NAME")"
# The full tier through the runner (#140): the same command as on any other
# machine, with an explicit file list, so no glob is needed.
env -u NODE_OPTIONS node gate/tests/run.mjs full --reporter junit --record /out/record.txt
status=$?
echo "exit $status"
exit $status
