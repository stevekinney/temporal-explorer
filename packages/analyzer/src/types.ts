import type { TemporalExplorerConfiguration } from './configuration';
import type { FileSource } from './file-source';

export type TemporalExplorerProject = {
  root: string;
  tsconfig: string;
  outputDirectory: string;
  workflowFiles: string[];
  fileSource?: FileSource;
  configuration?: TemporalExplorerConfiguration | undefined;
};

export type LoadTemporalExplorerProjectOptions = {
  root?: string;
  tsconfig?: string;
  outputDirectory?: string;
  workflowFiles?: string[];
  fileSource?: FileSource;
};

export type AnalyzeWorkflowFilesOptions = {
  projectRoot: string;
  tsconfig: string;
  workflowFiles: string[];
  outputDirectory?: string;
  fileSource?: FileSource;
};
