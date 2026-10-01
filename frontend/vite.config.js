import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,          // listen on 0.0.0.0 — needed for VS Code port forwarding / LAN access
    allowedHosts: true,  // accept the tunnel's external hostname (Vite 5 blocks unknown Host headers by default)
    proxy: {
      '/auth': 'http://localhost:8000',
      '/compare': 'http://localhost:8000',
      '/sources': 'http://localhost:8000',
      '/suggestions': 'http://localhost:8000',
      '/trending': 'http://localhost:8000',
      '/highlights': 'http://localhost:8000',
      '/history': 'http://localhost:8000',
      '/health': 'http://localhost:8000',
      '/featured-images': 'http://localhost:8000',
      // '/cart' is both a backend API path (GET/POST/DELETE /cart) and a client-side
      // SPA route (/cart page, added in Phase 0.3) — a plain string target would proxy
      // full-page navigations to the backend too, returning raw JSON ({"detail":"Not
      // authenticated"}) instead of index.html. Only bypass (proxy) real API calls;
      // page loads/hard-refreshes fall through to Vite's own SPA fallback.
      '/cart': {
        target: 'http://localhost:8000',
        bypass(req) {
          if (req.headers.accept && req.headers.accept.includes('text/html')) {
            return req.url
          }
        },
      },
      '/fx': 'http://localhost:8000',
      '/config': 'http://localhost:8000',
      '/reports': 'http://localhost:8000',
      '/admin/': 'http://localhost:8000',
      '/seller/': 'http://localhost:8000',
      '/billing/': 'http://localhost:8000',
      // Same SPA-route/API-path collision as '/cart' above — '/favorites' is both.
      '/favorites': {
        target: 'http://localhost:8000',
        bypass(req) {
          if (req.headers.accept && req.headers.accept.includes('text/html')) {
            return req.url
          }
        },
      },
    },
  },
})
