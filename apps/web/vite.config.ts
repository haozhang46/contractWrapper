import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const controlPort = process.env.CONTROL_PORT ?? '3100'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 8080,
    proxy: { '/api': `http://localhost:${controlPort}` },
  },
})
