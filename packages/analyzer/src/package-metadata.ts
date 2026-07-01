import { resolve } from 'node:path';

export type PackageJsonMetadata = {
  packageManager?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readStringRecord(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const entries = Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  );
  return Object.fromEntries(entries);
}

export async function readPackageJson(root: string): Promise<PackageJsonMetadata> {
  const packagePath = resolve(root, 'package.json');
  const file = Bun.file(packagePath);

  if (!(await file.exists())) {
    return {};
  }

  const value: unknown = await file.json();

  if (!isRecord(value)) {
    return {};
  }

  const metadata: PackageJsonMetadata = {};
  const dependencies = readStringRecord(value['dependencies']);
  const devDependencies = readStringRecord(value['devDependencies']);

  if (typeof value['packageManager'] === 'string') {
    metadata.packageManager = value['packageManager'];
  }

  if (dependencies) {
    metadata.dependencies = dependencies;
  }

  if (devDependencies) {
    metadata.devDependencies = devDependencies;
  }

  return metadata;
}

export function getPackageManager(
  packageJson: PackageJsonMetadata,
): 'bun' | 'npm' | 'pnpm' | 'yarn' | undefined {
  const packageManager = packageJson.packageManager?.split('@')[0];

  if (
    packageManager === 'bun' ||
    packageManager === 'npm' ||
    packageManager === 'pnpm' ||
    packageManager === 'yarn'
  ) {
    return packageManager;
  }

  return undefined;
}
