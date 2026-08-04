# Dashboard API + 前端展示 分批实现方案

> 目标：基于现有 36 个 Model，分批组装**只读**数据 API，并同步实现对应前端展示页。
> 范围：**分角色**（admin 看全平台 / user 看自己），**本期仅查询与统计聚合，不含写操作**。
> 节奏：先出本方案 → 逐批评审 → 每批「1 个后端 API 模块 + 1 个前端页面」同步落地。

---

## 一、现状盘点

### 后端（ThinkPHP 8 + PostgreSQL）
- 认证闭环已通：`route/app.php` 仅有 `auth` 一组（login / public-key / user）；JWT(HS256) + RSA-OAEP 密码加密；`app('user')` 注入当前用户；`token_version` 支持吊销。
- 统一响应：`app/common.php` 的 `success()/fail()` → 当前是 `{ code, msg, data }`（**见 2.1，需改为 message**）；异常经 `ExceptionHandle.php` 转同构信封。
- **36 个 Model 已就绪，但业务 API 路由一行都还没写。**
- ⚠️ **前置阻塞**：`api/Auth::login()` 当前硬性要求 `role=admin`。要支持 user 面板，需放开登录（允许 `role IN ('admin','user')`）。建议在批次 0 一起处理。

### 前端（React 19 + TS + Vite + shadcn/ui + Zustand + Axios + RR v7）
- 登录闭环已通；`src/api/client.ts`（baseURL `/api`、401 自动跳登录）可复用；`src/api/auth.ts` 是 API 函数模板；`src/types/index.ts` 放全局类型。
- 现有页面：Login / Dashboard（占位）/ NotFound。
- ⚠️ **缺图表库、缺表格/分页组件** → 需在第 1 批引入。

### 数据模型按业务域归类（7 域）
| 域 | 核心表 |
|---|---|
| 用户域 | users / user_api_keys / bot_keys / plans / user_plans / user_auto_model_* / user_risk_resets |
| 上游与路由域 | providers / provider_endpoints / upstream_keys / upstream_model_mappings / upstream_key_verifications / route_groups / upstream_route_group_memberships / routing_policies / models(AiModel) |
| 请求与日志域 | request_logs / request_attempts / request_log_events / key_leases |
| 计费与额度域 | usage_ledger / quota_reservations / price_multiplier_rules |
| 市场域 | marketplace_listings / marketplace_request_settlements / marketplace_ledger |
| 兑换码域 | redeem_codes / redeem_code_redemptions |
| 系统与通知域 | announcements / notifications / version_releases / user_release_reads / system_config / schema_migrations |

---

## 二、通用设计约定（所有批次共同遵守）

### 2.1 响应格式规范

**统一信封**（全局，所有接口）
```json
{ "code": 0, "message": "ok", "data": { ... } }
```
- `code = 0` 成功；非 0 为业务错误码。
- 字段名统一用 **`message`**。

> ⚠️ **对现有代码的一次性改动（在批次 0 完成）**
> 现有 `app/common.php` 的 `success()/fail()` 与 `app/ExceptionHandle.php` 返回的是 `msg`。需改为 `message`：
> - 后端：`app/common.php`（`success`/`fail` 两处 `'msg' =>` → `'message' =>`）、`app/ExceptionHandle.php`（API 异常分支）。
> - 前端：`src/types/index.ts` 的 `ApiResponse.msg` → `message`；`src/utils/error.ts` 的 `getApiError` 读取 `response.data.message`；`src/api/auth.ts` 中 `code === 2` 等业务码判断不受影响。
> 改动小且集中，登录链路回归一次即可。

### 2.2 分页规范

**请求入参**（前端 → 后端，query string）
| 参数 | 说明 |
|---|---|
| `page` | 页码，默认 1 |
| `size` | 每页条数，默认 20，上限 100 |
| `keyword` | 通用模糊搜索（按资源语义匹配 name/email 等） |
| `status` | 状态枚举过滤 |
| `userId` | admin 可选：按指定用户筛选（user 角色忽略，强制绑定自身） |
| `from` / `to` | 时间区间（ISO 8601，落在 `created_at`） |
| `sort` | 排序，如 `-created_at`（`-` 前缀降序） |

