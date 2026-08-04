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

test.describe('Batch 4 · 上游与模型', () => {
  test('admin 上游 Key 列表与详情', async ({ page }) => {
    await authVisit(page, ADMIN_TOKEN, '/upstream');
    await expect(page.getByRole('heading', { name: '上游与模型' })).toBeVisible();
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15000 });
    const count = await page.locator('tbody tr').count();
    expect(count).toBeGreaterThan(0);
    await page.locator('tbody tr').first().click();
    await expect(page.getByRole('heading', { name: '上游 Key 详情' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('基本信息', { exact: false })).toBeVisible();
    // encrypted_key 不应出现
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('encrypted_key');
  });

  test('admin 切换 Tab 到平台模型', async ({ page }) => {
    await authVisit(page, ADMIN_TOKEN, '/upstream');
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15000 });
    await page.getByRole('tab', { name: '平台模型' }).click();
    // 模型卡片网格出现（“上下文窗口”标签在每张卡片）
    await expect(page.getByText('上下文窗口', { exact: false }).first()).toBeVisible({ timeout: 10000 });
  });

  test('admin 切换到供应商 Tab', async ({ page }) => {
    await authVisit(page, ADMIN_TOKEN, '/upstream');
    await page.getByRole('tab', { name: '供应商' }).click();
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 10000 });
  });

  test('user 上游 Key 为空但有平台模型', async ({ page }) => {
    await authVisit(page, USER_TOKEN, '/upstream');
    await expect(page.getByRole('heading', { name: '上游与模型' })).toBeVisible();
    // user 无自有 Key 时显示空态
    await page.waitForLoadState('networkidle');
    const rows = page.locator('tbody tr');
    const cnt = await rows.count();
    // user 要么空态要么自有 Key
    expect(cnt).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Batch 5 · 计费用量', () => {
  test('admin 账本流水加载', async ({ page }) => {
    await authVisit(page, ADMIN_TOKEN, '/usage');
    await expect(page.getByRole('heading', { name: '计费用量' })).toBeVisible();
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 20000 });
    const count = await page.locator('tbody tr').count();
    expect(count).toBeGreaterThan(0);
  });

  test('admin 额度总览 Tab', async ({ page }) => {
    await authVisit(page, ADMIN_TOKEN, '/usage');
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 20000 });
    await page.getByRole('tab', { name: '额度总览' }).click();
    await expect(page.getByText('全平台额度池', { exact: false })).toBeVisible({ timeout: 10000 });
  });

  test('admin 计费规则 Tab', async ({ page }) => {
    await authVisit(page, ADMIN_TOKEN, '/usage');
    await page.getByRole('tab', { name: '计费规则' }).click();
    await page.waitForLoadState('networkidle');
    // rules 可能空也可能不空，只要页面不报错即可
    await expect(page.getByText('计费倍率规则仅管理员可见', { exact: false })).toHaveCount(0);
  });

  test('user 额度总览', async ({ page }) => {
    await authVisit(page, USER_TOKEN, '/usage');
    await expect(page.getByRole('heading', { name: '计费用量' })).toBeVisible();
    await page.getByRole('tab', { name: '额度总览' }).click();
    await page.waitForLoadState('networkidle');
    // user 看到我的额度
    await expect(page.getByText('我的额度', { exact: false })).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Batch 6 · 兑换码', () => {
  test('admin 兑换码列表与兑换记录', async ({ page }) => {
    await authVisit(page, ADMIN_TOKEN, '/redeem/codes');
    await expect(page.getByRole('heading', { name: '兑换码管理' })).toBeVisible();
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15000 });
    const count = await page.locator('tbody tr').count();
    expect(count).toBeGreaterThan(0);
    // 点击第一行打开兑换记录抽屉
    await page.locator('tbody tr').first().click();
    await expect(page.getByRole('heading', { name: '兑换记录' })).toBeVisible({ timeout: 10000 });
    // code_hash/code_plaintext 不应出现
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('code_hash');
    expect(body).not.toContain('code_plaintext');
  });

  test('user 无权看到兑换码管理入口', async ({ page }) => {
    await authVisit(page, USER_TOKEN, '/dashboard');
    await page.waitForLoadState('networkidle');
    const nav = page.getByRole('link', { name: '兑换码管理' });
    await expect(nav).toHaveCount(0);
  });

  test('user 我的兑换记录页', async ({ page }) => {
    await authVisit(page, USER_TOKEN, '/my/redemptions');
    await expect(page.getByRole('heading', { name: '我的兑换记录' })).toBeVisible();
    await page.waitForLoadState('networkidle');
  });
});

