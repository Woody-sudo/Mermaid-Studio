import {defineConfig} from 'vite';
import {resolve} from 'node:path';

export default defineConfig({
  root: 'src',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/index.html'),
        settings: resolve(__dirname, 'src/settings.html'),
        examples: resolve(__dirname, 'src/examples.html'),
      },
    },
  },
  // Prevent Vite dev server port conflicts
  server: {
    port: 1420,
    strictPort: true,
  },
  // Env variables prefixed with TAURI_ will be exposed
  envPrefix: ['VITE_', 'TAURI_'],
});
