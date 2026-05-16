import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/valhalla': {
        target: 'http://localhost:8002',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/valhalla/, ''),
      },
      // GitHub release-asset CDN doesn't send Access-Control-Allow-Origin,
      // so a direct browser fetch CORS-fails. Proxy server-side instead.
      // In production this would be replaced by a same-origin reverse proxy.
      '/dataset': {
        target: 'https://github.com',
        changeOrigin: true,
        rewrite: (path) =>
          path.replace(/^\/dataset/, '/stevenkozeniesky02/flock-avoid/releases/latest/download'),
        followRedirects: true,
      },
    },
  },
  build: { target: 'es2022', sourcemap: true },
});
