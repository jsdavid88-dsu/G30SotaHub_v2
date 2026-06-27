import { defineConfig } from 'vite'
import { resolve } from 'path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  root: resolve(__dirname),
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // #17: 큰 vendor 를 별도 chunk 로 분리 — 메인 번들 축소 + 캐싱 효율.
        // reactflow 는 graph/item 페이지(lazy)에서만 import → 이 chunk 도 async 로 남음.
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'react-query': ['@tanstack/react-query'],
          reactflow: ['reactflow'],
          icons: ['lucide-react'],
        },
      },
    },
  },
  server: {
    host: true,                // Tailscale funnel / 외부 노출 위해 0.0.0.0
    port: 3030,                // 머신 포트 충돌 회피 (8000/3000 → 8011/3030)
    allowedHosts: ['.trycloudflare.com', '.ts.net', '.ngrok-free.app'],
    fs: {
      // 🔴 보안(#26): 상위 디렉토리/절대경로(@fs) 서빙 금지 — .env(시크릿) 외부 유출 차단.
      // 이전 `allow:['..'] + strict:false` 가 /.env, /../backend/.env, /@fs/<abs> 를 그대로
      // 외부에 노출했음. allow 를 frontend 루트로 좁히고 strict on + .env/키 파일 deny.
      // (근본 대책: dev 서버를 인터넷에 직노출하지 말 것 — 외부는 빌드 dist 정적 서빙/백엔드 프록시.)
      strict: true,
      allow: [resolve(__dirname)],
      deny: ['**/.env', '**/.env.*', '**/*.pem', '**/*.key', '**/*.crt', '**/id_rsa*', '**/secrets/**'],
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8011',
        changeOrigin: true,
      },
    },
    watch: {
      ignored: ['**/.playwright-mcp/**', '**/node_modules/**'],
      // 네트워크 드라이브(Z: 등)에서 fs.watch 가 UNKNOWN errno -4094 로 죽음 → 폴링으로 우회.
      // 로컬 디스크(5090)에서는 env 미설정 시 기존 동작 그대로.
      usePolling: !!process.env.VITE_USE_POLLING,
    },
  },
})
