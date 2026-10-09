// The paths the install harness copies into each throwaway repo: the files the
// install reads. Data only: no side effects, no program lookups, no imports,
// so the harness and the test runner (run.mjs) can both import it. On the
// probe floor by name (AGENTS.md).

/** Folders copied whole, repo-relative. */
export const COPY_DIRS = Object.freeze(['claude', 'cross', 'gate', 'familiars']);

/** Single files copied, repo-relative. */
export const COPY_FILES = Object.freeze(['scripts/install.ps1', '.gitattributes', 'AGENTS.md']);

/** Left out of the copied folders: the install drops it before any check. */
export const COPY_SKIP = Object.freeze(['gate/tests']);
