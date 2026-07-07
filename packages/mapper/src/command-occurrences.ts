import type { TemporalCommand } from '@temporal-explorer/schemas';

function commandRepeats(command: TemporalCommand, loopCommandIds: Set<string>): boolean {
  return command.cardinality === 'fan-out' || loopCommandIds.has(command.id);
}

export function commandForRuntimeOccurrence(
  commands: TemporalCommand[],
  occurrence: number,
  totalOccurrences: number,
  loopCommandIds: Set<string>,
): TemporalCommand | undefined {
  let start = 0;

  for (let index = 0; index < commands.length; index += 1) {
    const command = commands[index];

    if (!command) {
      continue;
    }

    const remainingCommands = commands.length - index - 1;
    const remainingOccurrences = totalOccurrences - start;
    const width = commandRepeats(command, loopCommandIds)
      ? Math.max(1, remainingOccurrences - remainingCommands)
      : 1;

    if (occurrence < start + width) {
      return command;
    }

    start += width;
  }

  return undefined;
}

export function countOperationsByName<T>(
  operations: T[],
  getName: (operation: T) => string | undefined,
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const operation of operations) {
    const name = getName(operation);

    if (name) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }

  return counts;
}
