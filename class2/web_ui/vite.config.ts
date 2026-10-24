import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ---------------------------------------------------------------------------
// 开发服：端口 3098；/tokenhub → TokenHub 中国站（广州），供直连模式绕过浏览器 CORS
// ⚠️ TokenHub 按接入地域提供两个域名，密钥与地域绑定：
//    中国站（广州）  https://tokenhub.tencentmaas.com      ← 当前项目 Key 所属地域
//    国际站（新加坡）https://tokenhub-intl.tencentmaas.com
//    换地域只需改下面一行的 target；用错地域直连会返回 401/401002。
// ---------------------------------------------------------------------------
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3098,
    open: true,
    host: '0.0.0.0',
    proxy: {
      '/tokenhub': {
        target: 'https://tokenhub.tencentmaas.com',
        changeOrigin: true,
        secure: true,
        timeout: 180000,
        proxyTimeout: 180000,
        rewrite: (path) => path.replace(/^\/tokenhub/, ''),
      },
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
})
