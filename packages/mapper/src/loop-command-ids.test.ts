import { describe, expect, it } from 'bun:test';

import type { FlowNode } from '@temporal-explorer/schemas';

import { collectLoopCommandIds } from './loop-command-ids';

describe('loop command id collection', () => {
  it('recurses through labeled regions inside loop bodies', () => {
    const nodes: FlowNode[] = [
      {
        type: 'loop',
        id: 'loop',
        loopKind: 'while',
        body: [
          {
            type: 'region',
            id: 'region',
            label: 'label',
            body: [{ type: 'command', id: 'command', commandId: 'activity:inside-region' }],
          },
        ],
      },
    ];

    expect(collectLoopCommandIds(nodes)).toContain('activity:inside-region');
  });
});
