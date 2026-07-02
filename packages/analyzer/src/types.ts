import type { TemporalExplorerConfiguration } from './configuration';

export type TemporalExplorerProject = {
  root: string;
  tsconfig: string;
  outputDirectory: string;
  workflowFiles: string[];
  configuration?: TemporalExplorerConfiguration | undefined;
};

export type LoadTemporalExplorerProjectOptions = {
  root?: string;
  tsconfig?: string;
  outputDirectory?: string;
  workflowFiles?: string[];
};

export type AnalyzeWorkflowFilesOptions = {
  projectRoot: string;
  tsconfig: string;
  workflowFiles: string[];
  outputDirectory?: string;
};
