echo "== Result"
fail=0
for e in "${SKILLS[@]}"; do
  n="$(basename "${e#* }")"
  present "$n" || { echo "MISSING: $n"; fail=$((fail+1)); }
done
echo "$(( ${#SKILLS[@]} - fail ))/${#SKILLS[@]} skills present"
if command -v gh >/dev/null 2>&1; then echo "gh: $(gh --version | head -n 1)"; else echo "WARN: gh not found; the tracker rule fails closed"; fi
EXPECTED_WRITES=__EXPECTED_COUNT__
echo "$CONFIG_WRITTEN config files written (expected $EXPECTED_WRITES)"

# Each written file against the sha256 the generator gave it.
HASH_FAILED=0
check_hash() {
  local want="$1" rel="$2" got
  got="$(sha256sum "$CLAUDE_HOME/$rel" 2>/dev/null | cut -d ' ' -f 1)"
  if [ "$got" = "$want" ]; then
    echo "hash ok: ~/.claude/$rel"
  else
    echo "HASH MISMATCH: ~/.claude/$rel"; HASH_FAILED=$((HASH_FAILED + 1))
  fi
}
__EXPECTED_HASHES__
# Node: the wrapper, run by path, so the check doesn't rest on setup's own PATH.
NODE_SEEN="$(/root/.local/bin/node --version 2>/dev/null || echo none)"
echo "node: $NODE_SEEN"
if [ -z "${NODE_FAILED:-}" ] && [ "$NODE_SEEN" != "v$NODE_VERSION" ]; then
  NODE_FAILED=version
  echo "WARN: node is $NODE_SEEN, not the pinned v$NODE_VERSION"
fi
if [ -n "${NODE_FAILED:-}" ]; then echo "WARN: Node $NODE_VERSION not installed (node: $NODE_FAILED); the image's Node stays on the PATH"; fi

# Whether a GitHub token was in the environment during setup. Never its value.
# Under the cloud's GitHub proxy the token variables hold a stand-in, so
# "present" doesn't prove a real credential, and "absent" doesn't prove the
# setup's fetched code had no route to GitHub.
if [ -n "${GH_TOKEN:-}" ] || [ -n "${GITHUB_TOKEN:-}" ]; then
  echo "github token during setup: present"
else
  echo "github token during setup: absent"
fi

# The marker names this exact script. It prints only when every file was
# written, every hash matched and the pinned Node is on the PATH.
if [ "$CONFIG_WRITTEN" -eq "$EXPECTED_WRITES" ] && [ "$HASH_FAILED" -eq 0 ] && [ -z "${NODE_FAILED:-}" ]; then
  echo "pact cloud copy __PACT_CLOUD_MARKER__"
else
  echo "pact cloud copy INCOMPLETE ($CONFIG_WRITTEN of $EXPECTED_WRITES written, $HASH_FAILED hash mismatches${NODE_FAILED:+, node: $NODE_FAILED})"
fi
exit 0
