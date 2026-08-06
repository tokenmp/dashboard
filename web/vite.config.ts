import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, '');
  const isProd = mode === 'production';
  return {
    // 生产构建产物位于 public/static/，资源路径需带 /static/ 前缀；
    // 开发期 Vite 在根路径提供服务，用 /。
    base: isProd ? '/static/' : '/',
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
        // 开发期复用后端 public/ 下的站点图标，避免重复维护
        '/tokenmp.svg': {
          target: env.VITE_API_TARGET || 'http://localhost:8000',
          changeOrigin: true,
        },
        // 模型品牌图标（svg 在 dashboard/public/model-icons，后端静态服务）
        '/model-icons': {
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
