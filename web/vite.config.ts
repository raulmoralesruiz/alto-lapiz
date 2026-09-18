import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Puerto del juego: 22019 (alternativa: 8080)
const port = Number(process.env.PORT ?? 22019);
const target = `http://localhost:${Number.isFinite(port) && port > 0 ? port : 22019}`;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/ws': { target, ws: true },
      '/api': { target },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
