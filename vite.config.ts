import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works at https://<user>.github.io/cutpurse/
  base: './',
  build: {
    target: 'es2022',
  },
});
