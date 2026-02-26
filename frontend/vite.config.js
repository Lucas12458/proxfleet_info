import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const base_path = process.env.VITE_BASE_PATH || '/app2/';

export default defineConfig({
  plugins: [react()],
  base: base_path,
  server: {
    proxy: {
      [`${base_path}api`]: {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(new RegExp(`^${base_path}api`), '')
      },
    },
  },
})