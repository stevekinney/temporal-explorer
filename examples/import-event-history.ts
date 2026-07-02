/**
 * Optional Event History usage: import a history file, then join it with
 * static analysis into a source-aware execution overlay.
 */
import {
  analyzeProject,
  createExecutionOverlay,
  createOverlayReport,
  importHistoryFromFile,
} from '@temporal-explorer/api';

const projectRoot = new URL('../fixtures/timer-race', import.meta.url).pathname;
const analysis = await analyzeProject({ root: projectRoot });
const trace = await importHistoryFromFile({
  projectRoot,
  file: `${projectRoot}/histories/timeout.json`,
  importedFrom: 'file',
  traceId: 'timeout',
});
const overlay = createExecutionOverlay({
  analysis: analysis.value,
  trace: trace.value,
  workflowName: 'timerRaceWorkflow',
});

if (overlay.value.coverage.nodes.unmappedRuntimeOperations !== 0) {
  throw new Error('Expected every runtime operation to map to source.');
}

const report = createOverlayReport(overlay.value);

if (!report.includes('notifyExpired (observed)')) {
  throw new Error('Expected the timeout branch to be observed.');
}

console.log('import-event-history: overlay mapped with zero unmapped operations.');
