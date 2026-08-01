import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Default to relative asset URLs so ONE build works unchanged at a domain root
 * (Netlify, Cloudflare Pages) and at a sub-path (GitHub Pages /quick-notes/).
 * Verified by serving the same dist/ from both.
 *
 * This holds because the app hash-routes — every navigation is the same
 * document — and because vite-plugin-pwa already emits a relative precache
 * manifest and relative manifest URLs, so nothing else is absolute.
 *
 * BASE_PATH is still honoured if a host ever needs an absolute prefix. On Git
 * Bash for Windows, quote it or MSYS rewrites a leading-slash value into a
 * Windows path: BASE_PATH='/quick-notes/' produces /Program Files/Git/...
 */
const base = process.env.BASE_PATH || './'

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'icons/favicon.svg'],
      // Test the installed-PWA path (including the Record shortcut) with `npm run dev`.
      devOptions: { enabled: true, type: 'module', navigateFallback: 'index.html' },
      workbox: {
        // The ORT binaries (~25 MB) and the transformers chunk are NOT
        // precached: install must stay fast, and they are only needed if the
        // user opts into on-device transcription. They are cached on first use
        // by the browser instead.
        globPatterns: ['**/*.{css,html,svg,png,ico,webmanifest}', 'assets/index-*.js'],
        globIgnores: ['**/ort/**', '**/transformers*.js'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
      manifest: {
        name: 'Quick Notes',
        short_name: 'Quick Notes',
        description: 'Capture. File. Remember.',
        // Relative so the app works from any sub-path.
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#14170F',
        theme_color: '#14170F',
        categories: ['productivity', 'utilities', 'medical'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'icons/icon-maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        // The two-icon architecture: long-press the installed icon and drag
        // "Record" out to get a dedicated record button on the home screen.
        shortcuts: [
          {
            name: 'Record a note',
            short_name: 'Record',
            description: 'Start recording immediately',
            url: './#/record',
            icons: [
              {
                src: 'icons/shortcut-record-192.png',
                sizes: '192x192',
                type: 'image/png',
                purpose: 'any',
              },
              {
                src: 'icons/shortcut-record-96.png',
                sizes: '96x96',
                type: 'image/png',
                purpose: 'any',
              },
            ],
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
  },
  build: {
    target: 'es2022',
  },
})
