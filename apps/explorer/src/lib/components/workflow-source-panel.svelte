<script lang="ts">
  import { Card } from '@lostgradient/cinder/card';
  import { CodeBlock } from '@lostgradient/cinder/code-block';

  import type { SelectionDetail } from './workflow-selection';

  type Props = {
    detail: SelectionDetail | undefined;
  };

  let { detail }: Props = $props();

  const lineRange = $derived(
    detail?.sourceExcerptLines.length
      ? `Lines ${detail.sourceExcerptLines[0]?.line}-${detail.sourceExcerptLines.at(-1)?.line}`
      : '',
  );
  const sourceCode = $derived(detail?.sourceExcerptLines.map((line) => line.text).join('\n') ?? '');
  const selectedLineIndex = $derived(
    Math.max(0, detail?.sourceExcerptLines.findIndex((line) => line.selected) ?? 0),
  );
</script>

<section class="source-panel" aria-labelledby="source-panel-title">
  <Card padding="none">
    <div class="source-heading">
      <h2 id="source-panel-title">{detail?.title ?? 'No command selected'}</h2>
      {#if detail}
        <div class="source-meta">
          <code>{detail.sourceText}</code>
          <span>{lineRange}</span>
        </div>
      {/if}
    </div>

    {#if detail}
      <div
        class="code-excerpt"
        aria-label="Selected Workflow source excerpt"
        style:--selected-source-line={selectedLineIndex}
      >
        <div class="selected-line-highlight" aria-hidden="true"></div>
        <CodeBlock
          code={sourceCode}
          language="ts"
          showLanguageLabel={false}
          class="source-code-block"
        />
      </div>

      <div class="source-context">
        <h3>Context</h3>
        <dl>
          <div>
            <dt>Function</dt>
            <dd>{detail.node?.label ?? detail.title}</dd>
          </div>
          <div>
            <dt>Command</dt>
            <dd>{detail.sourceLineText}</dd>
          </div>
          <div>
            <dt>File</dt>
            <dd>{detail.sourceText}</dd>
          </div>
        </dl>
      </div>
    {:else}
      <div class="source-empty">
        Select a graph node or timeline row to inspect source evidence.
      </div>
    {/if}
  </Card>
</section>

<style>
  .source-panel {
    min-width: 0;
    height: 100%;
  }

  .source-heading {
    min-width: 0;
    padding: 0.65rem 0.8rem;
    border-bottom: 1px solid #c3d0d5;
  }

  .source-heading h2 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 700;
    letter-spacing: 0;
  }

  .source-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.45rem;
    margin-top: 0.35rem;
  }

  .source-meta code {
    color: #3468f6;
    font-size: 0.73rem;
    overflow-wrap: anywhere;
  }

  .source-meta span {
    color: #62727a;
    font-size: 0.72rem;
  }

  .source-empty {
    padding: 0.8rem;
  }

  :global(.source-panel > .cinder-card) {
    height: 100%;
    min-height: clamp(31rem, calc(100vh - 17rem), 43rem);
    display: flex;
    flex-direction: column;
    background: #ffffff;
  }

  .code-excerpt {
    --source-code-line-height: 1.42rem;
    --source-code-padding-block: 1rem;
    position: relative;
    flex: 0 0 auto;
    overflow: auto;
    border-bottom: 1px solid #d5e0e4;
    background: #ffffff;
    max-height: min(22rem, 46vh);
  }

  .selected-line-highlight {
    position: absolute;
    top: calc(
      var(--source-code-padding-block) +
        (var(--selected-source-line) * var(--source-code-line-height))
    );
    left: 0;
    z-index: 0;
    width: 100%;
    height: var(--source-code-line-height);
    border-left: 3px solid #3468f6;
    background: linear-gradient(90deg, rgba(52, 104, 246, 0.13), rgba(52, 104, 246, 0.06));
    pointer-events: none;
  }

  :global(.source-code-block.cinder-code-block) {
    position: relative;
    z-index: 1;
    height: 100%;
    border: 0;
    border-radius: 0;
    background: #ffffff;
  }

  :global(.source-code-block .cinder-code-block__viewport) {
    height: 100%;
    background: #ffffff;
  }

  :global(.source-code-block .cinder-code-block__pre),
  :global(.source-code-block .cinder-code-block__highlighted pre.shiki) {
    position: relative;
    font-size: 0.72rem;
    line-height: var(--source-code-line-height);
    background: transparent !important;
  }

  :global(.source-code-block .cinder-code-block__code),
  :global(.source-code-block .cinder-code-block__highlighted code),
  :global(.source-code-block .cinder-code-block__highlighted span) {
    font-size: inherit;
    line-height: inherit;
  }

  .source-context {
    display: grid;
    gap: 0.55rem;
    padding: 0.75rem 0.8rem 0.85rem;
    border-top: 0;
  }

  .source-context h3 {
    margin: 0;
    color: #14242b;
    font-size: 0.78rem;
    font-weight: 650;
  }

  .source-context dl {
    display: grid;
    gap: 0.45rem;
    margin: 0;
  }

  .source-context div {
    display: grid;
    gap: 0.15rem;
  }

  .source-context dt {
    color: #62727a;
    font-size: 0.7rem;
  }

  .source-context dd {
    margin: 0;
    color: #14242b;
    font-family: 'SFMono-Regular', 'Cascadia Code', Consolas, monospace;
    font-size: 0.72rem;
    overflow-wrap: anywhere;
  }

  .source-empty {
    color: #62727a;
    font-size: 0.84rem;
  }

  @media (max-width: 840px) {
    :global(.source-panel > .cinder-card) {
      min-height: 0;
    }
  }
</style>
