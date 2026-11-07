# Portable settings, from the-pact claude/settings.overlay.json. Plugin keys are absent here and always kept from the file.
SETTINGS_OVERLAY='__SETTINGS_OVERLAY__'
# The auto-compact window the cloud copy sets (#482), from the generator's own copy of the default; the cloud has no Off.
COMPACT_WINDOW='__COMPACT_WINDOW__'
COMPACT_SCRIPT="$CLAUDE_HOME/pact/hooks/compact-handoff.mjs"

# Deep-merge an overlay into ~/.claude/settings.json. The overlay wins on
# ordinary keys; the file wins on plugin keys; permissions.allow, .deny and .ask are
# joined and de-duplicated (jq's unique also sorts them), not replaced.
# The overlay's hooks never go through that merge, which would replace an
# owner's lists: each event is merged by key. A pact entry is an inner hook
# equal to the overlay's (its window aside) with the installed script's path as
# its first argument. When no group holds one, the group is appended after the
# event's other groups; otherwise the first group holding one is updated in
# place (only that inner hook, if the group holds others) and a second pact
# entry elsewhere is taken out. Then autoCompactWindow is set.
MERGE_PROGRAM='
  .[0] as $a | (.[1] | del(.hooks)) as $b | (.[1].hooks // {}) as $h
  | def pactHook:
      type == "object" and (keys | sort) == ["args","command","timeout","type"]
      and .type == "command" and .command == "node" and .timeout == 15
      and (.args | type == "array" and length == 2 and .[0] == $script and (.[1] | type == "string" and test("^[0-9]{6,7}$")));
    def holds: type == "object" and (.hooks | type == "array") and any(.hooks[]; pactHook);
    def put($event; $group):
      (.hooks[$event]) as $list
      | if $list == null then .hooks[$event] = [$group]
        elif ($list | type) != "array" then .
        elif ($list | any(.[]; holds)) then
          ($list | map(holds) | index(true)) as $first
          | .hooks[$event] = [ $list | to_entries[] | .key as $i | .value as $g
              | if ($g | holds | not) then $g
                elif $i == $first then
                  (if ($g.hooks | all(.[]; pactHook)) then $group
                   else ($g.hooks | map(pactHook) | index(true)) as $p
                     | $g | .hooks = [ .hooks | to_entries[] | select((.value | pactHook | not) or .key == $p) | if .key == $p then $group.hooks[0] else .value end ] end)
                else ($g | .hooks |= map(select(pactHook | not)) | if (.hooks | length) == 0 then empty else . end) end ]
        else .hooks[$event] = $list + [$group] end;
    ($a * $b)
  | reduce ("enabledPlugins", "extraKnownMarketplaces") as $k (.;
      if ($a | has($k)) then .[$k] = $a[$k] else . end)
  | reduce ("allow", "deny", "ask") as $k (.;
      if (($a.permissions // {}) | has($k)) or (($b.permissions // {}) | has($k))
      then .permissions[$k] = ((($a.permissions[$k] // []) + ($b.permissions[$k] // [])) | unique)
      else . end)
  | if ((.hooks | type) == "null" or (.hooks | type) == "object") then
      reduce ($h | to_entries[]) as $e (.;
        reduce ($e.value | map(walk(if . == "__PACT_HOOK_SCRIPT__" then $script elif . == "__PACT_WINDOW__" then $window else . end))[]) as $g (.;
          put($e.key; $g)))
    else . end
  | .autoCompactWindow = ($window | tonumber)'

merge_settings() {
  local target="$CLAUDE_HOME/settings.json" overlay="$1" tmp
  command -v jq >/dev/null 2>&1 || { echo "WARN: jq not found; settings.json not merged"; return; }
  if [ -f "$target" ] && ! jq -e 'type == "object"' "$target" >/dev/null 2>&1; then
    echo "WARN: $target is not a JSON object; left untouched"; return
  fi
  tmp="$(mktemp "$CLAUDE_HOME/.settings.json.XXXXXX")" \
    || { echo "WARN: mktemp failed; settings.json not merged"; return; }
  if jq -s --arg script "$COMPACT_SCRIPT" --arg window "$COMPACT_WINDOW" "$MERGE_PROGRAM" \
       <(if [ -f "$target" ]; then cat "$target"; else echo '{}'; fi) \
       <(printf '%s\n' "$overlay") > "$tmp" && [ -s "$tmp" ]; then
    if mv "$tmp" "$target"; then
      CONFIG_WRITTEN=$((CONFIG_WRITTEN + 1)); echo "merged ~/.claude/settings.json"
    else
      echo "WARN: could not replace settings.json"
    fi
  else
    rm -f "$tmp"; echo "WARN: settings merge failed; settings.json left untouched"
  fi
}
merge_settings "$SETTINGS_OVERLAY"
