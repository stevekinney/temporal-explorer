import { Project, type CompilerOptions } from 'ts-morph';

import { joinProjectPath, normalizeProjectPath, resolveProjectPath, toProjectPath } from './paths';

export type FileSource = {
  root: string;
  list(globs: string[]): Promise<string[]>;
  read(path: string): Promise<string>;
  exists(path: string): Promise<boolean>;
  hash(path: string): Promise<string>;
  createProject(tsconfigPath: string | undefined, files: string[]): Promise<Project>;
};

const excludedTestFilePattern = /\.(test|spec)\.tsx?$/u;

function isDependencyPath(path: string): boolean {
  return path.split('/').includes('node_modules');
}

function shouldIncludeSourcePath(relativePath: string): boolean {
  return !excludedTestFilePattern.test(relativePath) && !isDependencyPath(relativePath);
}

function segmentMatches(pattern: string, segment: string): boolean {
  const expression = new RegExp(
    `^${pattern
      .replace(/[.+^${}()|[\]\\]/gu, '\\$&')
      .replaceAll('?', '[^/]')
      .replaceAll('*', '[^/]*')}$`,
    'u',
  );
  return expression.test(segment);
}

function matchSegments(patternSegments: string[], pathSegments: string[]): boolean {
  const [pattern, ...remainingPattern] = patternSegments;

  if (pattern === undefined) {
    return pathSegments.length === 0;
  }

  if (pattern === '**') {
    return (
      matchSegments(remainingPattern, pathSegments) ||
      (pathSegments.length > 0 && matchSegments(patternSegments, pathSegments.slice(1)))
    );
  }

  const [pathSegment, ...remainingPath] = pathSegments;
  return (
    pathSegment !== undefined &&
    segmentMatches(pattern, pathSegment) &&
    matchSegments(remainingPattern, remainingPath)
  );
}

function matchesGlob(relativePath: string, glob: string): boolean {
  return matchSegments(glob.split('/'), relativePath.split('/'));
}

function parseCompilerOptions(tsconfigText: string | undefined): CompilerOptions {
  const defaults: CompilerOptions = {
    target: 99,
    module: 99,
    moduleResolution: 100,
    strict: true,
    skipLibCheck: true,
    esModuleInterop: true,
  };

  if (!tsconfigText) {
    return defaults;
  }

  try {
    const parsed: unknown = JSON.parse(tsconfigText);
    const compilerOptions =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as { compilerOptions?: unknown }).compilerOptions
        : undefined;

    return {
      ...defaults,
      ...(compilerOptions && typeof compilerOptions === 'object' && !Array.isArray(compilerOptions)
        ? (compilerOptions as CompilerOptions)
        : {}),
    };
  } catch {
    return defaults;
  }
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export class BunFileSource implements FileSource {
  root: string;

  constructor(root: string) {
    this.root = normalizeProjectPath(root);
  }

  async list(globs: string[]): Promise<string[]> {
    const discovered = new Set<string>();

    for (const pattern of globs) {
      const glob = new Bun.Glob(pattern);

      for await (const relativePath of glob.scan({ cwd: this.root, onlyFiles: true })) {
        if (shouldIncludeSourcePath(relativePath)) {
          discovered.add(resolveProjectPath(this.root, relativePath));
        }
      }
    }

    return [...discovered].toSorted((left, right) => left.localeCompare(right));
  }

  async read(path: string): Promise<string> {
    return await Bun.file(path).text();
  }

  async exists(path: string): Promise<boolean> {
    return await Bun.file(path).exists();
  }

  async hash(path: string): Promise<string> {
    const file = Bun.file(path);
    const hasher = new Bun.CryptoHasher('sha256');
    hasher.update(await file.arrayBuffer());
    return hasher.digest('hex');
  }

  async createProject(tsconfigPath: string | undefined, files: string[]): Promise<Project> {
    const project = new Project(
      tsconfigPath
        ? { tsConfigFilePath: tsconfigPath }
        : { compilerOptions: parseCompilerOptions(undefined) },
    );

    for (const file of files) {
      project.addSourceFileAtPathIfExists(file);
    }

    return project;
  }
}

export class InMemoryFileSource implements FileSource {
  root: string;
  readonly files: Map<string, string>;

  constructor(files: Map<string, string> | readonly [string, string][], root = '/project') {
    this.root = normalizeProjectPath(root);
    this.files = new Map(
      [...files].map(([path, contents]) => [normalizeProjectPath(path), contents] as const),
    );
  }

  async list(globs: string[]): Promise<string[]> {
    const matches: string[] = [];

    for (const path of this.files.keys()) {
      const relativePath = toProjectPath(this.root, path);

      if (
        shouldIncludeSourcePath(relativePath) &&
        globs.some((glob) => matchesGlob(relativePath, glob))
      ) {
        matches.push(path);
      }
    }

    return matches.toSorted((left, right) => left.localeCompare(right));
  }

  async read(path: string): Promise<string> {
    const contents = this.files.get(normalizeProjectPath(path));

    if (contents === undefined) {
      throw new Error(`File not found: ${path}`);
    }

    return contents;
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(normalizeProjectPath(path));
  }

  async hash(path: string): Promise<string> {
    return await sha256Hex(await this.read(path));
  }

  async createProject(tsconfigPath: string | undefined, files: string[]): Promise<Project> {
    const tsconfigText =
      tsconfigPath && (await this.exists(tsconfigPath)) ? await this.read(tsconfigPath) : undefined;
    const project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: parseCompilerOptions(tsconfigText),
    });

    for (const [path, contents] of this.files) {
      if (/\.(ts|tsx)$/u.test(path)) {
        project.createSourceFile(path, contents, { overwrite: true });
      } else {
        project.getFileSystem().writeFileSync(path, contents);
      }
    }

    for (const file of files) {
      project.addSourceFileAtPathIfExists(file);
    }

    return project;
  }
}

export async function createSourceFileHashes(
  source: FileSource,
  files: string[],
): Promise<Record<string, string>> {
  const entries = await Promise.all(
    files.map(async (file) => [toProjectPath(source.root, file), await source.hash(file)] as const),
  );

  return Object.fromEntries(entries.toSorted(([left], [right]) => left.localeCompare(right)));
}

export function sourcePath(source: FileSource, path: string): string {
  return resolveProjectPath(source.root, path);
}

export function sourceJoin(source: FileSource, ...parts: string[]): string {
  return joinProjectPath(source.root, ...parts);
}