**分页响应**（统一结构）
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "list": [ /* ... */ ],
    "page": 1,
    "size": 20,
    "total": 128
  }
}
```
非分页接口则 `data` 直接为对象/数组。

### 2.3 路由命名规范（核心）

**规则**
1. 全小写**单词**，用 `/` 分层级；**禁止连字符（kebab-case）**。
2. 多词概念**拆成层级**或使用合成词（`upstream`、`marketplace`、`settlements`、`overview` 本身是合法单词）。
   - ❌ `bot-keys` → ✅ `keys/bot`
   - ❌ `upstream-keys` → ✅ `upstream/keys`
   - ❌ `system-config` → ✅ `system/config`
3. **名词表资源**：
   - 单数段 `user/*` 表示**当前用户的个人资源**（"我的"）；
   - 复数 `users` 或域前缀表示**全局集合**（admin 管理对象）；
   - `system/*` 表示**系统级资源**（公告/版本/配置/迁移）。
4. **子资源用层级**：`/redeem/codes/:id/redemptions`、`/users/:id/notifications`。
5. **详情**用 `GET /:id`。
6. **动作**用末段动词（RPC 风格），预留未来写操作，本期只读不使用：`/create`、`/:id/toggle`、`/:id/<verb>`。

**示例**（来自约定）
```
GET  /api/user/keys              我的 API Key 列表
GET  /api/user/keys/bot          我的 Bot Key 列表
POST /api/user/keys/create       创建 API Key（未来）
POST /api/user/keys/:id/toggle   切换 API Key 状态（未来）
GET  /api/system/notices         系统公告
```

### 2.4 完整路由清单（本期只读，按域）

| 域 | 方法 | 路由 | 说明 |
|---|---|---|---|
| 概览 | GET | `/api/dashboard/overview` | KPI + 趋势（按角色） |
| 日志 | GET | `/api/requests` | 请求日志列表 |
| 日志 | GET | `/api/requests/:id` | 请求详情（attempts+events） |
| 用户 | GET | `/api/users` | 用户列表（admin） |
| 用户 | GET | `/api/users/:id` | 用户详情（admin） |
| 账户 | GET | `/api/user` | 我的资料 |
| 账户 | GET | `/api/user/keys` | 我的 API Key |
| 账户 | GET | `/api/user/keys/bot` | 我的 Bot Key |
| 账户 | GET | `/api/user/plans` | 我的套餐 |
| 上游 | GET | `/api/upstream/providers` | 供应商 |
| 上游 | GET | `/api/upstream/keys` | 上游 Key 列表 |
| 上游 | GET | `/api/upstream/keys/:id` | 上游 Key 详情 |
| 上游 | GET | `/api/upstream/routes` | 路由组 |
| 上游 | GET | `/api/models` | 平台模型目录 |
| 计费 | GET | `/api/usage/ledger` | 用量流水 |
| 计费 | GET | `/api/usage/quota` | 额度/预扣汇总 |
| 计费 | GET | `/api/price/rules` | 计费倍率规则 |
| 兑换 | GET | `/api/redeem/codes` | 兑换码列表（admin） |
| 兑换 | GET | `/api/redeem/codes/:id/redemptions` | 某码兑换记录（admin） |
| 兑换 | GET | `/api/user/redemptions` | 我的兑换记录 |
| 市场 | GET | `/api/marketplace/listings` | 上架挂单 |
| 市场 | GET | `/api/marketplace/settlements` | 结算单 |
| 市场 | GET | `/api/marketplace/ledger` | 分账账本 |
| 系统 | GET | `/api/system/notices` | 公告（user 仅 published） |
| 系统 | GET | `/api/user/notifications` | 我的通知 |
| 系统 | GET | `/api/users/:id/notifications` | 指定用户通知（admin） |
| 系统 | GET | `/api/system/releases` | 版本列表 |
| 系统 | GET | `/api/system/releases/:id` | 版本详情（含我的已读） |
| 系统 | GET | `/api/system/config` | 系统配置（admin） |
| 系统 | GET | `/api/system/migrations` | 迁移台账（admin） |

### 2.5 角色数据隔离（核心，统一封装）

新增 `app/service/DataScope.php`：
```php
$ctx = DataScope::forUser(app('user'));          // 当前用户上下文
$ctx->isAdmin();                                  // bool
$ctx->scopedQuery($model, 'user_id');            // user: 强制 user_id=self；admin: 应用可选 userId 筛选
```
- 控制器一律走 `DataScope`，**禁止信任前端传入的 userId**（防越权）。
- 所有查询附加 `status <> 'deleted'`（领域级软删，非 SoftDelete trait）。
- `user/*` 路由天然绑定当前用户；`users/*` 与域前缀路由由 `DataScope` 决定范围。

### 2.6 脱敏红线（只读也必须做）

- `upstream_keys.encrypted_key` / `*_key_hash` / `redeem_codes.code_hash` / `redeem_codes.code_plaintext`：**永不返回**，只返回 `key_prefix` + `key_suffix`。
- `users.password_hash` / `users.token_version`：不返回。
- `request_logs.request_body`：列表不返回，详情按需裁剪。
- `system_config` 敏感 key 的 value：脱敏。

### 2.7 前端约定

**新增依赖**（第 1 批）
- `recharts`（图表）。
- shadcn 组件：`table`、`badge`、`tabs`、`select`、`sheet`（详情抽屉）、`skeleton`、`tooltip`、`separator`、`pagination`。

**目录约定**（沿用现有）
- API：`src/api/<module>.ts`，复用 `client`，返回 `Promise<T>`（内部 `.then(r => r.data.data)`）。
- 类型：`src/types/<module>.ts`，新增 `PageResult<T>`。
- 页面：`src/pages/<Name>/index.tsx`；路由在 `src/router/index.tsx` 注册（挂 `RequireAuth+Layout` 下）。

**通用类型与 Hook**（第 1 批建立）
```ts
interface ApiResponse<T = unknown> { code: number; message: string; data: T }
interface PageResult<T> { list: T[]; page: number; size: number; total: number }
interface PageQuery { page?: number; size?: number; keyword?: string; status?: string; userId?: string; from?: string; to?: string; sort?: string }
```
- `usePagedQuery<T>(apiFn, defaultParams)`：管理分页/筛选/loading/error。
- `useRole()`：从 `useAuthStore` 派生 `isAdmin`，驱动页面按角色渲染。

---

## 三、批次总表

| 批次 | 名称 | 代表路由 | 前端页面 | 主要 Model | 角色可见性 |
|---|---|---|---|---|---|
| 0 | 基础设施 + 规范统一 | （公共 helper / msg→message） | 引库+组件+Hook+类型 | — | 通用 |
| 1 | 概览仪表盘 | `/api/dashboard/overview` | Dashboard（KPI+趋势图） | User, UpstreamKey, RequestLog, UsageLedger | 两角色（指标不同） |
| 2 | 请求日志 | `/api/requests`, `/api/requests/:id` | 日志列表 + 详情 | RequestLog, RequestAttempt, RequestLogEvent | 两角色（user 仅自己） |
| 3 | 用户与账户 | `/api/users`, `/api/user/keys`… | 用户管理(admin) + 账户中心(user) | User, UserApiKey, BotKey, UserPlan, Plan | admin 全局 / user 仅自己 |
| 4 | 上游与模型 | `/api/upstream/keys`… | 上游资源（多 Tab） | Provider, UpstreamKey, UpstreamModelMapping, AiModel, RouteGroup | admin 全局 / user 仅自有+公开 |
| 5 | 计费用量 | `/api/usage/*`, `/api/price/rules` | 用量账本 + 额度 + 计费规则 | UsageLedger, QuotaReservation, PriceMultiplierRule | 两角色（user 仅自己） |
| 6 | 兑换码 | `/api/redeem/codes`, `/api/user/redemptions` | 兑换码管理 + 我的兑换 | RedeemCode, RedeemCodeRedemption | 两角色 |
| 7 | 市场分账 | `/api/marketplace/*` | 上架管理 + 结算 + 账本 | MarketplaceListing, MarketplaceRequestSettlement, MarketplaceLedger | 两角色（user 仅买卖双方） |
| 8 | 系统与通知 | `/api/system/*`, `/api/user/notifications` | 公告/通知/版本/配置/迁移 | Announcement, Notification, VersionRelease, UserReleaseRead, SystemConfig, SchemaMigration | admin 全量 / user 仅已发布+自身通知 |

**顺序依据**：先建公共能力与规范 → 全局视角(概览) → 核心可观测(日志) → 核心实体(用户/上游) → 依赖实体聚合的计费 → 相对独立(兑换码) → 最复杂关联链(市场) → 收尾(系统)。每批严格「后端+前端」成对交付、可独立验收。

---

## 四、各批详细方案

### 批次 0 · 基础设施 + 规范统一

**后端**
- `app/common.php`、`app/ExceptionHandle.php`：`msg` → `message`（见 2.1）。
- `app/middleware/Auth.php` 或登录处：放开 `role IN ('admin','user')`（前置阻塞）。
- `app/service/DataScope.php`：角色隔离 helper（见 2.5）。
- `app/support/Pagination.php`（或 trait）：解析 `page/size/sort/from/to`，统一返回 `[list,page,size,total]`；查询字段白名单防注入。

**前端**
- 同步 `ApiResponse.message`、`getApiError` 读取处。
- 装 `recharts`；shadcn 加 `table/badge/tabs/select/sheet/skeleton/tooltip/separator/pagination`。
- `src/types/common.ts`：`PageResult<T>`、`PageQuery`、`SortParam`。
- `src/hooks/usePagedQuery.ts`、`src/hooks/useRole.ts`。
- `src/components/`：`Pagination.tsx`、`EmptyState.tsx`、`StatusBadge.tsx`。

---

### 批次 1 · 概览仪表盘

**后端** `app/controller/api/Dashboard.php` — `GET /api/dashboard/overview`
- admin：用户总数、活跃用户数(近 7d)、活跃上游 Key 数、今日请求数、今日 token 消耗、成功率；近 30d 每日请求量 + token 消耗。
- user：各计费类型(coding/token/image)剩余额度、今日我的请求数/token、成功率；近 30d 我的趋势。
- 聚合走 `GROUP BY date_trunc('day', created_at)`；概览结果可缓存 1~5min。

**前端** 改造 `pages/Dashboard`
- KPI 卡片网格（按角色显示不同指标）。
- `recharts` 面积图（请求数）+ 折线图（token 消耗）。
- `useRole()` 切换两套指标布局。

**Model** User, UpstreamKey, RequestLog, UsageLedger, QuotaReservation
**验收** admin/user 各自 KPI 与趋势；数字与 SQL 直查一致。

---

### 批次 2 · 请求日志监控

**后端** `app/controller/api/RequestLog.php`
- `GET /api/requests`：分页+筛选（userId/模型/protocol/成功/usage_status/计费类型/时间）。列表裁剪字段（不含 request_body）。user 强制 `user_id=self`。
- `GET /api/requests/:id`：详情附 `attempts`（按 attempt_index）+ `events`（按 created_at, id）。user 仅归属自己时可见，否则 404。

**前端** `pages/Requests`
- 列表：表格 + 筛选条 + 分页；行点击进详情。
- 详情：基本信息卡 + Attempts 表 + Events 时间线；`success/status_code` 用 StatusBadge。

**Model** RequestLog, RequestAttempt, RequestLogEvent
**注意** attempt/event 对 request_log 无 relation 方法 → 控制器手动 `where('request_log_id', $id)->select()`。
**验收** 可按模型/状态/时间过滤；详情还原完整执行链路。

---

### 批次 3 · 用户与账户

**后端** `app/controller/api/User.php`
- `GET /api/users`（admin）：分页+搜索(email/role/status)。
- `GET /api/users/:id`（admin）：基本信息 + API Key(脱敏) + Bot Key + 持有套餐(含 Plan) + 用量汇总。
- `GET /api/user`（user）：我的资料。
- `GET /api/user/keys`（user）：我的 user_api_keys（脱敏）。
- `GET /api/user/keys/bot`（user）：我的 bot_keys（脱敏）。
- `GET /api/user/plans`（user）：我的 user_plans（含 Plan 模板）。

**前端** `pages/Users`（admin：表格 + 详情抽屉）/ `pages/Account`（user：账户中心）
- 密钥一律只展示 `key_prefix … key_suffix` + `last_used_at` + 状态。

**Model** User, UserApiKey, BotKey, UserPlan, Plan, UsageLedger
**脱敏** 不返回 password_hash、token_version、key_hash。
**验收** admin 可查任意用户画像；user 只看自己；密钥全程脱敏。

---

### 批次 4 · 上游与模型

**后端** `app/controller/api/Upstream.php`
- `GET /api/upstream/providers`：供应商（含 endpoint 计数）。
- `GET /api/upstream/keys`：上游 Key 列表（脱敏；provider 名、quota 用量比、market_status、review_status）。
- `GET /api/upstream/keys/:id`：详情 + `upstream_model_mappings`（model 名、endpoint、单价）+ 所属 `route_groups` + 最近 `upstream_key_verifications`。
- `GET /api/upstream/routes`：路由组 + 成员映射数。
- `GET /api/models`：平台模型目录（capabilities、billing_mode、context_window）。
- 角色：admin 看全部（含 owner_user_id 平台/用户）；user 看 `owner_user_id=self` 的私有 Key + 所有 `status=active` 的平台模型。

**前端** `pages/Upstream`（多 Tab：供应商 / 上游 Key / 平台模型 / 路由组）
- 上游 Key 表格：用量进度条 + 状态徽章；详情抽屉展示映射与验证记录。
- 平台模型：卡片网格（capabilities 标签）。

**Model** Provider, ProviderEndpoint, UpstreamKey, UpstreamModelMapping, AiModel, RouteGroup, UpstreamRouteGroupMembership, UpstreamKeyVerification
**脱敏** 永不返回 encrypted_key/key_hash；只给 prefix/suffix。
**验收** admin 可看完整路由可达图；user 只看自有 Key 与公开模型；Key 明文不可见。

---

### 批次 5 · 计费用量

**后端** `app/controller/api/Usage.php`
- `GET /api/usage/ledger`：流水（分页+按 ledger_type/billing_plan/userId/时间）。user 仅自己。
- `GET /api/usage/quota`：admin 返回按用户 Top-N + 全平台额度池；user 返回自身各计费类型「已充/已用/预扣/可用」。
- `GET /api/price/rules`：计费倍率规则列表（admin 全局）。

**前端** `pages/Usage`（多 Tab：账本流水 / 额度总览 / 计费规则）
- 流水表：token_delta/request_delta 带正负色；ledger_type 徽章。
- 额度：进度条（已用/总量）+ 预扣待结算。

**Model** UsageLedger, QuotaReservation, PriceMultiplierRule
**口径** 「可用 = Σ正项 − Σ|负项| − 当前 reserved 未终态」；窗口(5h/日/周/月)按 created_at。
**验收** 流水可追溯；额度与「请求消耗」对账一致；user 只看自己。

---

### 批次 6 · 兑换码

**后端** `app/controller/api/RedeemCode.php`
- `GET /api/redeem/codes`（admin）：码列表（脱敏；plan 模板名、redeemed/max、状态）。
- `GET /api/redeem/codes/:id/redemptions`（admin）：某码兑换记录（含用户、ledger、生效套餐）。
- `GET /api/user/redemptions`（user）：我成功的兑换凭证（token_amount 快照、套餐快照）。

**前端** `pages/RedeemCodes`（admin）/ `pages/MyRedemptions`（user）
- 码表格：`code_prefix … code_suffix` + 进度（redeemed_count/max_redemptions）+ 过期状态。

**Model** RedeemCode, RedeemCodeRedemption
**脱敏** 永不返回 code_hash/code_plaintext；user 看不到码本身，只看自己的兑换凭证。
**验收** admin 可查码与兑换明细；user 只看自己的兑换历史；码明文不可见。

---

### 批次 7 · 市场分账

**后端** `app/controller/api/Marketplace.php`
- `GET /api/marketplace/listings`：挂单列表（卖家、映射/上游 Key、单价、审核状态、上下架状态）。
- `GET /api/marketplace/settlements`：结算单（买家/卖家/平台三方金额快照、usage_source、状态）。
- `GET /api/marketplace/ledger`：市场账本流水（entry_type、available_at 解冻时间、状态）。
- 角色：admin 看全部；user 仅 `seller_user_id/consumer_user_id/supplier_user_id/user_id=self` 的相关记录。

**前端** `pages/Marketplace`（多 Tab：上架管理 / 结算流水 / 分账账本）
- 上架看板：按 review_status/market_status 筛选。
- 账本：T+1 解冻时间高亮、金额正负色、状态徽章。

**Model** MarketplaceListing, MarketplaceRequestSettlement, MarketplaceLedger
**注意** 最复杂一批：三方分账语义；request_log_id/request_attempt_id 无 relation 方法（如需关联手动 join）。本批先做只读列表/详情，不做聚合图表。
**验收** admin 可见全链路；user 只见自己参与的记录；金额三方对账平衡（consumer_amount = supplier_reward + platform_fee）。

---

### 批次 8 · 系统与通知

**后端** `app/controller/api/System.php`
- `GET /api/system/notices`：admin 全部(含 draft)；user 仅 `status=published` 且在 publish_from/until 区间内。
- `GET /api/user/notifications`：我的通知，支持 `?unread=1`。
- `GET /api/users/:id/notifications`（admin）：指定用户通知。
- `GET /api/system/releases`：admin 全部；user 仅 published。
- `GET /api/system/releases/:id`：详情附「当前用户是否已读」（join user_release_reads）。
- `GET /api/system/config`（admin）：键值清单（敏感值脱敏）。
- `GET /api/system/migrations`（admin）：迁移台账（filename/applied_at）。

**前端** `pages/System`（admin：公告/配置/迁移）/ 通知中心(全局铃铛下拉) / 版本日志(带「新」红点)
- 通知：未读数徽章 + 列表 + action 按钮。
- 版本：对比 user_release_reads 计算「未读发布」，红点提示。

**Model** Announcement, Notification, VersionRelease, UserReleaseRead, SystemConfig, SchemaMigration
**脱敏** system_config 敏感 value 脱敏。
**验收** admin 可查看系统配置；user 收到自己的通知、看到已发布公告与新版本红点。

---

## 五、风险与注意事项

1. **响应字段改名（msg→message）**：批次 0 一次性完成，前后端同步，登录链路回归。
2. **登录放开（前置阻塞）**：`api/Auth::login()` 现限制 `role=admin`，需放开为 `role IN ('admin','user')`，并确保 user 默认无任何写权限（本就只读）。
3. **领域级软删**：所有表用 `status='deleted'`（非 trait），查询必须显式过滤；已在 `DataScope`/查询层统一处理。
4. **脱敏红线**：见 2.6，每个接口返回字段集都需 review。
5. **越权防护**：user 视角的 `userId` 一律取自 `app('user')`，前端传的 userId 仅 admin 可用且需校验存在性。
6. **聚合性能**：request_logs / usage_ledger 是大表，`GROUP BY date_trunc` 务必加 `created_at` 区间与索引；概览结果加缓存。
7. **无 relation 的语义外键**：RequestAttempt/RequestLogEvent/Marketplace* 对 request_log 的关联无 ORM relation 方法，控制器需手动 `where` 或 join。
8. **时间口径**：5h/日/周/月窗口口径要与执行面计费逻辑一致，建议统一封装窗口计算。
9. **遗留表 `api_keys`**：已废弃，本期一律用 `user_api_keys`。

---

## 六、推进方式

1. 你 review 本方案，确认/调整批次顺序与每批范围。
2. 从**批次 0 + 批次 1**开始：每批同时产出后端控制器+路由+DataScope、前端页面+API+类型，并自测（SQL 对账 + 前端联调）。
3. 每批完成后给一份「该批变更清单 + 验收结果」，再进入下一批。

> 如需，我可在确认后立即开始批次 0+1。
