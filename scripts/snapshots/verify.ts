import { createDocumentationSetFromArtifacts } from '@temporal-explorer/api';

const fixtureRoot = new URL('../../fixtures/basic-order/', import.meta.url);
const documentationDirectory = new URL('.temporal-explorer/docs/', fixtureRoot);

async function readJsonFixture(path: string): Promise<unknown> {
  return await Bun.file(new URL(path, fixtureRoot)).json();
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

async function verifyDocumentationSnapshots(): Promise<void> {
  const analysisArtifact = await readJsonFixture('.temporal-explorer/analysis.json');
  const traceArtifact = await readJsonFixture('.temporal-explorer/histories/success.trace.json');
  const overlayArtifact = await readJsonFixture('.temporal-explorer/overlays/success.overlay.json');
  const firstRender = createDocumentationSetFromArtifacts({
    analysisArtifact,
    traceArtifacts: [traceArtifact],
    overlayArtifacts: [overlayArtifact],
  }).value;
  const secondRender = createDocumentationSetFromArtifacts({
    analysisArtifact,
    traceArtifacts: [traceArtifact],
    overlayArtifacts: [overlayArtifact],
  }).value;

  if (stableStringify(firstRender) !== stableStringify(secondRender)) {
    throw new Error('Documentation render output changed between identical runs.');
  }

  for (const documentationFile of firstRender) {
    const snapshotUrl = new URL(documentationFile.path, documentationDirectory);

    if (!(await Bun.file(snapshotUrl).exists())) {
      throw new Error(`Missing documentation snapshot: ${snapshotUrl.pathname}`);
    }

    const actual = await Bun.file(snapshotUrl).text();

    if (actual !== documentationFile.contents) {
      throw new Error(
        `Stale documentation snapshot: ${snapshotUrl.pathname}. Run temporal-explorer docs for the fixture.`,
      );
    }
  }

  console.log(`Verified ${firstRender.length} documentation snapshot(s).`);
}

await verifyDocumentationSnapshots();
