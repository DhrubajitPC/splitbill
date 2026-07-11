import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

/** Project Pages URL: https://<user>.github.io/splitbill/ */
const base = process.env.GITHUB_PAGES === '1' ? '/splitbill/' : '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'Splitbill',
        short_name: 'Splitbill',
        description: 'Split restaurant receipts fairly — item by item, on your phone.',
        theme_color: '#F3EDE3',
        background_color: '#F3EDE3',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        globIgnores: [
          '**/ort-wasm*',
          '**/worker-entry*',
          '**/ort.bundle*',
          '**/dist-*.js',
          '**/*paddle*',
        ],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/onnxruntime-web@.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'onnxruntime-wasm',
              expiration: { maxEntries: 24, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/tesseract\.js@.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tesseract-cdn',
              expiration: { maxEntries: 16, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /^https:\/\/paddle-model-ecology\.bj\.bcebos\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'paddleocr-models',
              expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 16, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
  optimizeDeps: {
    include: ['@paddleocr/paddleocr-js', 'clipper-lib', 'onnxruntime-web'],
    needsInterop: ['clipper-lib'],
  },
  worker: {
    format: 'es',
  },
  build: {
    chunkSizeWarningLimit: 15000,
    commonjsOptions: {
      include: [/clipper-lib/, /node_modules/],
      transformMixedEsModules: true,
    },
  },
  test: {
    environment: 'node',
    exclude: ['**/node_modules/**', '**/e2e/**', '**/dist/**'],
  },
})
