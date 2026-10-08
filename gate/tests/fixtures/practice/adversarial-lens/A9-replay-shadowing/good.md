**For the owner**

A repository you open can quietly replace the installed security reviewer. The design installs the reviewer in your user folder, but a project's own agent with the same name takes its place, and nothing in the design notices. I suggest the session checks for a same-named project agent before it relies on one.

**For the session**

### Attack paths

Red step:
- S2: anyone who can put a file in a repository the owner opens; they would want their own reviewer to read the work.
- S3: the same; they would want the install to skip a check.

Paths:
1. Entry: a cloned repository. Attacker controls: its agents folder. Steps: add an agent with the reviewer's name; the project agent takes the user agent's place in that session. Gain: the attacker's reviewer reads, and passes, the work. Control: none in S2. STRIDE: Spoofing, Elevation of privilege. ASVS: V15 Secure Coding and Architecture.

- F1: path 1. Confirmed by the documented priority of project agents over user agents. Smallest change: a check in the session for a same-named project agent. Check: a planted project agent is reported and the session stops.

```lens-findings
{
  "lens": "adversarial-lens",
  "verdict": "blocking",
  "findings": [
    {
      "id": "F1",
      "anchor": {
        "kind": "section",
        "id": "S2"
      },
      "severity": "high",
      "likelihood": "medium",
      "headline": "A project's own agent of the same name replaces the installed reviewer"
    }
  ],
  "notChecked": [
    "S4: the install script itself was not handed over"
  ]
}
```
