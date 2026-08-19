import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Served from https://vandyckmed-droid.github.io/Duo/, so every asset and
// every dataset fetch has to resolve against that sub-path.
export default defineConfig({
  plugins: [react()],
  base: '/Duo/',
  build: { outDir: 'dist', emptyOutDir: true },
  test: {
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'pipeline/**/*.test.ts', 'lab/**/*.test.ts'],
    environment: 'node',
  },
})
