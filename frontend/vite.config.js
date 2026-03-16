import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/auth': 'http://localhost:8000',
      '/compare': 'http://localhost:8000',
      '/sources': 'http://localhost:8000',
      '/suggestions': 'http://localhost:8000',
      '/history': 'http://localhost:8000',
      '/health': 'http://localhost:8000',
      '/featured-images': 'http://localhost:8000',
      '/admin': 'http://localhost:8000',
    },
  },
})
