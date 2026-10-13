/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ command, isPreview }) => ({
  // Chemin de GitHub Pages, aussi pour `vite preview` (qui sert la version construite).
  base: command === 'build' || isPreview ? '/fof-scan/' : '/',
  plugins: [
    preact(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'FOF Scan',
        short_name: 'FOF Scan',
        description: 'Scanner de documents personnel',
        lang: 'fr',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        background_color: '#0f1a14',
        theme_color: '#0f5132',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // onnx : le modèle DocAligner ; wasm : le moteur onnxruntime
        globPatterns: ['**/*.{js,mjs,css,html,png,wasm,onnx}'],
        // OpenCV (~10 Mo) et le moteur onnxruntime (~14 Mo) : sans cette limite, ils ne seraient pas gardés hors ligne.
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
      },
    }),
  ],
  worker: { format: 'es' },
  // Préparées dès le démarrage : sinon Vite les découvre en cours de route et recharge la page
  // (avec, entre-temps, deux copies de Preact qui provoquent des erreurs « __H »).
  optimizeDeps: {
    include: ['preact', 'preact/hooks', 'idb', 'fflate', 'pdf-lib', 'sortablejs', '@techstark/opencv-js'],
    // onnxruntime-web charge lui-même son moteur .wasm : Vite ne doit pas le réempaqueter
    exclude: ['onnxruntime-web'],
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 60000,
    alias: { '@techstark/opencv-js': fileURLToPath(new URL('./tests/aides/opencv-node.ts', import.meta.url)) },
  },
}));
