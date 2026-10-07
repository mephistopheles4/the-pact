# Executability is judged at spec time, against the target environment

`executability-lens` reads the spec before any code exists. It asks whether a builder could start from the spec alone, and whether the work, built as written, would run end to end on its target environment. For work that runs, such as an app, a service or a script, the spec must:

- **name the target environment,** and how it differs from the development environment;
- **put a clean build and a clean lint** in its done-criteria;
- **include one step that runs the work end to end** on that environment.

A spec missing any of these has a stall, and the stall is a finding. The lens runs nothing, and running the change stays `behaviour-lens`'s job at move 4.

## Why

- **The owner's question 2.** The owner's words: "the reviewer that will make sure that we can actually run the app as specified on the target environment. Sometimes our target environments don't run the same as the development environment. Sometimes we have things that prevent execution, such as build or lint errors."
- **The lens runs at move 2.** That is spec time, so it has nothing to run. Two readings were open. One was to check the spec for what the run will need; the other was to run the app. The owner chose spec time: "I did forget that this runs at spec time, so I'm gonna go with spec time as recommended."
- **Running the app would have changed the roster.** It needs a shell, and the protected set says no lens gains a tool. It would also overlap `behaviour-lens`. So it would have been a spec change through both spec reviewers.

## How this was decided

- **2026-10-07** — Decided in mephistopheles4/the-pact#99, at the contract interview. The owner's answers and the spec-time choice are recorded in comment 6035589998.
