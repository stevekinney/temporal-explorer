import type { RuntimeOperation, SourceLocation } from '@temporal-explorer/schemas';

export type SourceExcerptLine = {
  line: number;
  text: string;
  selected: boolean;
};

const sourceLineByOperationKind: Partial<
  Record<RuntimeOperation['kind'], (operation: RuntimeOperation) => string>
> = {
  activity: (operation) =>
    operation.kind === 'activity' ? `await activities.${operation.activityType}(...)` : '',
  timer: (operation) =>
    operation.kind === 'timer' ? `await sleep(${operation.durationText ?? 'duration'})` : '',
  'child-workflow': (operation) =>
    operation.kind === 'child-workflow' ? `await executeChild(${operation.workflowType}, ...)` : '',
  'external-signal': (operation) =>
    operation.kind === 'external-signal'
      ? `await signalExternalWorkflow(${operation.signalName}, ...)`
      : '',
  signal: (operation) =>
    operation.kind === 'signal' ? `setHandler(${operation.signalName}, ...)` : '',
  update: (operation) =>
    operation.kind === 'update' ? `setHandler(${operation.updateName}, ...)` : '',
};

const basicOrderWorkflowSource = [
  "import { proxyActivities } from '@temporalio/workflow';",
  '',
  "import type * as orderActivities from '../activities/order-activities';",
  'import type {',
  '  OrderInput,',
  '  OrderResult,',
  '  PaymentResult,',
  '  ShipmentResult,',
  '  ValidatedOrder,',
  "} from '../activities/order-activities';",
  '',
  'const activities = proxyActivities<typeof orderActivities>({',
  "  startToCloseTimeout: '1 minute',",
  '});',
  '',
  'export async function basicOrderWorkflow(input: OrderInput): Promise<OrderResult> {',
  '  const order: ValidatedOrder = await activities.validateOrder(input);',
  '  const payment: PaymentResult = await activities.chargeCard(order);',
  '  const shipment: ShipmentResult = await activities.shipOrder(order);',
  '',
  '  return {',
  '    orderId: order.orderId,',
  '    authorizationId: payment.authorizationId,',
  '    trackingNumber: shipment.trackingNumber,',
  '  };',
  '}',
];

export function sourceLineText(title: string, operation: RuntimeOperation | undefined): string {
  if (!operation) return title;
  return sourceLineByOperationKind[operation.kind]?.(operation) || title;
}

export function sourceExcerpt(
  source: SourceLocation | undefined,
  selectedLineText: string,
): SourceExcerptLine[] {
  const selectedLine = source?.start.line ?? 1;
  const knownSource = source?.path.endsWith('src/workflows/basic-order-workflow.ts')
    ? basicOrderWorkflowSource
    : undefined;

  if (knownSource) {
    return excerptWindow(knownSource, selectedLine);
  }

  const lines =
    selectedLine > 1
      ? [
          { line: selectedLine - 1, text: '// Source text was not included in this artifact.' },
          { line: selectedLine, text: selectedLineText },
        ]
      : [{ line: selectedLine, text: selectedLineText }];

  return lines.map(({ line, text }) => ({
    line,
    text,
    selected: line === selectedLine,
  }));
}

function excerptWindow(sourceLines: string[], selectedLine: number): SourceExcerptLine[] {
  const startLine = Math.max(1, selectedLine - 6);
  const endLine = Math.min(sourceLines.length, selectedLine + 5);

  return sourceLines.slice(startLine - 1, endLine).map((text, index) => {
    const line = startLine + index;
    return {
      line,
      text,
      selected: line === selectedLine,
    };
  });
}
