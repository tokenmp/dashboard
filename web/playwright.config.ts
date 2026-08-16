import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    headless: true,
    screenshot: 'only-on-failure',
  },
  projects: [
    // 桌面视口：跑除 mobile.spec.ts 外的全部用例
    { name: 'chromium', use: { browserName: 'chromium' }, testIgnore: /mobile\.spec\.ts$/ },
    // 移动视口（375×667，触屏）：只跑 mobile.spec.ts
    {
      name: 'mobile',
      use: {
        browserName: 'chromium',
        viewport: { width: 375, height: 667 },
        isMobile: true,
        hasTouch: true,
      },
      testMatch: /mobile\.spec\.ts$/,
    },
  ],
});
