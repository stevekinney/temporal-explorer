import { readdir } from 'node:fs/promises';

import {
  createDocumentationSetFromArtifacts,
  renderTypeDeclarations,
} from '@temporal-explorer/api';
import { temporalAnalysisDocumentSchema } from '@temporal-explorer/schemas';

const fixturesRoot = new URL('../../fixtures/', import.meta.url);

async function readJsonFile(url: URL): Promise<unknown> {
  return await Bun.file(url).json();
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

async function listDirectories(url: URL): Promise<string[]> {
  const entries = await readdir(url.pathname, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted((left, right) => left.localeCompare(right));
}

async function readJsonArtifacts(directory: URL, suffix: string): Promise<unknown[]> {
  let entries: string[] = [];

  try {
    entries = await readdir(directory.pathname);
  } catch {
    return [];
  }

  return await Promise.all(
    entries
      .filter((entry) => entry.endsWith(suffix))
      .toSorted((left, right) => left.localeCompare(right))
      .map((entry) => readJsonFile(new URL(entry, directory))),
  );
}

async function verifyFixtureDocumentationSnapshots(fixture: string): Promise<number> {
  const fixtureRoot = new URL(`${fixture}/`, fixturesRoot);
  const artifactRoot = new URL('.temporal-explorer/', fixtureRoot);
  const documentationDirectory = new URL('docs/', artifactRoot);
  const analysisUrl = new URL('analysis.json', artifactRoot);

  if (!(await Bun.file(analysisUrl).exists())) {
    return 0;
  }

  const analysisArtifact = await readJsonFile(analysisUrl);
  const traceArtifacts = await readJsonArtifacts(
    new URL('histories/', artifactRoot),
    '.trace.json',
  );
  const overlayArtifacts = await readJsonArtifacts(
    new URL('overlays/', artifactRoot),
    '.overlay.json',
  );
  const renderInputs = { analysisArtifact, traceArtifacts, overlayArtifacts };
  const firstRender = createDocumentationSetFromArtifacts(renderInputs).value;
  const secondRender = createDocumentationSetFromArtifacts(renderInputs).value;

  if (stableStringify(firstRender) !== stableStringify(secondRender)) {
    throw new Error(`Documentation render output for ${fixture} changed between identical runs.`);
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

  return firstRender.length + (await verifyDeclarationSnapshots(fixture, analysisArtifact));
}

async function verifyDeclarationSnapshots(
  fixture: string,
  analysisArtifact: unknown,
): Promise<number> {
  const analysis = temporalAnalysisDocumentSchema.parse(analysisArtifact);
  const declarations = renderTypeDeclarations({ analysis }).value;
  const declarationsDirectory = new URL(`${fixture}/.temporal-explorer/workflows/`, fixturesRoot);

  for (const declaration of declarations) {
    const snapshotUrl = new URL(declaration.path, declarationsDirectory);

    if (!(await Bun.file(snapshotUrl).exists())) {
      throw new Error(`Missing declaration snapshot: ${snapshotUrl.pathname}`);
    }

    if ((await Bun.file(snapshotUrl).text()) !== declaration.contents) {
      throw new Error(
        `Stale declaration snapshot: ${snapshotUrl.pathname}. Run temporal-explorer types for the fixture.`,
      );
    }
  }

  return declarations.length;
}

let verified = 0;

for (const fixture of await listDirectories(fixturesRoot)) {
  verified += await verifyFixtureDocumentationSnapshots(fixture);
}

if (verified === 0) {
  throw new Error('No documentation snapshots were verified.');
}

console.log(`Verified ${verified} documentation snapshot(s).`);
