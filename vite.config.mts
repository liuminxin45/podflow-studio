import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VITE_SERVER_WATCH_OPTIONS } from './scripts/viteRuntimeConfig'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    watch: VITE_SERVER_WATCH_OPTIONS,
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          antd: ['antd'],
        },
      },
    },
  },
  base: './',
})
