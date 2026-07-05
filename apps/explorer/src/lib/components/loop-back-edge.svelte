<script lang="ts">
  import { BaseEdge, type EdgeProps } from '@xyflow/svelte';

  /**
   * A loop's `repeat` (and continue-as-new's `loop`) back-edge connects the body's exit
   * back to the loop header — the same node pair, in reverse. With the default right→left
   * `smoothstep` routing that path runs flat at the row's height and overlaps the forward
   * edge, so a single-node-body loop looks like a straight line, not a cycle. This edge
   * instead bows the return path below the row as a clear downward arc. The dip scales with
   * the horizontal span so a wide, tall loop (nested containers) is cleared, not cut through.
   */
  let { id, sourceX, sourceY, targetX, targetY, label, markerEnd, style }: EdgeProps = $props();

  const dip = $derived(Math.min(Math.max(Math.abs(sourceX - targetX) * 0.14, 56), 180));
  const bottom = $derived(Math.max(sourceY, targetY) + dip);
  const path = $derived(
    `M ${sourceX},${sourceY} C ${sourceX},${bottom} ${targetX},${bottom} ${targetX},${targetY}`,
  );
  const labelX = $derived((sourceX + targetX) / 2);
  const labelY = $derived(bottom - dip * 0.25);
</script>

<BaseEdge {id} {path} {label} {labelX} {labelY} {markerEnd} {style} />
