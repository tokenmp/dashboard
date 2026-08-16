import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs';

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
      // 手机/局域网真机预览需 HTTPS（WebCrypto 要求 secure context，见 src/utils/crypto.ts）。
      // 证书为自签名（scripts 里 openssl 生成，见 .cert/，已 gitignore）；
      // 仅当 VITE_DEV_HTTPS=1 时启用，本地 localhost 开发保持默认 http。
      ...(env.VITE_DEV_HTTPS === '1' &&
        fs.existsSync(path.resolve(import.meta.dirname, '.cert/dev-key.pem')) && {
          https: {
            key: fs.readFileSync(path.resolve(import.meta.dirname, '.cert/dev-key.pem')),
            cert: fs.readFileSync(path.resolve(import.meta.dirname, '.cert/dev-cert.pem')),
          },
        }),
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
