<script lang="ts">
  import type { LayoutPoint } from '$lib/graph/layout';
  import { BaseEdge, type EdgeProps } from '@xyflow/svelte';

  /**
   * Draws an edge along ELK's computed orthogonal route rather than letting Svelte
   * Flow re-route between handles. ELK routes edges around region containers, so
   * following its waypoints is what keeps a decision's "skip" edge from bowing
   * outside the container it jumps over. Corners are lightly rounded so the
   * orthogonal path reads as a smooth connector, not a staircase. When no route is
   * available yet (layout still running) it degrades to a straight source→target line.
   */
  type RoutedEdgeData = {
    routePoints?: LayoutPoint[];
    routeLabelX?: number;
    routeLabelY?: number;
  };

  let {
    id,
    data,
    label,
    markerEnd,
    style,
    sourceX,
    sourceY,
    targetX,
    targetY,
  }: EdgeProps & { data?: RoutedEdgeData } = $props();

  const points = $derived<LayoutPoint[]>(
    data?.routePoints && data.routePoints.length >= 2
      ? data.routePoints
      : [
          { x: sourceX, y: sourceY },
          { x: targetX, y: targetY },
        ],
  );

  const path = $derived(buildRoundedPath(points, 8));
  const labelX = $derived(data?.routeLabelX ?? (sourceX + targetX) / 2);
  const labelY = $derived(data?.routeLabelY ?? (sourceY + targetY) / 2);

  /** Moves `radius` from `corner` toward `toward`, clamped to half the segment length. */
  function stepToward(corner: LayoutPoint, toward: LayoutPoint, radius: number): LayoutPoint {
    const dx = toward.x - corner.x;
    const dy = toward.y - corner.y;
    const distance = Math.hypot(dx, dy) || 1;
    const step = Math.min(radius, distance / 2);
    return { x: corner.x + (dx / distance) * step, y: corner.y + (dy / distance) * step };
  }

  /** Builds an SVG path through the waypoints, rounding each interior corner with a quadratic. */
  function buildRoundedPath(waypoints: LayoutPoint[], radius: number): string {
    if (waypoints.length < 2) return '';

    let d = `M ${waypoints[0].x},${waypoints[0].y}`;
    for (let index = 1; index < waypoints.length - 1; index += 1) {
      const previous = waypoints[index - 1];
      const corner = waypoints[index];
      const next = waypoints[index + 1];
      const entry = stepToward(corner, previous, radius);
      const exit = stepToward(corner, next, radius);
      d += ` L ${entry.x},${entry.y} Q ${corner.x},${corner.y} ${exit.x},${exit.y}`;
    }

    const last = waypoints[waypoints.length - 1];
    d += ` L ${last.x},${last.y}`;
    return d;
  }
</script>

<BaseEdge {id} {path} {label} {labelX} {labelY} {markerEnd} {style} />
