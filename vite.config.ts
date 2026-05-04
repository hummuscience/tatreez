/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the site under /<repo>/, so asset URLs need that
// prefix. In dev or when running outside Pages, leave base as '/' so
// `npm run dev` works unchanged.
//
// To deploy under a different repo name, set BASE_PATH in CI or change
// the literal below. We default to '/tatreez/' to match the repo name.
const base =
  process.env.BASE_PATH ??
  (process.env.GITHUB_ACTIONS ? '/tatreez/' : '/');

export default defineConfig({
  base,
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
  },
});
