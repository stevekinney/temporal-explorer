import adapterNode from '@sveltejs/adapter-node';
import adapterStatic from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';

const cinderComponentDirectory = fileURLToPath(
  new URL('./node_modules/@lostgradient/cinder/src/components', import.meta.url),
);

// The local `temporal-explorer open` command runs the adapter-node server bundle
// (`build/index.js`), so node stays the default. Vercel builds the fully
// client-side directory-upload app as static files.
const isWebTarget = process.env['EXPLORER_TARGET'] === 'web' || Boolean(process.env['VERCEL']);
const adapter = isWebTarget
  ? adapterStatic({
      pages: 'build',
      assets: 'build',
    })
  : adapterNode();

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
