// A Node older than the pact's floor, as a project that pins one would run
// the builder kit (#203, S6): it reports 22.1.0 as this process's version.
// Loaded only as a child's --import, never imported by a test.
Object.defineProperty(process.versions, 'node', { value: '22.1.0' });
