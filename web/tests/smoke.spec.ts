import { test, expect } from '@playwright/test';
import fs from 'node:fs';

// 读取本地签发的测试 token（admin / 有请求记录的 user）
const ADMIN_TOKEN = fs.readFileSync('/tmp/admin_token.txt', 'utf8').trim();
const USER_TOKEN = fs.readFileSync('/tmp/active_user_token.txt', 'utf8').trim();

/** 注入 token 到 localStorage 并访问指定页 */
async function authVisit(page, token: string, path: string) {
  await page.addInitScript((t) => {
    localStorage.setItem('token', t);
  }, token);
  await page.goto(path);
}

test.describe('Batch 2 · 请求日志', () => {
  test('admin 列表加载并打开详情抽屉', async ({ page }) => {
    await authVisit(page, ADMIN_TOKEN, '/requests');
    await expect(page.getByRole('heading', { name: '请求日志' })).toBeVisible();
    // 等待表格行出现
    const rows = page.locator('tbody tr');
    await expect(rows.first()).toBeVisible({ timeout: 15000 });
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
    // 点击第一行打开详情
    await rows.first().click();
    await expect(page.getByRole('heading', { name: '请求详情' })).toBeVisible({ timeout: 10000 });
    // 详情应含基本信息卡片
    await expect(page.getByText('基本信息', { exact: false })).toBeVisible();
  });

  test('admin 筛选模型后重新加载', async ({ page }) => {
    await authVisit(page, ADMIN_TOKEN, '/requests');
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15000 });
    // 在模型名输入框填入值触发筛选
    const modelInput = page.getByPlaceholder('如 gpt-4o');
    await modelInput.fill('glm-5.2');
    await page.waitForTimeout(2000);
    // 表格仍应有数据
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15000 });
  });

  test('user 仅看到自己的请求', async ({ page }) => {
    await authVisit(page, USER_TOKEN, '/requests');
    await expect(page.getByRole('heading', { name: '请求日志' })).toBeVisible();
    const sub = page.getByText('我的请求记录');
    await expect(sub).toBeVisible({ timeout: 15000 });
  });
});
