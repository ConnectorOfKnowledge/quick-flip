// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  integrations: [react()],
  output: 'server',
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      // Ensure idb-keyval works in the browser
      conditions: ['browser'],
    },
  },
  adapter: cloudflare(),
});