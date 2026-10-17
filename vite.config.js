import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Serve the Vercel functions in /api during `npm run dev` too.
const devApi = {
  name: 'dev-api',
  configureServer(server) {
    server.middlewares.use('/api/heatmap', async (req, res) => {
      req.url = '/api/heatmap' + req.url; // connect strips the mount path
      const { default: handler } = await server.ssrLoadModule('/api/heatmap.js');
      handler(req, res);
    });
  },
};

export default defineConfig({
  plugins: [devApi],
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        studio: resolve(import.meta.dirname, 'studio.html'),
        embed: resolve(import.meta.dirname, 'embed.html'),
      },
    },
  },
});
