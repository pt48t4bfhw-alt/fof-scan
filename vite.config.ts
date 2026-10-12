/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/fof-scan/' : '/',
  plugins: [preact()],
  worker: { format: 'es' },
  // Préparées dès le démarrage : sinon Vite les découvre en cours de route et recharge la page
  // (avec, entre-temps, deux copies de Preact qui provoquent des erreurs « __H »).
  optimizeDeps: { include: ['preact', 'preact/hooks', 'idb', 'fflate', 'pdf-lib', 'sortablejs', '@techstark/opencv-js'] },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 60000,
    alias: { '@techstark/opencv-js': fileURLToPath(new URL('./tests/aides/opencv-node.ts', import.meta.url)) },
  },
}));
