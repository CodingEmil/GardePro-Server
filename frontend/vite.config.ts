import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    proxy: {
      '/api':       'http://localhost:5000',
      '/media':     'http://localhost:5000',
      '/thumbnail': 'http://localhost:5000',
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
