import { loadExplorerArtifacts } from '$lib/server/artifacts';

import type { PageServerLoad } from './$types';

export const load = (async ({ url }) => {
  return {
    ...(await loadExplorerArtifacts(url.searchParams.get('project') ?? undefined)),
    requestedTrace: url.searchParams.get('trace') ?? undefined,
  };
}) satisfies PageServerLoad;
