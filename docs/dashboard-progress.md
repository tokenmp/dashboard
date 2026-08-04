# Dashboard 实现进度与上下文交接

> 配合 `docs/dashboard-api-plan.md`（总方案）食用。本文记录「已完成到哪、怎么继续、踩过的坑」。
> 给未来新开的 workspace：先读本文件，再看 plan 文档第 N 批。

## 总体方案与路由规范
- 总方案：`docs/dashboard-api-plan.md`（8 批，分角色只读，路由规范见 §2.3/§2.4）。
- 响应统一信封：`{ code, message, data }`（**已从旧 `msg` 全局改为 `message`**）。
- 分页：`data => { list, page, size, total }`，入参 `page/size/keyword/status/userId/from/to/sort`。
- 路由规范：单词 / 斜杠分层 / **禁连字符**；`user/*`=我的、域前缀=全局、`system/*`=系统级；动作用末段动词（本期只读不用）。

## 已完成

### Batch 0 · 基础设施 + 规范统一 ✅
**后端**
- `app/common.php`、`app/ExceptionHandle.php`：`msg` → `message`（全局信封改名）。
- `app/controller/api/Auth.php`：登录放开 `role ∈ {admin, user}`（原先只允许 admin）。
- `app/service/DataScope.php`（新）：角色数据隔离；user 强制 `user_id=self`，admin 可选 `userId` 筛选。
- `app/support/Pagination.php`（新）：`page()/wrap()/applyTimeRange()/applySort()`，排序白名单防注入。

**前端**
- `src/types/index.ts`、`src/utils/error.ts`：`ApiResponse.message`、`getApiError` 同步。
- 依赖：`recharts`、`lucide-react`；shadcn 组件 `table/badge/tabs/select/sheet/skeleton/tooltip/separator/pagination`。
- 通用基建（后续批次复用）：
  - `types/common.ts`：`PageResult<T>` / `PageQuery` / `toParams`
  - `hooks/`：`usePagedQuery`、`useAsync`、`useRole`
  - `components/`：`StatCard`、`StatusBadge`（含 DEFAULT_STATUS_MAP）、`EmptyState`、`TrendChart`
  - `utils/format.ts`：`formatCompact/formatNumber/formatPercent`
- `store/auth.ts`：增加 `user` + `fetchUser`；`components/Layout` 挂载时拉取当前用户供全站角色化渲染。

### Batch 1 · 概览仪表盘 ✅
- 后端 `app/controller/api/Dashboard.php` + 路由 `GET /api/dashboard/overview`（鉴权）。
  - admin：用户总数/活跃/近7天活跃、活跃上游 Key、今日请求/Token/成功率、近 30 天趋势。
  - user：今日请求/Token/成功率、各计费类型额度（balance/reserved/available）、近 30 天趋势。
  - 30 天趋势用 `generate_series` 补齐缺失日；today 用 `count(*) filter (where success is true)`。
- 前端 `pages/Dashboard` 重写：KPI 卡片 + 30 天请求/Token 趋势图（recharts）+ 用户额度明细，按角色渲染。

### Batch 2 · 请求日志监控 ✅
- 后端 `app/controller/api/RequestLog.php` + 路由 `GET /api/requests`、`GET /api/requests/:id`。
  - 列表裁剪字段（去 `request_body`）；筛选 keyword(request_id/trace_id 模糊)/model/protocol/billingPlan/usageStatus/success/userId(admin)/时间/sort。
  - 详情含完整 log + `attempts`（按 attempt_index）+ `events`（按 created_at,id）；attempts 隐藏 `response_body`。
  - `DataScope::scope` 隔离 user_id；count 在 applySort 之前执行，避免 PostgreSQL grouping error。
  - 路由 `:id` 加 `pattern(['id' => '[\w\-]+'])` 以正确匹配 UUID（ThinkPHP 默认路由变量排除 `-`）。
  - 控制器类名与模型同名，需 `use app\model\RequestLog as RequestLogModel` 别名避免「redeclare class」。
- 前端 `pages/Requests`：表格 + 筛选条 + 分页 + 详情抽屉（基本信息 + attempts 表 + events 时间线）；侧边导航 Layout。
- 类型 `src/types/request-log.ts`；API `src/api/request-log.ts`；Playwright smoke 通过。

### Batch 3 · 用户与账户 ✅
- 后端 `app/controller/api/User.php` + 路由 `GET /api/users`、`GET /api/users/:id`（admin）、`GET /api/user`、`GET /api/user/keys`、`GET /api/user/keys/bot`、`GET /api/user/plans`（user）。
  - admin `/api/users` 全局分页+搜索(email/role/status)；`/api/users/:id` 画像含 API Key(脱敏)+Bot Key+套餐(含 Plan)+用量汇总。
  - user `/api/user/*` 仅自身；密钥查询过滤 `status<>'deleted'`，脱敏只返回 key_prefix/key_suffix，不返回 key_hash。
  - 控制器类名与模型同名，需 `use app\model\User as UserModel` 别名。
