// A matching check name alone does not establish which workflow produced it.
export function verifyCI(checks, head, workflow) {
  const runs = [];
  for (const name of ['gate', 'gate-windows']) {
    const check = checks.find(c => c.name === name);
    if (!check || check.app?.slug !== 'github-actions' || check.head_sha !== head || check.conclusion !== 'success') throw Error('required CI jobs are not passing on this head');
    const match = check.details_url?.match(/^https:\/\/github\.com\/mephistopheles4\/the-pact\/actions\/runs\/([0-9]+)\/job\/[0-9]+$/);
    if (!match) throw Error('required CI origin mismatch');
    const run = workflow(match[1]);
    if (run.head_sha !== head || run.path !== '.github/workflows/gate.yml' || run.head_repository?.full_name !== 'mephistopheles4/the-pact' || run.status !== 'completed' || run.conclusion !== 'success') throw Error('required workflow is not passing on this head');
    runs.push({ name, url: check.details_url, head });
  }
  return runs;
}
