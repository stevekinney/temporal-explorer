/**
 * Benchmarks static analysis of the large fixture against its documented
 * budget (docs/performance-budgets.md). Fails when the budget is exceeded.
 */
import { analyzeProject, loadTemporalExplorerProject } from '@temporal-explorer/api';

const budgetMs = 15_000;
const root = new URL('../../fixtures/large', import.meta.url).pathname;

const startedAt = performance.now();
const project = await loadTemporalExplorerProject({ root });
const analysis = await analyzeProject(project);
const durationMs = Math.round(performance.now() - startedAt);

const workflow = analysis.value.workflows[0];
const commandCount = workflow?.temporalCommands.length ?? 0;

if (!workflow || commandCount < 60) {
  throw new Error(`Expected the large workflow with at least 60 commands, saw ${commandCount}.`);
}

console.log(
  `Analyzed fixtures/large (${commandCount} commands) in ${durationMs}ms (budget ${budgetMs}ms).`,
);

if (durationMs > budgetMs) {
  throw new Error(`Analyzer benchmark exceeded its ${budgetMs}ms budget: ${durationMs}ms.`);
}
