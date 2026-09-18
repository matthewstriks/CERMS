import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [
      react(),
      {
        name: 'cerms-development-csp',
        apply: 'serve',
        transformIndexHtml(html) {
          // React Fast Refresh injects an inline bootstrap only in development.
          return html
            .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
            .replace("style-src 'self';", "style-src 'self' 'unsafe-inline';")
            .replace("connect-src 'self'", "connect-src 'self' ws://127.0.0.1:5173")
        },
      },
    ],
    build: {
      minify: true,
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          about: resolve('src/renderer/about.html'),
        },
      },
    },
    server: { host: '127.0.0.1', port: 5173, strictPort: true },
  },
})
