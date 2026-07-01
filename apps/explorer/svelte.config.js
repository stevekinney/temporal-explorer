import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';

const cinderComponentDirectory = fileURLToPath(
  new URL('./node_modules/@lostgradient/cinder/src/components', import.meta.url),
);

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    alias: {
      '$cinder-components': cinderComponentDirectory,
    },
    adapter: adapter(),
  },
};

export default config;
