import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// BASE_PATH lets the same build run at a domain root or under /<repo>/ on GitHub Pages.
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'ChMS Ledger',
        short_name: 'Ledger',
        description: 'Budgets, receipts and reimbursements for church ministry teams. Works offline.',
        id: '.',
        theme_color: '#1a73e8',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        globIgnores: ['ocr/**'],
        // The OCR engine and language data (~7 MB) are cached the first time a receipt is read.
        runtimeCaching: [
          {
            urlPattern: /\/ocr\//,
            handler: 'CacheFirst',
            options: { cacheName: 'ocr-assets', expiration: { maxEntries: 10 } },
          },
        ],
      },
    }),
  ],
  test: { environment: 'node' },
});
