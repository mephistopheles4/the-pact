// The paths the install harness copies into each throwaway repo: the files the
// install reads. Data only: no side effects, no program lookups, no imports,
// so the harness and the test runner (run.mjs) can both import it. Ordinary test
// code since #189, proved by use.

/** Folders copied whole, repo-relative. */
export const COPY_DIRS = Object.freeze(['builder', 'claude', 'cross', 'gate', 'familiars']);

/** Single files copied, repo-relative: with builder/, the builder kit, which /scriptorium brings (#203, S6). */
export const COPY_FILES = Object.freeze(['.gitattributes', 'AGENTS.md', 'docs/brand/scriptorium/scriptorium-mark.svg', 'examples/pact-config/builder.json']);

/** Left out of the copied folders: the install drops it before any check. */
export const COPY_SKIP = Object.freeze(['gate/tests']);
