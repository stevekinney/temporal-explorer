import { createHash } from 'node:crypto';
import { basename, dirname, join, relative, resolve } from 'node:path';

import type { RuntimeTraceDocument } from '@temporal-explorer/schemas';

import { isRecord, readStringField } from './history-json';
import {
  parseEventHistory,
  type HistoryProvenance,
  type ParseEventHistoryOptions,
} from './trace-builder';

export type ImportEventHistoryFileOptions = Omit<ParseEventHistoryOptions, 'history'> & {
  file: string;
};

async function hashFile(path: string): Promise<string> {
  const bytes = await Bun.file(path).bytes();
  return createHash('sha256').update(bytes).digest('hex');
}

function toProjectPath(root: string | undefined, path: string): string {
  return root ? relative(root, path) || '.' : path;
}

function getProvenancePath(historyPath: string): string {
  const historyName = basename(historyPath, '.json');
  return join(dirname(historyPath), `${historyName}.provenance.json`);
}

function readHistoryProvenance(value: unknown): HistoryProvenance | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const workflowId = readStringField(value, 'workflowId');
  const workflowType = readStringField(value, 'workflowType');
  const temporalSdkVersion = readStringField(value, 'temporalSdkVersion');
  const provenance: HistoryProvenance = {};

  if (workflowId) {
    provenance.workflowId = workflowId;
  }

  if (workflowType) {
    provenance.workflowType = workflowType;
  }

  if (temporalSdkVersion) {
    provenance.temporalSdkVersion = temporalSdkVersion;
  }

  return provenance;
}

async function readOptionalProvenance(historyPath: string): Promise<HistoryProvenance | undefined> {
  const provenanceFile = Bun.file(getProvenancePath(historyPath));

  if (!(await provenanceFile.exists())) {
    return undefined;
  }

  return readHistoryProvenance(await provenanceFile.json());
}

export async function importEventHistoryFile(
  options: ImportEventHistoryFileOptions,
): Promise<RuntimeTraceDocument> {
  const historyPath = resolve(options.file);
  const projectRoot = options.projectRoot ? resolve(options.projectRoot) : undefined;
  const history = await Bun.file(historyPath).json();
  const provenance = options.provenance ?? (await readOptionalProvenance(historyPath));
  const parseOptions: ParseEventHistoryOptions = {
    history,
    historyPath: toProjectPath(projectRoot, historyPath),
    historyHash: options.historyHash ?? (await hashFile(historyPath)),
    traceId: options.traceId ?? basename(historyPath, '.json'),
  };

  if (options.importedFrom) {
    parseOptions.importedFrom = options.importedFrom;
  }

  if (options.payloadPreview) {
    parseOptions.payloadPreview = options.payloadPreview;
  }

  if (projectRoot) {
    parseOptions.projectRoot = toProjectPath(process.cwd(), projectRoot);
  }

  if (provenance) {
    parseOptions.provenance = provenance;
  }

  return parseEventHistory(parseOptions);
}

export type { PayloadPreviewConfiguration } from './payloads';
export type { HistoryProvenance, ParseEventHistoryOptions } from './trace-builder';
export { parseEventHistory };
