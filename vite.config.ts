import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// GitHub Pages serves the committed `docs/` directory of the default branch,
// so the build lands there, and every URL is relative: the same output works
// at https://vandyckmed-droid.github.io/Duo/ and under any local preview.
// The dataset (`docs/data/`) is copied in from `public/data/`, where the
// pipeline publishes it, as part of the same build.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'docs', emptyOutDir: true },
  test: {
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'pipeline/**/*.test.ts'],
    environment: 'node',
  },
})
