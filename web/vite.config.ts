import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, '');
  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, 'src'),
      },
    },
    server: {
      port: 5173,
      host: true,
      proxy: {
        '/api': {
          target: env.VITE_API_TARGET || 'http://localhost:8000',
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: path.resolve(import.meta.dirname, '../public/static'),
      // 不清空目录，避免误删 public/static/.gitignore
      // （该目录整体被 git 忽略，构建产物由部署流程负责清理）
      emptyOutDir: false,
      assetsDir: 'assets',
      sourcemap: false,
    },
  };
});
