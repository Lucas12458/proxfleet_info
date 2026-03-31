import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const base_path = env.VITE_BASE_PATH || '/app2/';

  return {
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
  }
})