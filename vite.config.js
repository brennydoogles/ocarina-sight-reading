import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';

// `npm run dev:lan` sets this. Microphone access needs a secure context, and
// http://<lan-ip>:5173 is not one -- only localhost gets a free pass. The
// self-signed cert makes testing on the phone possible (accept the warning once).
const useLanHttps = process.env.OCARINA_LAN === '1';

export default defineConfig({
  plugins: [
    vue(),
    ...(useLanHttps ? [basicSsl()] : []),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Ocarina Sight Reading',
        short_name: 'Ocarina',
        description: 'Sight-reading trainer for the 12-hole Alto C ocarina',
        theme_color: '#1b1d23',
        background_color: '#1b1d23',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Bravura is bundled into the JS as base64, so caching the JS caches the
        // fonts too -- there is nothing to fetch from a CDN at runtime.
        // mp3 covers public/soundfonts/ocarina-mp3/ -- the one instrument, and
        // only the notes this instrument's A4-F6 range needs, from abcjs's
        // default soundfont, bundled locally (~525KB) instead of left as a
        // CDN fetch, so playback works offline like everything else.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,mp3}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { host: useLanHttps ? true : 'localhost', port: 5173 },
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
  },
});
