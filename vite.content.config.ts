import { defineConfig } from 'vite'
import { resolve } from 'node:path'

/** Content script: single self-contained IIFE, no code splitting, no imports. */
export default defineConfig({
  publicDir: false,
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: false,
    target: 'chrome110',
    minify: false,
    lib: {
      entry: resolve(__dirname, 'src/content/index.ts'),
      name: 'BreakTheChain',
      formats: ['iife'],
      fileName: () => 'content.js',
    },
  },
})
