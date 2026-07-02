import type { Diagnostic } from '@temporal-explorer/schemas';

/** Severity override for a diagnostic code; `off` suppresses the diagnostic. */
export type DiagnosticSeverityOverride = 'error' | 'warning' | 'info' | 'off';

/** Connection profile for an existing Temporal instance; secrets stay in the environment. */
export type TemporalConnectionProfile = {
  address?: string | undefined;
  namespace?: string | undefined;
  apiKeyEnvironmentVariable?: string;
  tls?: {
    enabled: boolean;
    serverNameOverride?: string;
    clientCertificatePath?: string;
    clientKeyPath?: string;
  };
  defaultTaskQueue?: string;
};

/** The `temporal-explorer.config.ts` shape accepted by defineConfig. */
export type TemporalExplorerConfiguration = {
  tsconfig?: string;
  include?: string[];
  exclude?: string[];
  temporal?: {
    workflowGlobs?: string[];
    workerGlobs?: string[];
    clientGlobs?: string[];
  };
  connections?: Record<string, TemporalConnectionProfile>;
  output?: {
    directory?: string;
  };
  history?: {
    payloads?: {
      decode?: boolean;
      redact?: string[];
      maxPreviewBytes?: number;
    };
  };
  diagnostics?: Record<string, DiagnosticSeverityOverride>;
};

const severityOverrides = new Set(['error', 'warning', 'info', 'off']);

function assertStringArray(value: unknown, label: string): void {
  if (
    value !== undefined &&
    (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string'))
  ) {
    throw new Error(`temporal-explorer.config.ts: ${label} must be an array of strings.`);
  }
}

function assertDiagnosticOverrides(value: unknown): void {
  if (value === undefined) {
    return;
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(
      'temporal-explorer.config.ts: diagnostics must map diagnostic codes to severities.',
    );
  }

  for (const [code, severity] of Object.entries(value)) {
    if (typeof severity !== 'string' || !severityOverrides.has(severity)) {
      throw new Error(
        `temporal-explorer.config.ts: diagnostics.${code} must be error, warning, info, or off.`,
      );
    }
  }
}

/**
 * Runtime-validates a Temporal Explorer configuration. Structural mistakes
 * throw immediately so a broken config never silently degrades analysis.
 */
export function defineConfig(
  configuration: TemporalExplorerConfiguration,
): TemporalExplorerConfiguration {
  if (typeof configuration !== 'object' || configuration === null) {
    throw new Error('temporal-explorer.config.ts must export a configuration object.');
  }

  assertStringArray(configuration.include, 'include');
  assertStringArray(configuration.exclude, 'exclude');
  assertStringArray(configuration.temporal?.workflowGlobs, 'temporal.workflowGlobs');
  assertStringArray(configuration.temporal?.workerGlobs, 'temporal.workerGlobs');
  assertStringArray(configuration.temporal?.clientGlobs, 'temporal.clientGlobs');
  assertDiagnosticOverrides(configuration.diagnostics);

  return configuration;
}

/** Loads `temporal-explorer.config.ts` from a project root when present. */
export async function loadConfiguration(
  configPath: string,
): Promise<TemporalExplorerConfiguration | undefined> {
  if (!(await Bun.file(configPath).exists())) {
    return undefined;
  }

  const module = (await import(configPath)) as { default?: unknown };

  if (!module.default || typeof module.default !== 'object') {
    throw new Error(`${configPath} must default-export defineConfig(...).`);
  }

  return defineConfig(module.default as TemporalExplorerConfiguration);
}

/**
 * Applies configured severity overrides, keyed by stable diagnostic code.
 * Diagnostics configured `off` are removed.
 */
export function applySeverityOverrides(
  diagnostics: Diagnostic[],
  overrides: Record<string, DiagnosticSeverityOverride> | undefined,
): Diagnostic[] {
  if (!overrides) {
    return diagnostics;
  }

  const applied: Diagnostic[] = [];

  for (const diagnostic of diagnostics) {
    const override = overrides[diagnostic.code];

    if (override === 'off') {
      continue;
    }

    applied.push(override ? { ...diagnostic, severity: override } : diagnostic);
  }

  return applied;
}
