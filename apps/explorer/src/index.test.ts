import { describe, expect, it } from 'bun:test';

import { explorerApplicationName } from './index';

describe('explorer shell', () => {
  it('names the local explorer application', () => {
    expect(explorerApplicationName).toBe('Temporal Workflow Explorer');
  });
});
