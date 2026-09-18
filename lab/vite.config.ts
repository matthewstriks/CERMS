import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { assertMemberLabTarget, MEMBER_LAB_PROJECT } from '../src/data/emulator-member-creator'
const port = Number(process.env.CERMS_MEMBER_EMULATOR_PORT)
assertMemberLabTarget(MEMBER_LAB_PROJECT, '127.0.0.1', port)
export default defineConfig({
  // Never load .env.local or expose the production client configuration in this lab.
  envDir: false,
  envPrefix: 'CERMS_LAB_UNUSED_',
  plugins: [
    react(),
    {
      name: 'member-lab-config',
      configureServer(server) {
        server.middlewares.use('/__member_lab_config', (_request, response) => {
          response.setHeader('Content-Type', 'application/json')
          response.end(JSON.stringify({ port }))
        })
      },
    },
  ],
  server: { host: '127.0.0.1', port: 5174, strictPort: true, open: false },
})
