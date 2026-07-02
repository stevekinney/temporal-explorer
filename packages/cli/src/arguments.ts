export type ParsedFlags = {
  project?: string;
  file?: string;
  format?: string;
  history?: string;
  port?: string;
  trace?: string;
  connection?: string;
  'workflow-id'?: string;
  'workflow-type'?: string;
  'run-id'?: string;
  status?: string;
  query?: string;
  limit?: string;
  json: boolean;
};

type StringFlagName = Exclude<keyof ParsedFlags, 'json'>;

const stringFlagDefinitions = new Map<
  string,
  {
    key: StringFlagName;
    valueName: string;
  }
>([
  ['--project', { key: 'project', valueName: 'path' }],
  ['--file', { key: 'file', valueName: 'path' }],
  ['--format', { key: 'format', valueName: 'format' }],
  ['--history', { key: 'history', valueName: 'trace id' }],
  ['--port', { key: 'port', valueName: 'port' }],
  ['--trace', { key: 'trace', valueName: 'trace id' }],
  ['--connection', { key: 'connection', valueName: 'profile name' }],
  ['--workflow-id', { key: 'workflow-id', valueName: 'workflow id' }],
  ['--workflow-type', { key: 'workflow-type', valueName: 'workflow type' }],
  ['--run-id', { key: 'run-id', valueName: 'run id' }],
  ['--status', { key: 'status', valueName: 'status' }],
  ['--query', { key: 'query', valueName: 'visibility query' }],
  ['--limit', { key: 'limit', valueName: 'count' }],
]);

function readFlagValue(args: string[], index: number, flag: string, valueName: string): string {
  const value = args[index + 1];

  if (!value) {
    throw new Error(`${flag} requires a ${valueName}.`);
  }

  return value;
}

export function parseFlags(args: string[]): ParsedFlags {
  const flags: ParsedFlags = {
    json: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg) {
      continue;
    }

    if (arg === '--json') {
      flags.json = true;
      continue;
    }

    const definition = stringFlagDefinitions.get(arg);

    if (definition) {
      flags[definition.key] = readFlagValue(args, index, arg, definition.valueName);
      index += 1;
    }
  }

  return flags;
}

export function getPositionalArgs(args: string[]): string[] {
  const positional: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg || arg === '--json') {
      continue;
    }

    if (stringFlagDefinitions.has(arg)) {
      index += 1;
      continue;
    }

    positional.push(arg);
  }

  return positional;
}
