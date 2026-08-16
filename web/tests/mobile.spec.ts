import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';

// 与 smoke.spec.ts 相同约定：读取本地签发的测试 token（缺失则整体跳过）
const USER_TOKEN_FILE = '/tmp/active_user_token.txt';
const hasToken = fs.existsSync(USER_TOKEN_FILE);
const USER_TOKEN = hasToken ? fs.readFileSync(USER_TOKEN_FILE, 'utf8').trim() : '';

test.skip(!hasToken, `缺少 ${USER_TOKEN_FILE}，跳过移动端冒烟（token 签发方式同 tests/smoke.spec.ts）`);

/** 注入 token 到 localStorage 并访问指定页 */
async function authVisit(page: Page, path: string) {
  await page.addInitScript((t) => {
    localStorage.setItem('token', t);
  }, USER_TOKEN);
  await page.goto(path);
}

const PANEL_ROUTES = [
  '/panel',
  '/panel/models',
  '/panel/keys',
  '/panel/requests',
  '/panel/usage',
  '/panel/redemptions',
  '/panel/notices',
  '/panel/releases',
  '/panel/account',
  '/panel/me',
];

test.describe('移动端 · 布局与导航', () => {
  test('底部五 Tab 可见且「日志」Tab 可达', async ({ page }) => {
    await authVisit(page, '/panel');
    const nav = page.getByRole('navigation', { name: '移动端导航' });
    await expect(nav).toBeVisible();
    // 五 Tab：概览/模型/密钥/日志/我的（无「更多」）
    for (const label of ['概览', '模型', '密钥', '日志', '我的']) {
      await expect(nav.getByText(label, { exact: true })).toBeVisible();
    }
    await nav.getByText('日志', { exact: true }).click();
    await expect(page).toHaveURL(/\/panel\/requests/);
  });

  test('「我的」Tab 进入用户页', async ({ page }) => {
    await authVisit(page, '/panel');
    const nav = page.getByRole('navigation', { name: '移动端导航' });
    await nav.getByText('我的', { exact: true }).click();
    await expect(page).toHaveURL(/\/panel\/me/);
    await expect(page.getByText('退出登录')).toBeVisible();
  });

  test('header 无用户菜单（移动端收进「我的」页）', async ({ page }) => {
    await authVisit(page, '/panel');
    await expect(page.getByRole('navigation', { name: '移动端导航' })).toBeVisible();
    // 邮箱形态的用户菜单触发按钮在移动端应不可见（hidden md:inline-flex）
    await expect(page.locator('header button', { hasText: '@' })).toBeHidden();
  });
});

test.describe('移动端 · 页面无横向溢出', () => {
  for (const route of PANEL_ROUTES) {
    test(route, async ({ page }) => {
      await authVisit(page, route);
      await page.waitForTimeout(800);
      const overflow = await page.evaluate(
        () =>
          Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) -
          window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});

test.describe('移动端 · 请求日志卡片流', () => {
  test('有数据时点卡片打开底部详情抽屉', async ({ page }) => {
    await authVisit(page, '/panel/requests');
    const cards = page.locator('div.rounded-xl.border.bg-card');
    const empty = page.getByText('暂无请求日志');
    await Promise.race([
      cards.first().waitFor({ timeout: 15000 }),
      empty.waitFor({ timeout: 15000 }),
    ]).catch(() => {});
    test.skip((await cards.count()) === 0, '当前账号无请求记录，仅验证到空态');
    await cards.first().click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('移动端 · 认证与 landing', () => {
  test('登录页有「返回首页」链接', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('link', { name: '返回首页' })).toBeVisible();
  });

  test('landing 顶部菜单按钮打开导航 Sheet', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '打开菜单' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});
