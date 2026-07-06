import { loadExplorerArtifacts } from '$lib/server/artifacts';

import type { PageServerLoad } from './$types';

// On Vercel we build the public fixtures showcase as a fully prerendered static page.
// Prerendering forbids reading query parameters (a prerendered page cannot vary by URL)
// and the aggregate project is fixed at build time via TEMPORAL_EXPLORER_PROJECT, so the
// load ignores ?project/?trace in that mode. Locally the adapter-node server keeps the
// dynamic behavior so `temporal-explorer open` can serve any project on request.
export const prerender = Boolean(process.env['VERCEL']);

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
  const project = prerender ? undefined : (url.searchParams.get('project') ?? undefined);
  const requestedTrace = prerender ? undefined : (url.searchParams.get('trace') ?? undefined);

  return {
    ...(await loadExplorerArtifacts(project)),
    requestedTrace,
    siteUrl: resolveSiteUrl(),
  };
}) satisfies PageServerLoad;
