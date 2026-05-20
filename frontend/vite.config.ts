import { defineConfig } from 'vite'
import { resolve } from 'path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  root: resolve(__dirname),
  plugins: [react(), tailwindcss()],
  server: {
    host: true,                // Tailscale funnel / 외부 노출 위해 0.0.0.0
    port: 3030,                // 머신 포트 충돌 회피 (8000/3000 → 8011/3030)
    allowedHosts: ['.trycloudflare.com', '.ts.net', '.ngrok-free.app'],
    fs: {
      allow: ['..'],
      strict: false,
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8011',
        changeOrigin: true,
      },
    },
    watch: {
      ignored: ['**/.playwright-mcp/**', '**/node_modules/**'],
    },
  },
})
