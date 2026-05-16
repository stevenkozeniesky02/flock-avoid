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
    },
  },
  build: { target: 'es2022', sourcemap: true },
});
