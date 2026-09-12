# 后端约定与已知坑

> 改 `app/controller/**` 或写原生 SQL 之前先读本文件。
> 这些约定大多有对应的失败教训，偏离它们会踩到同一个坑。

## 1. 响应信封

所有 `/api/v1/*` 接口统一返回：

```json
{ "code": 0, "message": "ok", "data": { } }
```

- `code = 0` 成功，非 0 为业务码（与 HTTP 状态码解耦）。
- 字段名是 **`message`**，不是 `msg`。
- 实现：`app/common.php` 的 `success()` / `fail()`；异常经 `app/ExceptionHandle.php` 转同构信封。
- 注意：executor 的 `/v1/*` **不使用**这个信封（它是 OpenAI/Anthropic 协议兼容的，直接返回协议体）。

## 2. 分页与查询参数

请求入参：`page` / `size`（默认 20，上限 100）/ `keyword` / `status` / `userId` / `from` / `to` / `sort`。

```json
{ "code": 0, "message": "ok", "data": { "list": [], "page": 1, "size": 20, "total": 128 } }
```

统一走 `app/support/Pagination.php`：`page()` / `wrap()` / `applyTimeRange()` / `applySort()`。
**`applySort()` 必须传列白名单**（防注入）。

> ⚠️ 顺序坑：若查询里有聚合 `count`，要在 `applySort()` **之前**执行，否则 PostgreSQL 报 grouping error。

## 3. 路由命名规范

集中在 `route/app.php`，前缀 `/api/v1`，四个命名空间与 `app/controller/` 目录一一对应：

| 命名空间 | 中间件 | 语义 |
|---|---|---|
| `auth/*` | 无 / `Auth` | 登录、注册、公钥、当前用户 |
| `site/*` | 无 | landing 页游客数据（模型广场、套餐、站点统计） |
| `panel/*` | `Auth` | **用户自取**数据，强制只看自己 |
| `dashboard/*` | `Auth` + `Admin` | 管理端全平台数据 |

- 路径用**小写单词 + 斜杠分层**，禁止连字符：`keys/bot`（不是 `bot-keys`）、`upstream/keys`（不是 `upstream-keys`）。
- 动作用末段动词：`/:id/status`、`plan-strategy`。

> ⚠️ **静态路由前缀吞并**：ThinkPHP 会把静态路径当父级匹配，注册顺序错了会被吞。
> 已有两处踩过：`overview/models` 必须在 `overview` 之前注册；`keys/bot` 必须在 `keys` 之前。
> 新增同类端点时注意顺序 —— 见 `route/app.php` 内的注释。

> ⚠️ 带 UUID 的路由变量要加 `pattern(['id' => '[\w\-]+'])`，ThinkPHP 默认变量规则排除 `-`。

## 4. 角色与数据隔离

`app/service/DataScope.php`：

- `DataScope::forSelf($user)` —— `panel/*` 用，**无视角色，只看自己**，忽略前端传来的 `userId`。
- `DataScope::forUser($user)` —— `dashboard/*` 用，admin 可跨用户（可选 `userId` 筛选）。
- `$ctx->scope($query, 'user_id', $filterUserId)` 统一改写查询条件。

**永远不要信任前端传入的 `userId`。**

## 5. 脱敏红线

以下字段**永不返回**给前端：

| 字段 | 说明 |
|---|---|
| `upstream_keys.encrypted_key`、`encryption_version` | 上游凭据密文 |
| `users.password_hash`、`token_version` | 口令与吊销版本 |
| `user_api_keys.key_hash`、`bot_keys.key_hash` | 只返回 `key_prefix` / `key_suffix` |
| `redeem_codes.code_hash`、`code_plaintext` | 兑换码只返回 `code_prefix` / `code_suffix` |
| `request_logs.request_body` | 列表不取；详情按需裁剪 |
| `system_config` 中的敏感键（`captcha_access_key_secret`、`smtp_password` 等） | 值脱敏为 `******` |

明文 API Key **只在创建那一次响应里返回**。

## 6. 领域级软删

所有表用 `status = 'deleted'` 软删，**不是** ThinkPHP 的 `SoftDelete` trait。
查询必须显式 `where('status', '<>', 'deleted')`。

例外：`users` 表只有 `active` / `disabled`，没有 `deleted`。

## 7. 无 relation 的语义外键

以下关联在模型上**没有** ORM relation 方法，需要手动 `where` 或 `join`：

- `request_attempts.request_log_id`
- `request_log_events.request_log_id`
- `marketplace_*.request_log_id` / `request_attempt_id`

## 8. PostgreSQL 类型解析

PHP PDO 返回 `text[]` / `integer[]` 时会得到 **`{a,b}` 形式的字符串**，不是数组。

- `models.capabilities`（text[]）
- `price_multiplier_rules.days_of_week`（integer[]）

必须在 `toArray()` **之后**转换（直接赋值会触发 "Array to string conversion"）；
写出时用 `days_of_week::text` 投影绕开 ORM 的 `integer[]` 强转。

## 9. 时区与时间口径

- `config/app.php` 的 `default_timezone` 与 `config/database.php` 的 `PG_TIMEZONE`
  都是 `Asia/Shanghai`，**必须保持一致**，否则「今日 / 趋势」类查询的日界会错位。
- KPI 与趋势一律以**数据库会话时区**为准。
- 5h / 周 / 周期窗口的算法要**与 executor 对齐**（`internal/postgres/quota*.go`、`plan_strategy.go`）。

> ⚠️ 面板配额展示与 executor 的放行口径在「周期套餐套住 5h/周窗口」时存在**已知差异**
> （`app/service/QuotaService.php` 内有注释说明）。改配额展示前先确认是否要一并修口径。

## 10. 前端约定（`web/`）

- axios 实例 `src/api/client.ts`，`baseURL` 默认 `/api/v1`，401 自动跳登录。
- API 层按后端模块拆：`src/api/{auth,dashboard,panel,site}.ts`；函数内部剥掉信封，返回 `data`。
- 类型按模块拆在 `src/types/`，分页统一 `PageResult<T>` / `PageQuery`。
- 状态只有 `src/store/auth.ts` 一个 Zustand store；其余用 `useAsync` / `usePagedQuery`。
- 文案是硬编码简体中文，没有 i18n 框架。

> ⚠️ **改完前端必须重新构建**：`web/.env.example` 里的 `VITE_API_BASE_URL=/api` 与代码默认
> `/api/v1` 不一致，照抄会 404 —— 保持留空或写 `/api/v1`。
