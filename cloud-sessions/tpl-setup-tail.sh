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
if command -v node >/dev/null 2>&1; then
  echo "node: $(node --version)"
  node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 20 ? 0 : 1)' \
    || echo "WARN: node is older than 20; the cross script needs 20 or later"
else
  echo "WARN: node not found; the cross script cannot run"
fi
[ -f "$CLAUDE_HOME/pact/cross.mjs" ] || echo "WARN: ~/.claude/pact/cross.mjs is missing; lens reviews will stop"

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
# written and every hash matched.
if [ "$CONFIG_WRITTEN" -eq "$EXPECTED_WRITES" ] && [ "$HASH_FAILED" -eq 0 ]; then
  echo "pact cloud copy __PACT_CLOUD_MARKER__"
else
  echo "pact cloud copy INCOMPLETE ($CONFIG_WRITTEN of $EXPECTED_WRITES written, $HASH_FAILED hash mismatches)"
fi
exit 0
