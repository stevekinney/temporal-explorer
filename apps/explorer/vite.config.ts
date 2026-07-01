import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: {
    exclude: ['@lostgradient/cinder'],
  },
  plugins: [sveltekit()],
  ssr: {
    noExternal: ['@lostgradient/cinder'],
  },
  server: {
    host: '127.0.0.1',
    port: Number(process.env['PORT'] ?? 5173),
    strictPort: false,
  },
});
