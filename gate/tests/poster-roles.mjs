// A helper for the poster's older tests (PACT-77): an issue, pull request or
// spec post must sort its quote into the intent's words and the task's, but
// those tests are about something else. `withRoles` gives each role-less
// passage of such a post the role `both`, and leaves every other post as it is,
// so a test of the roles themselves (poster-quotes.test.mjs) writes its own.
const SORTED = new Set(['issue', 'pull-request', 'spec']);

export function withRoles(doc) {
  if (doc === null || typeof doc !== 'object' || !SORTED.has(doc.kind) || !Array.isArray(doc.quote)) return doc;
  const quote = doc.quote.map(q => (q !== null && typeof q === 'object' && !Object.hasOwn(q, 'role') ? { ...q, role: 'both' } : q));
  return { ...doc, quote };
}
