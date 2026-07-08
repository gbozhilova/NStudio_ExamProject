import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5000, host: '0.0.0.0' },
  preview: { port: 5000, host: '0.0.0.0' },
  build: { outDir: 'dist', emptyOutDir: true }
});
