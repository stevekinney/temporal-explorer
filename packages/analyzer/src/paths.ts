import { Node, type SourceFile } from 'ts-morph';

import type { SourceLocation } from '@temporal-explorer/schemas';

export function normalizeProjectPath(path: string): string {
  const normalized = path.replaceAll('\\', '/').replace(/\/+/gu, '/');
  return normalized.length > 1 ? normalized.replace(/\/$/u, '') : normalized;
}

export function joinProjectPath(...parts: string[]): string {
  const [first = '', ...rest] = parts;
  const joined = [first, ...rest]
    .filter((part) => part.length > 0)
    .join('/')
    .replace(/\/+/gu, '/');
  return normalizeProjectPath(first.startsWith('/') ? `/${joined.replace(/^\/+/u, '')}` : joined);
}

export function resolveProjectPath(root: string, path: string): string {
  if (path.startsWith('/')) {
    return normalizeProjectPath(path);
  }

  return joinProjectPath(root, path);
}

export function toProjectPath(root: string, path: string): string {
  const normalizedRoot = normalizeProjectPath(root);
  const normalizedPath = normalizeProjectPath(path);

  if (normalizedPath === normalizedRoot) {
    return '';
  }

  const prefix = `${normalizedRoot}/`;
  return normalizedPath.startsWith(prefix) ? normalizedPath.slice(prefix.length) : normalizedPath;
}

export function createSourceLocation(
  root: string,
  sourceFile: SourceFile,
  node: Node,
  symbolName?: string,
): SourceLocation {
  const startOffset = node.getStart();
  const endOffset = node.getEnd();
  const start = sourceFile.getLineAndColumnAtPos(startOffset);
  const end = sourceFile.getLineAndColumnAtPos(endOffset);
  const baseLocation = {
    path: toProjectPath(root, sourceFile.getFilePath()),
    pathKind: 'project-relative' as const,
    start: {
      line: start.line,
      column: start.column,
      offset: startOffset,
    },
    end: {
      line: end.line,
      column: end.column,
      offset: endOffset,
    },
  };

  return symbolName ? { ...baseLocation, symbolName } : baseLocation;
}

export async function hashFile(path: string): Promise<string> {
  const file = Bun.file(path);
  const hasher = new Bun.CryptoHasher('sha256');
  hasher.update(await file.arrayBuffer());
  return hasher.digest('hex');
}

export async function createSourceFileHashes(
  root: string,
  files: string[],
): Promise<Record<string, string>> {
  const entries = await Promise.all(
    files.map(async (file) => [toProjectPath(root, file), await hashFile(file)] as const),
  );

  return Object.fromEntries(entries.toSorted(([left], [right]) => left.localeCompare(right)));
}

function isDependencyPath(relativePath: string): boolean {
  return relativePath.split('/').includes('node_modules');
}

export async function discoverFiles(root: string, globs: string[]): Promise<string[]> {
  const discovered = new Set<string>();

  for (const pattern of globs) {
    const glob = new Bun.Glob(pattern);

    for await (const relativePath of glob.scan({ cwd: root, onlyFiles: true })) {
      if (
        !relativePath.endsWith('.test.ts') &&
        !relativePath.endsWith('.spec.ts') &&
        !isDependencyPath(relativePath)
      ) {
        discovered.add(resolveProjectPath(root, relativePath));
      }
    }
  }

  return [...discovered].toSorted((left, right) => left.localeCompare(right));
}
