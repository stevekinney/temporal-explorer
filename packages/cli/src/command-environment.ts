/** Output and interactivity surface injected into every CLI command. */
export type CommandEnvironment = {
  stdout: (text: string) => void | Promise<void>;
  stderr: (text: string) => void | Promise<void>;
  isInteractive: boolean;
};