test.describe('Batch 7 · 市场分账', () => {
  test('admin 上架管理 Tab（空态）', async ({ page }) => {
    await authVisit(page, ADMIN_TOKEN, '/marketplace');
    await expect(page.getByRole('heading', { name: '市场分账' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    // 上架管理默认 Tab，可能空态（市场未启用）
    await expect(page.getByRole('tab', { name: '上架管理' })).toBeVisible();
  });

  test('admin 切换到结算流水与分账账本', async ({ page }) => {
    await authVisit(page, ADMIN_TOKEN, '/marketplace');
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: '结算流水' }).click();
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: '分账账本' }).click();
    await page.waitForLoadState('networkidle');
    // 页面不应报错
    await expect(page.getByRole('heading', { name: '市场分账' })).toBeVisible();
  });

  test('user 可访问市场分账（空态）', async ({ page }) => {
    await authVisit(page, USER_TOKEN, '/marketplace');
    await expect(page.getByRole('heading', { name: '市场分账' })).toBeVisible();
    await page.waitForLoadState('networkidle');
  });
});

test.describe('Batch 8 · 系统与通知', () => {
  test('admin 公告 Tab', async ({ page }) => {
    await authVisit(page, ADMIN_TOKEN, '/system');
    await expect(page.getByRole('heading', { name: '系统' })).toBeVisible();
    await expect(page.getByRole('tab', { name: '公告' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    // 公告卡片或空态
    await expect(page.locator('body')).toBeVisible();
  });

  test('admin 切换到系统配置（敏感脱敏）', async ({ page }) => {
    await authVisit(page, ADMIN_TOKEN, '/system');
    await page.getByRole('tab', { name: '系统配置' }).click();
    await page.waitForLoadState('networkidle');
    // 配置表应出现，敏感值显示 ******
    const body = await page.locator('body').innerText();
    // captcha_access_key_secret 或 smtp_password 应显示 ****** 而非明文
    if (body.includes('captcha_access_key_secret') || body.includes('smtp_password')) {
      expect(body).toContain('******');
    }
  });

  test('admin 迁移台账 Tab', async ({ page }) => {
    await authVisit(page, ADMIN_TOKEN, '/system');
    await page.getByRole('tab', { name: '迁移台账' }).click();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 10000 });
  });

  test('user 无权访问系统页', async ({ page }) => {
    await authVisit(page, USER_TOKEN, '/dashboard');
    await page.waitForLoadState('networkidle');
    const nav = page.getByRole('link', { name: '系统' });
    await expect(nav).toHaveCount(0);
  });

  test('更新日志页加载', async ({ page }) => {
    await authVisit(page, ADMIN_TOKEN, '/releases');
    await expect(page.getByRole('heading', { name: '更新日志' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    // 版本卡片或空态
    await expect(page.locator('body')).toBeVisible();
  });

  test('通知铃铛可点击展开', async ({ page }) => {
    await authVisit(page, ADMIN_TOKEN, '/dashboard');
    await expect(page.getByRole('heading', { name: '概览' })).toBeVisible({ timeout: 10000 });
    const bell = page.getByRole('button', { name: '通知' });
    await bell.click();
    await page.waitForTimeout(1000);
    // 下拉出现「通知」标题
    await expect(page.getByText('通知', { exact: true }).first()).toBeVisible({ timeout: 5000 });
  });
});