- 前端 `pages/Users`（admin 表格+详情抽屉）/ `pages/Account`（user 账户中心：资料+API Key+Bot Key+套餐）；侧边导航按角色渲染（admin 多「用户管理」项）。
- 类型 `src/types/user.ts`；API `src/api/user.ts`；Playwright smoke 7 项通过（含 user 越权拦截、角色化导航）。

### Batch 4 · 上游与模型 ✅
- 后端 `app/controller/api/Upstream.php` + 路由 `GET /api/upstream/providers|keys|keys/:id|routes`、`GET /api/models`。
  · 供应商列表带 endpoint/key 计数（手动 JOIN 聚合）。
  · 上游 Key 列表脱敏（`hidden(['encrypted_key','encryption_version'])`）；详情含 mappings（含 model/endpoint）+ routeGroups（手动 JOIN）+ verifications。
  · user 仅看 owner_user_id=self 的私有 Key；模型目录所有登录用户可见。
  · PostgreSQL `text[]`（如 `models.capabilities`）经 PDO 返回为 `{a,b}` 字符串，控制器用 `parsePgArray` 转真数组（`toArray()` 后改，避免直接赋值触发「Array to string conversion」）。
- 前端 `pages/Upstream`（多 Tab：上游 Key / 供应商 / 路由组 / 平台模型）；`KeysTab` 独立文件含详情抽屉 + 用量进度条。
- 类型 `src/types/upstream.ts`；API `src/api/upstream.ts`；Playwright smoke 11 项通过。

## 验证方式（连真实库 tokenmp_prod）
容器 `tokenmp-dashboard` 通过 host 网络 + SSH 隧道连 `127.0.0.1:15432`。
- 直接调控制器：写临时 php 脚本 boot app → `app('user')` 注入真实用户 → `new Dashboard($app)->overview()->getContent()`。（脚本用完即删，不在仓库）
- 真 HTTP 验证：临时脚本用 `app\service\Jwt::issue()` 给真实用户签 token → `curl -H "Authorization: Bearer <token>" http://127.0.0.1:80/api/dashboard/overview`。
- 前端：`pnpm build` 通过；新构建已同步进容器。

## ⚠️ 重要坑 / 约定（务必记住）
1. **coding 套餐按"请求次数"计费**：`usage_ledger.request_delta` / `quota_reservations.reserved_requests`；token/image 用 `token_delta`/`reserved_tokens`。额度计算要按 `billing_plan` 取正确单位（Dashboard.userQuota 已处理，返回 `unit` 字段）。
2. **领域级软删**：所有表用 `status='deleted'` 软删，**非** SoftDelete trait。查询务必 `where status <> 'deleted'`（users 表只有 active/disabled，无 deleted）。
3. **无 relation 的语义外键**：`request_attempts.request_log_id`、`request_log_events.request_log_id`、`marketplace_*.request_log_id/request_attempt_id` 等无 ORM relation 方法，需手动 `where` 或 join。
4. **遗留表 `api_keys` 已废弃**，在用 `user_api_keys`。
5. **脱敏红线**：`upstream_keys.encrypted_key`、`*_key_hash`、`redeem_codes.code_hash/code_plaintext`、`users.password_hash/token_version`、`request_logs.request_body`（列表不取）永不返回。
6. **前端容器不挂载构建目录**：改完前端必须 `./scripts/dev-sync-web.sh`（build + docker cp 进容器），否则浏览器看到的是旧包。详见脚本注释。
7. **时间口径**：KPI 与趋势都以 DB 会话时区为准；5h/日/周/月窗口要和执行面计费口径一致（后续计费批次注意统一封装）。
8. **聚合性能**：request_logs/usage_ledger 是大表，时间区间 + 已有索引（`*_created`、`*_user_created`）支撑；概览如需可加 1~5min 缓存（Batch 1 暂未加）。

## 下一批：Batch 5 · 计费用量
- 路由：`GET /api/usage/ledger`、`/api/usage/quota`、`/api/price/rules`。
- 控制器 `app/controller/api/Usage.php`；ledger user 仅自己；quota admin/user 不同视图；price rules admin 全局。
- 前端：`pages/Usage`（多 Tab：账本流水 / 额度总览 / 计费规则）。
- 之后顺序见 plan 文档批次总表（6 兑换→7 市场→8 系统）。

## 本地环境恢复（新 workspace）
见 zip 内 `RESTORE.md`（含 .env / docker-compose.override.yml / db-backup）。要点：
1. 还原 `.env`、`docker-compose.override.yml` 到仓库根。
2. `PG_PASS=<密码> docker compose up -d --build`（host 网络直连 SSH 隧道 15432）。
3. `composer install`（vendor 被忽略）、`cd web && pnpm install`（node_modules）。
4. `./scripts/dev-sync-web.sh` 构建并同步前端。
