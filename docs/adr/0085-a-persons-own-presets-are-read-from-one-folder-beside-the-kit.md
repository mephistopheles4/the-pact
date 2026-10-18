# A person's own presets are read from one folder beside the kit

The installed builder kit reads the person's own presets from one fixed folder, `<Claude home>/pact/presets/`, and the page lists them apart under "Your presets". A clone's run reads no such folder, so the committed page never carries them (#283).

## Why

- **The owner keeps a preset of their own** and wanted it beside the shipped ones. The shipped folder is install-managed, so a file put there would be overwritten or deleted.
- **A file there may be one someone handed the person.** A preset can hold whole agent files, which can replace `scout` or a security lens (threat model R32). So the page treats an own preset as it treats a shared file: its agent rows start unticked, and the take view names the file it came from.

## What the rules are

- **One folder, no option.** `personalPresetsDir(root)` is `<root>/../presets` when `root` is the kit, else null. There is no `--presets` option; one can be added later without breaking the folder.
- **Left out, with a finding.** Each file is checked as a builder file is, plus a file-name pattern and a cap of 16 files. A file that fails is left out with a `FINDING` line that names its checked file name and its refusals; the run still exits zero. No message quotes text from inside a file.
- **Kept apart.** The page's data holds them under `ownPresets`, never in `presets`, so none becomes the landing preset or shadows a shipped one. Only an entry of `PACT.presets` starts with its agent rows ticked.
- **The install never touches the folder.** `pact/presets` joins `pact/blocks` on the never-touch list.
- **A `__proto__` key is refused** in any builder file, at any depth, since the page binds its data as an object literal.

## Also decided

- An own preset's security-default parts start ticked, as a shipped preset's do, so the take view names the file, the checklist shows every part, and the install's dry run says so before any install. The alternative, unticking those six parts, would close an eased path on threat model R30 at the cost of six ticks per use. The owner settled this with the go-ahead on spec revision 2, relayed by the head chef.
- The session running `/scriptorium` reads each preset's file name and text for secrets before the page is rendered, reports what it finds, and edits a preset only when asked. The render prints one `LISTED` line per preset it carries, so that read can be matched against what was written.
