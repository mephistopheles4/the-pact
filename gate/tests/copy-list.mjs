// The paths the install harness copies into each throwaway repo: the files the
// install reads. Data only: no side effects, no program lookups, no imports,
// so the harness and the test runner (run.mjs) can both import it. Ordinary test
// code since #189, proved by use.

/** Folders copied whole, repo-relative. */
export const COPY_DIRS = Object.freeze(['claude', 'cross', 'gate', 'familiars']);

/** Single files copied, repo-relative: with the builder kit's files outside the copied folders (#203, S6), which kit.test.mjs holds to BUILDER_KIT. */
export const COPY_FILES = Object.freeze([
  '.gitattributes',
  'AGENTS.md',
  'builder/build.mjs',
  'builder/scriptorium.html',
  'examples/pact-config/builder.json',
  'examples/pact-config/blocks/move-1-matt-pocock.md',
  'examples/pact-config/blocks/move-2-matt-pocock.md',
  'examples/pact-config/blocks/move-3-done-criteria.md',
  'examples/pact-config/blocks/move-3-matt-pocock.md',
  'examples/pact-config/blocks/move-4-docs-check.md',
  'examples/pact-config/blocks/move-4-own-agent.md',
]);

/** Left out of the copied folders: the install drops it before any check. */
export const COPY_SKIP = Object.freeze(['gate/tests']);
