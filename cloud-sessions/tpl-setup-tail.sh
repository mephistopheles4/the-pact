echo "== Result"
fail=0
for e in "${SKILLS[@]}"; do
  n="$(basename "${e#* }")"
  case "$BAD_SKILLS" in *" $n "*) if present "$n"; then echo "MISSING: $n (refused at its pin; an older copy is kept)"; else echo "MISSING: $n"; fi; fail=$((fail+1)); continue ;; esac
  present "$n" || { echo "MISSING: $n"; fail=$((fail+1)); }
done
echo "$(( ${#SKILLS[@]} - fail ))/${#SKILLS[@]} skills present"
# What the skills and plugins steps left out, each line only when it has a name.
[ "${#SKIPPED_TIME[@]}" -gt 0 ] && echo "skipped (time): ${SKIPPED_TIME[*]}"
[ "${#NOT_FETCHED[@]}" -gt 0 ] && echo "not fetched at pin: ${NOT_FETCHED[*]}"
[ "${#SKIPPED_SOURCE[@]}" -gt 0 ] && echo "skipped (source): ${SKIPPED_SOURCE[*]}"
[ "${#NOT_INSTALLED[@]}" -gt 0 ] && echo "not installed: ${NOT_INSTALLED[*]}"
[ "$OFFICIAL_PRESENT" = "1" ] && echo "official marketplace present: claude-plugins-official is configured beside pact-pinned-plugins"
[ "$OFFICIAL_PRESENT" = "unknown" ] && echo "official marketplace: unknown, the marketplace list could not be read"
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
# What the GitHub API answers a token-free request during setup (#183 T3): a
# login, anonymous or unexpected, never the body. Outside the fetch budget.
if command -v curl >/dev/null 2>&1 && command -v node >/dev/null 2>&1; then
  env -u GH_TOKEN -u GITHUB_TOKEN curl -s --max-time 10 -w '\n%{http_code}' https://api.github.com/user 2>/dev/null | node -e "$PROXY_LINE_PROGRAM" 2>/dev/null || echo "github api during setup: unexpected"
else
  echo "github api during setup: unexpected"
fi

# The marker names this exact script. It prints only when every file was
# written, every hash matched and the pinned Node is on the PATH.
if [ "$CONFIG_WRITTEN" -eq "$EXPECTED_WRITES" ] && [ "$HASH_FAILED" -eq 0 ] && [ -z "${NODE_FAILED:-}" ]; then
  echo "pact cloud copy __PACT_CLOUD_MARKER__"
else
  echo "pact cloud copy INCOMPLETE ($CONFIG_WRITTEN of $EXPECTED_WRITES written, $HASH_FAILED hash mismatches${NODE_FAILED:+, node: $NODE_FAILED})"
fi
rm -rf "$PACT_STEP_DIR" "$PACT_LOG_DIR"
exit 0
