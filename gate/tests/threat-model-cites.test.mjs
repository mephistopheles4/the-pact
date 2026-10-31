// Keeps the threat model's labels resolvable (#456 C7): every R-label a live doc
// cites has an anchor in the threat model, and every entry anchor there has a
// provenance line naming its class, K, or "retired". The threat model is
// revised by class from time to time (the rules file's "Threat-model
// revision"), and about twenty live docs cite its labels, so a revision that
// loses one would leave a cite pointing at nothing. Code is left out on
// purpose: most R-tokens in code are a spec's row numbers, not labels.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const threatModel = join("docs", "threat-model.md");

/** The live docs whose R-labels must resolve: dated ADRs and log entries are records of their date. */
export function liveDocs(base) {
  const files = ["README.md", "SECURITY.md", "CONTEXT.md", "AGENTS.md"].filter((f) => existsSync(join(base, f)));
  for (const dir of ["docs", join("docs", "agents")]) {
    for (const f of readdirSync(join(base, dir))) {
      const rel = join(dir, f);
      if (f.endsWith(".md") && rel !== threatModel) files.push(rel);
    }
  }
  const walk = (dir) => {
    for (const f of readdirSync(join(base, dir))) {
      const rel = join(dir, f);
      if (statSync(join(base, rel)).isDirectory()) walk(rel);
      else if (f.endsWith(".md")) files.push(rel);
    }
  };
  walk("claude");
  return files;
}

/** The entry anchors the threat model holds: `r<n>`, `crypto-pins` and `crypto-actions`. */
export function entryAnchors(text) {
  return new Set([...text.matchAll(/<a id="(r\d+|crypto-pins|crypto-actions)"><\/a>/g)].map((m) => m[1]));
}

/** Each cite of an R-label in `docs` (a map of file to text) that has no anchor in `tm`. */
export function unresolvedCites(docs, tm) {
  const anchors = entryAnchors(tm);
  const out = [];
  for (const [file, text] of docs) {
    for (const m of text.matchAll(/\bR(\d{1,3})\b/g)) {
      if (!anchors.has(`r${m[1]}`)) out.push(`${file}: R${m[1]}`);
    }
  }
  return [...new Set(out)];
}

/** Each entry anchor with no provenance line naming a class (C1 to C9), K, or "retired". */
export function anchorsWithoutProvenance(tm) {
  const named = new Set();
  for (const m of tm.matchAll(/^- \*\*(R\d+|crypto-pins|crypto-actions)[a-z]?\*\* · (C[1-9]|K|retired)\b/gm)) {
    named.add(m[1].startsWith("R") ? `r${m[1].slice(1)}` : m[1]);
  }
  return [...entryAnchors(tm)].filter((a) => !named.has(a));
}

const tm = () => readFileSync(join(root, threatModel), "utf8");

test("every R-label a live doc cites has an anchor in the threat model", () => {
  const docs = liveDocs(root).map((f) => [relative(root, join(root, f)), readFileSync(join(root, f), "utf8")]);
  assert.deepEqual(unresolvedCites(docs, tm()), []);
});

test("every entry anchor in the threat model has a provenance line naming its class", () => {
  assert.ok(entryAnchors(tm()).size > 0, "docs/threat-model.md has no entry anchors");
  assert.deepEqual(anchorsWithoutProvenance(tm()), []);
});

test("bad case: a cite of an unused label is caught", () => {
  const page = '- <a id="r1"></a>**R1. A risk.**\n';
  assert.deepEqual(unresolvedCites([["x.md", "See R1 and R99."]], page), ["x.md: R99"]);
});

test("bad case: an anchor whose provenance line names no class is caught", () => {
  const page = '- <a id="r1"></a>**R1. A risk.**\n- <a id="r2"></a>**R2. Another.**\n\n- **R1** · C1 · score 0.1/0.2\n- **R2** · score 0.3/0.4\n';
  assert.deepEqual(anchorsWithoutProvenance(page), ["r2"]);
});
