/**
 * Writes (or drift-checks with --check) the checked-in JSON Schema documents
 * emitted from the runtime Zod artifact schemas.
 */
import { format, resolveConfig } from 'prettier';

import { emitJsonSchemas } from '@temporal-explorer/schemas/json-schema';

const outputRoot = new URL('../../packages/schemas/json-schema/', import.meta.url);
const checkOnly = Bun.argv.includes('--check');

for (const emitted of emitJsonSchemas()) {
  const outputUrl = new URL(emitted.fileName, outputRoot);
  const prettierConfig = await resolveConfig(outputUrl.pathname);
  const text = await format(JSON.stringify(emitted.schema), {
    ...prettierConfig,
    parser: 'json',
  });

  if (checkOnly) {
    const existing = Bun.file(outputUrl);

    if (!(await existing.exists()) || (await existing.text()) !== text) {
      throw new Error(
        `${outputUrl.pathname} is stale. Run bun run schema:emit-json-schema to refresh it.`,
      );
    }

    console.log(`${emitted.fileName} is current.`);
  } else {
    await Bun.write(outputUrl, text);
    console.log(`Wrote ${outputUrl.pathname}`);
  }
}
