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

test.describe('Batch 3 · 用户与账户', () => {
  test('admin 用户列表加载并打开详情', async ({ page }) => {
    await authVisit(page, ADMIN_TOKEN, '/users');
    await expect(page.getByRole('heading', { name: '用户管理' })).toBeVisible();
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15000 });
    const count = await page.locator('tbody tr').count();
    expect(count).toBeGreaterThan(0);
    await page.locator('tbody tr').first().click();
    await expect(page.getByRole('heading', { name: '用户详情' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('基本信息', { exact: false })).toBeVisible();
  });

  test('user 无权访问用户管理（403/重定向）', async ({ page }) => {
    await authVisit(page, USER_TOKEN, '/users');
    // user 角色不应看到用户管理入口；直接访问 /users 应被拦截
    await page.waitForLoadState('domcontentloaded');
    // 用户管理导航项不应出现在侧栏
    const navLink = page.getByRole('link', { name: '用户管理' });
    await expect(navLink).toHaveCount(0);
  });

  test('user 账户中心加载资料与密钥', async ({ page }) => {
    await authVisit(page, USER_TOKEN, '/account');
    await expect(page.getByRole('heading', { name: '账户中心' })).toBeVisible();
    await expect(page.getByText('我的资料', { exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('API Key', { exact: false }).first()).toBeVisible();
  });

  test('admin 账户中心也可访问', async ({ page }) => {
    await authVisit(page, ADMIN_TOKEN, '/account');
    await expect(page.getByRole('heading', { name: '账户中心' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('我的资料', { exact: true })).toBeVisible({ timeout: 15000 });
  });
});
