import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// VITE_BASE is set by the GitHub Pages workflow. "/" for a custom domain or a
// <user>.github.io repo (served from the root); "/<repo-name>/" for the default
// <user>.github.io/<repo-name>/ project-site URL.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'],
      manifest: {
        name: 'Chip n Split',
        short_name: 'Chip n Split',
        description: 'Split expenses and settle card-game nights with friends.',
        theme_color: '#0E4D3A',
        background_color: '#F3F6F4',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        // Chrome's install-eligibility check (the "Install app" menu item on Android)
        // only recognizes raster icons -- an SVG-only manifest silently fails it.
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
