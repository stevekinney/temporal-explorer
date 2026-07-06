import adapterNode from '@sveltejs/adapter-node';
import adapterVercel from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';

const cinderComponentDirectory = fileURLToPath(
  new URL('./node_modules/@lostgradient/cinder/src/components', import.meta.url),
);

// The local `temporal-explorer open` command runs the adapter-node server bundle
// (`build/index.js`), so that stays the default. On Vercel (which sets `VERCEL=1`)
// we build the public fixtures showcase instead, where the page prerenders to static
// output — adapter-vercel serves that from the CDN with no serverless function.
const adapter = process.env['VERCEL'] ? adapterVercel() : adapterNode();

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    alias: {
      '$cinder-components': cinderComponentDirectory,
    },
    adapter,
  },
};

export default config;
