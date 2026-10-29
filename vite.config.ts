import { defineConfig } from 'vite';

export default defineConfig({
  // relative asset paths, so the build works at https://<user>.github.io/<repo>/ as well as at a domain root
  base: './',
  server: { port: 5173 },
  // three.js alone is ~600 kB minified; that is expected for this prototype
  build: { chunkSizeWarningLimit: 900 },
});
