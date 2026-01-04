import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        // 开发模式下，固定代理到 http://localhost:8866
        target: 'http://localhost:8866',
        changeOrigin: true,
        secure: false, // 忽略 SSL 证书验证（开发环境）
        ws: false, // 禁用 WebSocket 代理
        rewrite: (path) => path, // 保持路径不变，/api/v1/secrets -> /api/v1/secrets
        configure: (proxy, _options) => {
          proxy.on('error', (err, req, res) => {
            // 开发环境才输出详细错误
            if (process.env.NODE_ENV !== 'production') {
              console.error('Proxy error:', err.message);
              console.error('Request URL:', req.url);
            }
            if (!res.headersSent) {
              res.writeHead(500, {
                'Content-Type': 'text/plain',
              });
              res.end('Proxy error: ' + err.message);
            }
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            // 开发环境才输出请求日志
            if (process.env.NODE_ENV !== 'production') {
              console.log('→ Sending Request:', req.method, req.url);
              console.log('→ Target URL:', proxyReq.path);
            }
            // changeOrigin: true 会自动设置正确的 Host 头，不需要手动设置
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            // 开发环境才输出响应日志
            if (process.env.NODE_ENV !== 'production') {
              console.log('← Received Response:', proxyRes.statusCode, req.url);
              if (proxyRes.statusCode >= 400) {
                console.error('← Error Response:', proxyRes.statusCode, req.url);
              }
            }
          });
        },
      },
    },
  },
})

