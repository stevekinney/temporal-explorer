import { loadExampleArtifacts, loadExplorerArtifacts } from '$lib/server/artifacts';

import type { PageServerLoad } from './$types';

const isWebTarget = process.env['EXPLORER_TARGET'] === 'web' || Boolean(process.env['VERCEL']);

// Vercel serves the client-side directory upload app. The adapter-node build
// used by `temporal-explorer open` keeps loading local artifacts from disk.
export const prerender = isWebTarget;

// Absolute origin for OpenGraph/Twitter tags, baked in at build time (a prerendered
// page cannot read the request origin). Prefer an explicit PUBLIC_SITE_URL; on Vercel
// fall back to the production domain. Empty locally, where crawlers never see the page.
function resolveSiteUrl(): string {
  const explicit = process.env['PUBLIC_SITE_URL'];
  if (explicit) return explicit.replace(/\/+$/, '');

  const vercelProduction = process.env['VERCEL_PROJECT_PRODUCTION_URL'];
  return vercelProduction ? `https://${vercelProduction}` : '';
}

export const load = (async ({ url }) => {
  if (isWebTarget) {
    return {
      artifacts: undefined,
      examples: await loadExampleArtifacts(),
      requestedTrace: undefined,
      siteUrl: resolveSiteUrl(),
    };
  }

  const project = prerender ? undefined : (url.searchParams.get('project') ?? undefined);
  const requestedTrace = prerender ? undefined : (url.searchParams.get('trace') ?? undefined);

  return {
    artifacts: await loadExplorerArtifacts(project),
    examples: [],
    requestedTrace,
    siteUrl: resolveSiteUrl(),
  };
}) satisfies PageServerLoad;
