# `coverage`, the coverage hint

`coverage` is an opt-in pact tool. For one security finding it asks a decision model whether the project's threat model already covers it, and prints a hint. **The hint is advisory.** It rules nothing, changes no severity or disposition, and a control that failed is never covered. The design is [spec 0010](spec/0010-coverage-hint.md).

## Turning it on

Two choices, each its own. In Scriptorium, tick `coverage` under the tools and pick a model under **Install a decision-one model**; or write them in `~/.pact/config.json`, then apply the install.

| Model | `~/.pact/config.json` | What else to do |
| --- | --- | --- |
| Clef Flash, the default | `"tools": ["clef", "coverage"]`, `"decision-model": "clef-flash"` | `node ~/.pact/tools/clef.mjs setup`, then the same with `--yes` ([clef.md](clef.md)) |
| Clef Full | `"tools": ["clef", "coverage"]`, `"decision-model": "clef-full"` | `clef setup --variant full`, then the same with `--yes` |
| Jev | `"tools": ["coverage"]`, `"decision-model": "jev"` | read [TypeSafe's terms](#typesafes-terms), set the key, list the repos |

With no `decision-model` key the tool asks the local Clef, whichever variant is set up. With a variant named, the other never answers for it (`unavailable (clef-variant)`). The tool reads the key at each run; a project configuration can't set it.

## What it sends, and where

| Model | Leaves the machine |
| --- | --- |
| Clef | Nothing. Requests go to `127.0.0.1`. |
| Jev, for a listed repo only | The finding's headline and evidence, and the entries file's `entries` and `scope` maps, to `https://api.typesafe.ai/v1/systemone`. No diff, spec or source path, unless the finding's own text holds one. |

**The repo list** is `~/.pact/coverage.json`: `{"jev_repos": ["<owner>/<name>"]}`. The tool reads the repo from `origin` in the folder it is given; a repo not on the list is refused (`coverage/not-listed`) and nothing is sent. A clone whose `origin` names a listed repo is sent as that repo, and so is a finding passed with another listed repo's folder.

**Before a Jev request** the tool refuses a secret-named environment variable's value, a hidden character, your home folder and your user name (`coverage/secret`, `coverage/personal`). It reads the text as written, so an encoded secret, private code or tracker text goes through. Read the finding as you would before posting it. A cloud session sends nothing, and so does a session with certificate checks off.

## The key

Jev reads `TYPESAFE_API_KEY` from the environment, and sends it only in the request's `Authorization` header. Set it in your own user environment or user-scope settings, only on a machine where you work a listed repo. Never put it in a file inside a repo: not a project's settings, `mise.toml` or `.env`. Every session started with that environment can read it. If it may have leaked, revoke it in your TypeSafe account and unset it.

## TypeSafe's terms

Read from TypeSafe's own pages on **2026-11-27**; they may have changed since. Check them yourself before listing a repo, in a browser: the site's terms bar automated access.

| Point | What the pages said |
| --- | --- |
| Training | Not on your data without your prior consent (Master Customer Agreement 4.1, updated 2026-09-23). It also takes a perpetual licence to derive "Telemetry" (classifications, metrics, learnings) from your data, usable without restriction, including to improve the service (4.1, 4.3). The help center says telemetry holds no input content; the agreement's definition, as read, states no such exclusion. |
| Retention | No fixed period or maximum: "as long as reasonably necessary". Zero data retention exists; the help center says it is free to every organization on request, other official pages say enterprise only. |
| Sharing | Service providers and subprocessors (AWS stores and processes live requests; other compute and network providers are listed), legal disclosure, and abuse reports. No sale. Processed in the United States. |
| Deletion | No single request or date range can be deleted. Zero data retention can be applied to past data by support request. The Data Processing Agreement, as read, has no deletion or return clause. |

**Before listing a repo, get zero data retention confirmed in writing.** Nothing enforces this: once a repo is listed and the key is set, its findings are sent.

Pages: `typesafe.ai/legal/mca`, `/legal/data-processing`, `/legal/privacy-policy` and `/legal/acceptable-use-policy`, `trust.typesafe.ai/subprocessors`, and the retention and deletion articles at `help.typesafe.ai`.

## Using it

Run it from a scratch folder outside every repo. In a POSIX shell:

```bash
node ~/.pact/tools/coverage.mjs status
node ~/.pact/tools/coverage.mjs ask --finding finding.txt --repo-dir <repo folder> --base <ref> [--ref <issue>/<round>/<finding>]
node ~/.pact/tools/coverage.mjs entries --repo-dir <repo folder> --base <ref>
```

In PowerShell, write the script as `"$HOME/.pact/tools/coverage.mjs"`.

- `ask` reads the finding file (the headline, then the evidence, at most 8,000 characters) and the project's entries at the base: `docs/threat-entries.json`, else a draft from `docs/threat-model.md`. It prints a line of numbers for the session, the hint line, and a result line.
- `entries` prints that draft, to edit into `docs/threat-entries.json` ([the entries file](spec/0010-coverage-hint.md#s2-the-entries-file)). It sends nothing.
- `status` prints the model, whether it is ready, for Jev whether the key is set and the listed repos, and the log's line count.

| Hint | Means |
| --- | --- |
| `likely covered by …` | an entry or an out-of-scope paragraph scored above 0.75 |
| `unsure: …` | the highest score is from 0.5 to 0.75 |
| `no entry found` | nothing reached 0.5 |
| `unavailable (<word>)` | no answer could be used (exit 1) |
| `no threat model` | the base holds neither file |

A `REFUSED coverage/<word>` line (exit 2) says why nothing was asked. A request over 30,000 characters is refused (`coverage/size`), on every model.

## The log

Each `ask` appends one line to `<Claude home>/pact-coverage/log.jsonl`: the time, the `--ref`, a hash of the finding, the repo, the entries' source, the model, the scores and the outcome. It never holds the finding's text, an entry's text or the key. At 1 MB it becomes `log.1.jsonl`, replacing the older one. No install writes or deletes that folder.

## Turning it off

Take `coverage` off the tools list and apply the install. With Jev, also unset `TYPESAFE_API_KEY` and revoke the key if it may have leaked. Delete `<Claude home>/pact-coverage/` by hand if you want the log gone. Findings already sent to TypeSafe can't be taken back one by one. Before installing a pact version from before `coverage`, take `decision-model` out of `~/.pact/config.json`: that installer refuses the key.
