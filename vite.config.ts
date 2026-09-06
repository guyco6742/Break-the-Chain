import { defineConfig } from 'vite'
import { resolve } from 'node:path'

/**
 * Main build: extension pages (popup / report / options / offscreen) and the
 * service worker. The content script is built separately as an IIFE bundle by
 * vite.content.config.ts, because content scripts injected via
 * chrome.scripting.executeScript cannot be ES modules.
 */
export default defineConfig({
  root: resolve(__dirname, 'src'),
  publicDir: resolve(__dirname, 'public'),
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    target: 'chrome110',
    minify: false,
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background/index.ts'),
        popup: resolve(__dirname, 'src/popup/popup.html'),
        report: resolve(__dirname, 'src/report/report.html'),
        options: resolve(__dirname, 'src/options/options.html'),
        offscreen: resolve(__dirname, 'src/offscreen/offscreen.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
})
