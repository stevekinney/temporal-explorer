/**
 * Issues a warm-up request against a freshly started Explorer dev server.
 *
 * The first request against a fresh dev server can pay the one-time cost of compiling
 * the Explorer's SvelteKit/Vite module graph, which can take upwards of ten seconds.
 * Later requests reuse the warm transform cache and resolve in well under a second.
 * Issuing one plain `fetch` here — outside of Playwright's navigation timeout budget
 * — absorbs that cost before a test drives the page, so `page.goto` sees a warm server.
 */
export async function warmUpServer(url: string): Promise<void> {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });

  if (!response.ok) {
    throw new Error(`Explorer server warm-up request failed with ${response.status}.`);
  }
}
