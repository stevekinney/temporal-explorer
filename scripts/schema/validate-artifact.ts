import { validateArtifact } from '@temporal-explorer/schemas';

const artifactPath = Bun.argv[2];

if (!artifactPath) {
  console.error('Usage: bun run schema:validate <artifact.json>');
  process.exit(1);
}

const artifact = await Bun.file(artifactPath).json();
const result = validateArtifact(artifact);

if (!result.success) {
  for (const issue of result.issues) {
    console.error(`${issue.path}: ${issue.message}`);
  }

  process.exit(1);
}

console.log(`${artifactPath} is valid ${result.schemaVersion}.`);
