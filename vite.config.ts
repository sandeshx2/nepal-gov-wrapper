import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

function governmentUpdatesProxy(): Plugin {
  return {
    name: 'government-updates-proxy',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url || '/', 'http://localhost').pathname;
        if (pathname === '/api/ipo') {
          try {
            const { fetchIpoFeed } = await import('./server/proxy.js');
            const query = request.url?.includes('?') ? request.url.slice(request.url.indexOf('?')) : '';
            const result = await fetchIpoFeed(query);
            response.statusCode = result.status;
            response.setHeader('Content-Type', result.contentType);
            response.setHeader('Cache-Control', 'public, max-age=300');
            response.end(result.body);
          } catch (error) {
            response.statusCode = 502;
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ error: 'Unable to reach the Sharesansar IPO/FPO feed.' }));
          }
          return;
        }
        if (pathname !== '/api/updates' && pathname !== '/api/loksewa') return next();
        try {
          const query = request.url?.includes('?') ? request.url.slice(request.url.indexOf('?')) : '';
          const { fetchOfficialFeed } = await import('./server/proxy.js');
          const result = await fetchOfficialFeed(pathname === '/api/loksewa' ? 'loksewa' : 'updates', query);
          response.statusCode = result.status;
          response.setHeader('Content-Type', result.contentType);
          response.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
          response.end(result.body);
        } catch (error) {
          console.error('Unable to fetch official updates:', error);
          response.statusCode = 502;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ error: 'Unable to reach the Government of Nepal updates feed.' }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), governmentUpdatesProxy()],
  server: { proxy: { '/api/price-watcher': 'http://127.0.0.1:4179' } },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        feedFrame: fileURLToPath(new URL('./feed-frame.html', import.meta.url)),
      },
    },
  },
});
