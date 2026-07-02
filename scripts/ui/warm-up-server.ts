/**
 * Issues a warm-up request against a freshly started Explorer dev server.
 *
 * Vite skips dependency pre-bundling for the `$cinder-components` alias (it points
 * directly at the component library's source rather than a built package), so the
 * very first request against a fresh dev server pays for an on-demand compile of the
 * whole component graph, which can take upwards of ten seconds. Later requests reuse
 * the warm transform cache and resolve in well under a second. Issuing one plain
 * `fetch` here — outside of Playwright's navigation timeout budget — absorbs that
 * one-time cost before a test drives the page, so `page.goto` sees a warm server.
 */
export async function warmUpServer(url: string): Promise<void> {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });

  if (!response.ok) {
    throw new Error(`Explorer server warm-up request failed with ${response.status}.`);
  }
}
