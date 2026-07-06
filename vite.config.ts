import { defineConfig } from 'vite';
import pkg from './package.json';

export default defineConfig({
  // Relative base so the build works at https://<user>.github.io/cutpurse/
  base: './',
  define: {
    // Surfaced in the footer and used to tell the player which build they're on.
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    target: 'es2022',
  },
});
