# Scriptorium lists your own presets

**2026-10-17.** The owner kept a personal preset in `~/.claude/pact/presets/` and wanted Scriptorium to list it beside the shipped ones. Tier: standard, with the security pair on the spec and the diff; the owner declined the full sensitive route, relayed by the head chef.

## What was built (#283)

- **`builder/build.mjs`** gains `personalPresetsDir` and `personalPresets`: the installed kit reads `pact/presets/*.json`, checks each as a builder file, and carries the ones that pass into the page's `ownPresets`. A bad file is left out with a `FINDING` line; a clone reads nothing. `loadBuilder` also refuses a file over 1 MiB before reading it and a `__proto__` key at any depth, returns `givenParts`, and two messages stopped quoting file text.
- **The page** lists them under "Your presets"; `startPicks` keeps agent rows ticked only for a shipped preset, and `takeNote` says why for the others.
- **`gate/install-core.mjs`**: `pact/presets` joins the never-touch list, with a test row seen to fail first.
- **`/scriptorium`, the docs and `CONTEXT.md`** say the kit reads the folder; `cloud-sessions/` and the committed page were regenerated.

## Decisions

- [ADR 0085](../adr/0085-a-persons-own-presets-are-read-from-one-folder-beside-the-kit.md): one fixed folder beside the kit, treated as shared files for agent rows.

## Record

- [The issue](https://github.com/mephistopheles4/the-pact/issues/283)
- [The spec, revision 2](https://github.com/mephistopheles4/the-pact/issues/283#issuecomment-6243270715)
- [The owner's earlier answers](https://github.com/mephistopheles4/the-pact/issues/283#issuecomment-6243104977) and [the go-ahead on revision 2](https://github.com/mephistopheles4/the-pact/issues/283#issuecomment-6243312506)
- [The spec pair's review](https://github.com/mephistopheles4/the-pact/issues/283#issuecomment-6243269325), [the security pair's](https://github.com/mephistopheles4/the-pact/issues/283#issuecomment-6243269683) and [the dispositions](https://github.com/mephistopheles4/the-pact/issues/283#issuecomment-6243270326)
- [The QA pair's review](https://github.com/mephistopheles4/the-pact/issues/283#issuecomment-6243723126), [the standards pair's](https://github.com/mephistopheles4/the-pact/issues/283#issuecomment-6243723405), [the unstated-lens review](https://github.com/mephistopheles4/the-pact/issues/283#issuecomment-6243723748) and [the security pair's](https://github.com/mephistopheles4/the-pact/issues/283#issuecomment-6243724070), with [the Lens dispositions table](https://github.com/mephistopheles4/the-pact/issues/283#issuecomment-6243724350). Five of the seven reports held a local path and stayed local, so those comments mark them withheld.
- [The owner's answers on the Test findings](https://github.com/mephistopheles4/the-pact/issues/283#issuecomment-6243605644)
- [The follow-up issue for escaped invisible characters](https://github.com/mephistopheles4/the-pact/issues/327)
