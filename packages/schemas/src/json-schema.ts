import { z, type ZodType } from 'zod';

import {
  artifactSchemasByVersion,
  artifactSchemaVersions,
  type ArtifactSchemaVersion,
} from './index';

export type EmittedJsonSchema = {
  /** Artifact schema version, such as `temporal-analysis/v1`. */
  schemaVersion: ArtifactSchemaVersion;
  /** File name for the checked-in JSON Schema document. */
  fileName: string;
  /** The JSON Schema document. */
  schema: Record<string, unknown>;
};

function toFileName(schemaVersion: ArtifactSchemaVersion): string {
  return `${schemaVersion.replace('/', '.')}.schema.json`;
}

/**
 * Emits a JSON Schema document for every supported artifact version so
 * downstream tools can validate artifacts without running TypeScript.
 */
export function emitJsonSchemas(): EmittedJsonSchema[] {
  return Object.values(artifactSchemaVersions).map((schemaVersion) => {
    const artifactSchema: ZodType = artifactSchemasByVersion[schemaVersion];
    const schema = z.toJSONSchema(artifactSchema, {
      target: 'draft-2020-12',
      cycles: 'ref',
      reused: 'ref',
    });

    return {
      schemaVersion,
      fileName: toFileName(schemaVersion),
      schema: {
        $id: `https://temporal-explorer.dev/schemas/${schemaVersion}`,
        title: schemaVersion,
        ...schema,
      },
    };
  });
}
