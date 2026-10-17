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

// Dev-only: POST a data URL to /__save-preview?name=x to write public/previews/x.jpg
// (used once to capture the style preview images on the landing page).
const savePreview = {
  name: 'save-preview',
  configureServer(server) {
    server.middlewares.use('/__save-preview', async (req, res) => {
      const name = new URL(req.url, 'http://x').searchParams.get('name').replace(/[^a-z0-9-]/g, '');
      let body = '';
      for await (const chunk of req) body += chunk;
      const { mkdirSync, writeFileSync } = await import('node:fs');
      mkdirSync('public/previews', { recursive: true });
      writeFileSync(`public/previews/${name}.jpg`, Buffer.from(body.split(',')[1], 'base64'));
      res.end('saved');
    });
  },
};

export default defineConfig({
  plugins: [devApi, savePreview],
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
