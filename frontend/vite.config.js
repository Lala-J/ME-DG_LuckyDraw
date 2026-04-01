import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        // SSE connections are long-lived — disable timeouts to prevent ECONNRESET
        timeout: 0,
        proxyTimeout: 0,
      }
    }
  }
});
