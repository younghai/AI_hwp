import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['@rhwp/core']
  },
  server: {
    host: '127.0.0.1',
    port: 5188,
    proxy: {
      '/api': 'http://127.0.0.1:8788',
      '/generated': 'http://127.0.0.1:8788'
    },
    fs: {
      allow: ['..']
    }
  }
})

