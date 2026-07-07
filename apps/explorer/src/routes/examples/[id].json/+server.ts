import { loadExampleArtifact, loadExampleSummaries } from '$lib/server/artifacts';
import { json } from '@sveltejs/kit';

import type { EntryGenerator, RequestHandler } from './$types';

const isWebTarget = process.env['EXPLORER_TARGET'] === 'web' || Boolean(process.env['VERCEL']);

export const prerender = isWebTarget;

export const entries: EntryGenerator = async () => {
  const examples = await loadExampleSummaries();
  return examples.map((example) => ({ id: example.id }));
};

export const GET: RequestHandler = async ({ params }) => {
  const example = await loadExampleArtifact(params.id);
  return json(example.artifacts);
};
