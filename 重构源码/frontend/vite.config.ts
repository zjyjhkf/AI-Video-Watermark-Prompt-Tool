import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 开发期把 /api 代理到后端，避免跨域；生产构建后由 FastAPI 直接托管 dist
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5199,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8020', changeOrigin: true },
    },
  },
  build: { outDir: 'dist', sourcemap: false },
});
