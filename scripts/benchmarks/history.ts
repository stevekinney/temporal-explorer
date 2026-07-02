/**
 * Benchmarks Event History parsing of the large fixture against its
 * documented budget (docs/performance-budgets.md).
 */
import { parseEventHistory } from '@temporal-explorer/api';

const budgetMs = 1_000;
const historyUrl = new URL('../../fixtures/large/histories/complete.json', import.meta.url);
const history = await Bun.file(historyUrl).json();

const startedAt = performance.now();
const trace = parseEventHistory({ history, traceId: 'complete', historyHash: 'benchmark' });
const durationMs = Math.round(performance.now() - startedAt);

const activityCount = trace.value.operations.filter(
  (operation) => operation.kind === 'activity',
).length;

if (activityCount < 60) {
  throw new Error(`Expected at least 60 activity operations, saw ${activityCount}.`);
}

console.log(
  `Parsed ${trace.value.source.eventCount} events (${activityCount} activities) in ${durationMs}ms (budget ${budgetMs}ms).`,
);

if (durationMs > budgetMs) {
  throw new Error(`History benchmark exceeded its ${budgetMs}ms budget: ${durationMs}ms.`);
}
