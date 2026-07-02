/**
 * Regenerates every committed `.temporal-explorer` artifact for every fixture
 * that has generated histories: analysis, trace, overlay, and documentation.
 *
 * The CLI command surface is the only writer, so committed fixture artifacts
 * always match what a user would produce by running the commands themselves.
 */
import { main } from '@temporal-explorer/cli';

import { fixtureHistories } from './manifest';

const fixturesRoot = new URL('../../fixtures/', import.meta.url);

function getFlagValue(flag: string): string | undefined {
  const index = Bun.argv.indexOf(flag);
  return index >= 0 ? Bun.argv[index + 1] : undefined;
}

async function runCli(args: string[]): Promise<void> {
  const exitCode = await main(args, {
    stdout: () => {},
    stderr: async (text) => {
      await Bun.write(Bun.stderr, text);
    },
    isInteractive: false,
  });

  if (exitCode !== 0) {
    throw new Error(`temporal-explorer ${args.join(' ')} exited with ${exitCode}.`);
  }
}

const fixtureFilter = getFlagValue('--fixture');
const artifactDefinitions = fixtureHistories.filter(
  (definition) => definition.generateArtifacts !== false,
);
const fixtures = [...new Set(artifactDefinitions.map((definition) => definition.fixture))]
  .filter((fixture) => !fixtureFilter || fixture === fixtureFilter)
  .toSorted((left, right) => left.localeCompare(right));

if (fixtures.length === 0) {
  throw new Error(`No fixtures matched ${fixtureFilter ?? '<all>'}.`);
}

for (const fixture of fixtures) {
  const fixtureRoot = new URL(`${fixture}/`, fixturesRoot).pathname;
  const histories = artifactDefinitions.filter((definition) => definition.fixture === fixture);

  await runCli(['analyze', '--project', fixtureRoot]);

  for (const definition of histories) {
    const historyPath = new URL(`${fixture}/histories/${definition.history}.json`, fixturesRoot)
      .pathname;
    await runCli(['history', 'import', '--project', fixtureRoot, '--file', historyPath]);
    await runCli([
      'trace',
      definition.workflowType,
      '--project',
      fixtureRoot,
      '--history',
      definition.history,
    ]);
  }

  await runCli(['docs', '--project', fixtureRoot]);
  console.log(`Regenerated artifacts for ${fixture}.`);
}
