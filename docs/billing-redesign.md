# TokenMP 计费 / 定价 / 充值重设计方案

> 状态：**设计稿（待评审）**
> 范围：控制面（`dashboard/`）+ 数据面（`executor/`）+ 数据库迁移
> 数据库迁移唯一源：`executor/migrations/`，新增从 `000076` 起
> 本文不写实现代码，只定义目标模型、数据形状、解析语义与分阶段改造清单

---

## 0. 决策记录（本次拍板）

| # | 议题 | 决策 |
|---|---|---|
| D1 | 首要目标 | ①统一口径 ②商业化收款 ③定价精细化 ④简化运营 ⑤BYOK 变现（按此优先级） |
| D2 | 计费模型 | **双轨并存**：订阅轨（coding/image 按次/张）+ 按量轨（按 token 折算人民币） |
| D3 | 单价基准 | **套餐×模型矩阵**为主；矩阵 → 平台默认价 → 路由成本价（仅核算） |
| D4 | 矩阵语义 | 两轨各自语义：coding/image 格子=**次数权重**；token 格子=**元/token 单价** |
| D5 | 钱包单位 | **人民币元（CNY）** |
| D6 | 双轨关系 | 用户手动选偏好（`preferred_billing` + `fallback_enabled`），主轨不足按 fallback 回退 |
| D7 | 充值渠道 | 先设计数据模型，支付网关后置（订单/支付/钱包三表先建） |
| D8 | 余额存储 | **物化余额 + 账本**（`wallets.balance_cny` + `wallet_ledger`），非实时 SUM |
| D9 | 倍率定位 | 保留 `price_multiplier_rules`，但**明确分工**：矩阵管基础价，倍率只管时段/活动/渠道调整 |
| D10 | 交付范围 | 设计文档 + 改造清单（暂不写实现代码） |

---

## 1. 现状问题清单（调研结论）

### 1.1 三口径互不相通

| 类型 | 计量 | 落账 | 限额 |
|---|---|---|---|
| coding | 请求次数（小数倍率） | `usage_ledger.request_delta = -multiplier` | 滚动5h / 自然周 / 周期 / 总量 |
| token | 原始 token 数 | `usage_ledger.token_delta = -total_tokens` | `Σ token_limit + Σ 充值` |
| image | 图片张数（借 token 列） | `token_delta` | 套餐激活窗内 `token_limit` |

一次请求只走一种口径，没有统一货币，无法跨轨比较、合并余额、算毛利。

### 1.2 定价字段大量存在但不参与扣费

- `plans.price` —— 仅展示/排序。
- `price_multiplier_rules`（side=user）—— 只作用于 coding 的次数。
- `upstream_model_mappings.input/output_price_per_token`、`provider_model_templates.*` —— **executor 计费链路完全不读**。
- 对外文档 `docs-site/guide/billing.md` 宣称 `扣费额度 = 标准用量折算 × 倍率`，与 token 轨实现不符。

### 1.3 没有资金通道

- 无任何在线支付（全仓库无 alipay/wechat/stripe/订单表）。
- 「充值」= 兑换码写 `usage_ledger(recharge, token)`，或管理员直发套餐。
- 没有余额表、没有订单、没有支付流水、无法退款/对账/开票。
- TokenGP 市场有 `marketplace_ledger`（带 CNY 金额）但同样无资金进出。

### 1.4 展示与放行口径漂移

- `dashboard/app/service/QuotaService.php` 的注释自己承认：面板按「4 窗口互相独立」展示，executor 按「周期套住周/5h」放行，实测夸大 16～22 倍。
- 迁移史上 premium packs 建了又删、`total_limit` NOT NULL/NULL 分叉，说明定价模型多次反复未收敛。

### 1.5 运营侧痛点

- 套餐/兑换码维度爆炸（coding/token/image × 分组 × duration × override_mode），运营心智负担高。
- 无法回答「这个用户这个月贡献了多少毛利」——因为用户扣费与上游成本是两套不搭界的数。

---

## 2. 设计原则

1. **单一资金口径**：所有可折算的消耗最终以「人民币元」记账，用一本资金账本（`wallet_ledger`）串起充值、扣费、退款、调账。
2. **定价有唯一解析链**，不允许「字段存在但没人用」。
3. **双轨是对外产品形态，不是内部记账方式**：账本、订单、对账、展示全部统一。
4. **向后兼容 + expand-then-contract**：迁移不可回滚，只加不删，分阶段切读。
5. **扣费幂等**：预扣/结算/退款在 `request_log_id` 维度幂等，沿用现有 `NOT EXISTS` 守卫思路。

---

## 3. 目标概念模型

```
                    ┌──────────────────────────────────────┐
                    │             用户账户                  │
                    │  preferred_billing: coding | wallet   │
                    │  fallback_enabled: bool               │
                    └───────────────┬──────────────────────┘
                                    │
              ┌─────────────────────┴─────────────────────┐
              ▼                                           ▼
   ┌────────────────────┐                     ┌────────────────────┐
   │   订阅轨（权益包）   │                     │   按量轨（钱包）    │
   │ coding/image 按次/张 │                     │  余额 = 人民币元    │
   │ 矩阵格子 = 次数权重  │                     │ 矩阵格子 = 元/token │
   │ 四维时间窗限额       │                     │ 余额不足即拒绝      │
   └─────────┬──────────┘                     └─────────┬──────────┘
             │                                           │
             └──────────────┬────────────────────────────┘
                            ▼
              ┌──────────────────────────────────────┐
              │  统一账本                            │
              │  usage_ledger（用量：tokens/requests）│
              │  wallet_ledger（资金：元）            │
              │  request_logs（快照 + 双轨归属）      │
              └──────────────────────────────────────┘
                            ▲
                            │
              ┌─────────────┴─────────────┐
              │ 充值：orders → payments    │
              │ → wallet_ledger(topup)     │
              │ 兑换码作为免支付充值来源    │
              └────────────────────────────┘
```

### 3.1 订阅轨（Entitlement）

- 形态不变：coding 按请求次数、image 按张数；四维时间窗（5h/周/周期/总量）不变。
- **变化**：每次扣除量不再硬编码 `multiplier`，改为查「套餐×模型矩阵」的 `request_weight`（矩阵未覆盖则默认 1），再乘 `price_multiplier_rules`（side=user）的时段/活动倍率。
- ⚠️ **权重必须稳定（TLC 反例 W2 提炼）**：`request_weight` 与 `multiplier` 必须在 **reserve 时快照**，结算用快照；否则 reserve 权重 1、finalize 权重 2 会导致订阅超卖。若不做快照，则必须结算前断言 `subUsed + (subHold − 本预留) + 实际权重 <= 限额`。
- ⚠️ **短期窗重置不得影响周期/总量（TLC 反例 N_buggy 提炼）**：`windows_reset_at` 只允许影响 5h / 周两个短期窗的下界；周期与总量必须由**单调累计**（不可从可重置的历史推导）约束，否则用户可反复重置绕过总量上限。与迁移 `000067` 的设计一致。
- 订阅套餐可同时携带一笔「赠送钱包额度」（`bonus_balance_cny`），用于订阅耗尽后平滑过渡。

### 3.2 按量轨（Wallet）

- 单位：**人民币元**，精度 `NUMERIC(18,8)`（元级 8 位小数，避免高倍率下抹零）。
- 余额 = `wallets.balance_cny`，物化列 + 乐观锁 `version`。
- **冻结语义（必须精确实现）**：`balance_cny` 是**可用余额**，`frozen_cny` 是**预扣冻结**；总额 = `balance_cny + frozen_cny`。预留 = `balance → frozen` 的搬运（总额不变），结算 = 从冻结中扣除实际金额并销毁（总额减少），释放 = `frozen → balance` 回搬。
- 扣费公式：
  ```
  金额 = (input_tokens  × input_price_per_token
        + output_tokens × output_price_per_token
        + cache_read_tokens  × cache_read_price_per_token
        + cache_write_tokens × cache_write_price_per_token) × user_multiplier
  ```
  单价来源见 §4。
- 预扣：请求开始按**预估 token** 冻结 `reserved_amount_cny`；结束按实际用量结算，多退少补。
- ⚠️ **结算必须复核（TLC 反例 W1 提炼）**：结算前断言 `balance + 本预留冻结额 >= 实际金额`。不足时**不得结算**，必须走「降级另一轨 / 拒绝 / 记坏账 `wallet_ledger(entry_type='bad_debt')` 并冻结该用户后续请求」之一。预留金额建议按 `max_tokens × 最贵单价` 取最坏情况，降低触发概率。
- ⚠️ **取整方向（TLC 反例 R_up_down / R_down_up 提炼）**：预留金额必须**向上取整**，结算按精确值（至少不低于精确值）；**不得**「预留向下取整 + 结算向上取整」而无复核。舍入漂移不可避免但有界（每请求 < 1 个最小单位），对账时需接受此界。
- 余额不足 → `402 QUOTA_EXCEEDED`；若 `fallback_enabled` 且订阅轨可用 → 回退订阅轨。

### 3.3 双轨选择

沿用现有语义，只把 `token` 轨重命名为 `wallet`：

- `users.preferred_billing ∈ {coding, wallet}`（旧值 `token` 迁移为 `wallet`）。
- `users.fallback_enabled`：主轨配额不足时是否回退另一轨。
- 回退链：`coding → wallet`、`wallet → coding`（image 协议额外优先 `image → wallet → coding`）。
- **不做自动跨轨混扣**：一次请求只落一轨，便于对账。

---

## 4. 定价模型

### 4.1 三层价格

| 层 | 载体 | 用途 | 是否参与用户扣费 |
|---|---|---|---|
| L1 套餐×模型矩阵 | `model_prices`（`plan_id` 非空） | 主定价，套餐专属价/权重 | ✅ |
| L2 平台默认价 | `model_prices`（`plan_id IS NULL`） | 矩阵未覆盖时的兜底 | ✅ |
| L3 路由成本价 | `upstream_model_mappings.*_price_per_token`、`provider_model_templates.*` | 上游成本核算、毛利报表 | ❌（只核算） |

**解析链**：`L1 命中 → 用 L1`；`L1 缺失 → L2`；`L1/L2 都缺失 → 拒绝计费`（返回明确错误，避免「免费放行」的隐性亏损；免费模型走 `models.billing_mode='free_global'` 显式豁免）。

> 设计理由：把 L1/L2 合到一张表，用 `plan_id IS NULL` 表达平台默认，天然实现「矩阵 → 平台价」链，避免两张表 join 与优先级歧义。

### 4.2 矩阵格子语义（两轨各自语义）

`model_prices` 一行同时容纳两种语义，按 `plan_type` 解释：

| 列 | coding/image 轨 | token(wallet) 轨 |
|---|---|---|
| `request_weight NUMERIC(12,4)` | **次数权重**（每次请求扣多少"次"，默认 1） | 不使用 |
| `input_price_per_token NUMERIC(18,10)` | 不使用 | 元/token |
| `output_price_per_token` | 不使用 | 元/token |
| `cache_read_price_per_token` | 不使用 | 元/token |
| `cache_write_price_per_token` | 不使用 | 元/token |
| `currency` | CNY | CNY |

- coding/image：`request_weight` 就是矩阵格子的「次数权重」。它**取代**了现在 coding 用 `multiplier` 当次数的做法，语义更清晰（权重是套餐资产，倍率是活动）。
- token/wallet：矩阵给的是**元/token 单价**。平台默认价同样语义。

### 4.3 倍率分工（D9）

`price_multiplier_rules` 保留，但职责收敛为「**基础价之上的动态调整**」：

| side | 作用对象 | 说明 |
|---|---|---|
| `user` | 订阅轨：`request_weight × multiplier`；钱包轨：`金额 × multiplier` | 时段/活动/渠道折扣 |
| `upstream` | 成本核算报表 | 不参与用户扣费 |

- **矩阵管基础价（稳定、按套餐/模型）**；**倍率管动态调整（按时间/渠道）**。两者相乘。
- 文档 `docs-site/guide/billing.md` 需据此重写。
- 保留 `set/multiply/exclusive_group` 组合语义不动。

### 4.4 定价示例

coding 套餐 P（专业版），矩阵配置：
- `gpt-5` → `request_weight = 1.0`
- `claude-opus` → `request_weight = 5.0`

夜间 00:00–06:00 配置 user 倍率 `0.5`。则夜间一次 claude-opus 扣 `5.0 × 0.5 = 2.5` 次。

wallet 用户，平台默认价：
- `deepseek-chat`：input `0.000001` 元/token、output `0.000002` 元/token

一次请求 input 10,000 / output 2,000 → `10000×0.000001 + 2000×0.000002 = 0.014` 元。

---

## 5. 数据模型设计

### 5.1 新增表

#### `model_prices` —— 定价矩阵（L1+L2）

```sql
CREATE TABLE model_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID REFERENCES plans(id) ON DELETE CASCADE,   -- NULL = 平台默认价(L2)
  model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  -- 订阅轨语义
  request_weight NUMERIC(12,4),                          -- 次数权重，NULL 视为 1
  -- 按量轨语义（元/token）
  input_price_per_token        NUMERIC(18,10),
  output_price_per_token       NUMERIC(18,10),
  cache_read_price_per_token   NUMERIC(18,10),
  cache_write_price_per_token  NUMERIC(18,10),
  currency VARCHAR(10) NOT NULL DEFAULT 'CNY',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT model_prices_status_check CHECK (status IN ('active','disabled','deleted')),
  CONSTRAINT model_prices_weight_check CHECK (request_weight IS NULL OR request_weight >= 0),
  CONSTRAINT model_prices_price_check CHECK (
    (input_price_per_token  IS NULL OR input_price_per_token  >= 0) AND
    (output_price_per_token IS NULL OR output_price_per_token >= 0) AND
    (cache_read_price_per_token  IS NULL OR cache_read_price_per_token  >= 0) AND
    (cache_write_price_per_token IS NULL OR cache_write_price_per_token >= 0)
  )
);
-- 唯一：同一 plan+model 仅一条未删除
CREATE UNIQUE INDEX idx_model_prices_unique
  ON model_prices (COALESCE(plan_id, '00000000-0000-0000-0000-000000000000'::uuid), model_id)
  WHERE status <> 'deleted';
CREATE INDEX idx_model_prices_plan ON model_prices (plan_id) WHERE status = 'active';
CREATE INDEX idx_model_prices_model ON model_prices (model_id) WHERE status = 'active';
```

#### `wallets` —— 物化余额

```sql
CREATE TABLE wallets (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance_cny NUMERIC(18,8) NOT NULL DEFAULT 0,          -- 可用余额
  frozen_cny  NUMERIC(18,8) NOT NULL DEFAULT 0,          -- 预扣冻结
  version BIGINT NOT NULL DEFAULT 0,                     -- 乐观锁
  currency VARCHAR(10) NOT NULL DEFAULT 'CNY',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT wallets_balance_check CHECK (balance_cny >= 0 AND frozen_cny >= 0)
);
```

#### `wallet_ledger` —— 资金账本

```sql
CREATE TABLE wallet_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  request_log_id UUID REFERENCES request_logs(id) ON DELETE SET NULL,
  order_id UUID,                                          -- → orders.id（充值/退款）
  entry_type VARCHAR(30) NOT NULL,
  amount_cny NUMERIC(18,8) NOT NULL,                      -- 正=入账，负=出账
  balance_after NUMERIC(18,8) NOT NULL,                   -- 记账后余额快照
  currency VARCHAR(10) NOT NULL DEFAULT 'CNY',
  reason VARCHAR(200),
  idempotency_key VARCHAR(160) UNIQUE,                    -- 幂等去重
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT wallet_ledger_type_check CHECK (entry_type IN (
    'topup','bonus','charge','refund','adjustment','withdrawal','expire','freeze','unfreeze'
  ))
);
CREATE INDEX idx_wallet_ledger_user_created ON wallet_ledger (user_id, created_at DESC);
CREATE INDEX idx_wallet_ledger_request ON wallet_ledger (request_log_id);
CREATE INDEX idx_wallet_ledger_order ON wallet_ledger (order_id);
```

#### `orders` —— 充值/下单单据

```sql
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no VARCHAR(64) UNIQUE NOT NULL,                   -- 对外单号
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  kind VARCHAR(20) NOT NULL,                              -- topup(充值) | plan(购套餐)
  amount_cny NUMERIC(18,8) NOT NULL,                      -- 应付金额
  bonus_cny NUMERIC(18,8) NOT NULL DEFAULT 0,             -- 赠送额度
  plan_id UUID REFERENCES plans(id) ON DELETE SET NULL,   -- kind=plan 时的套餐
  redeem_code_id UUID REFERENCES redeem_codes(id) ON DELETE SET NULL,
  method VARCHAR(30),                                     -- alipay|wechat|manual|redeem
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  idempotency_key VARCHAR(160) UNIQUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  CONSTRAINT orders_kind_check CHECK (kind IN ('topup','plan')),
  CONSTRAINT orders_status_check CHECK (status IN ('pending','paid','cancelled','refunded','expired')),
  CONSTRAINT orders_amount_check CHECK (amount_cny >= 0 AND bonus_cny >= 0)
);
CREATE INDEX idx_orders_user_created ON orders (user_id, created_at DESC);
CREATE INDEX idx_orders_status ON orders (status, created_at);
```

#### `payment_transactions` —— 支付网关流水

```sql
CREATE TABLE payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  gateway VARCHAR(30) NOT NULL,                           -- alipay|wechat|manual|redeem
  gateway_txn_id VARCHAR(128),                            -- 网关侧交易号
  amount_cny NUMERIC(18,8) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'created',
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payment_tx_status_check CHECK (status IN ('created','succeeded','failed','refunded')),
  CONSTRAINT payment_tx_gateway_check CHECK (gateway IN ('alipay','wechat','manual','redeem'))
);
CREATE UNIQUE INDEX idx_payment_tx_gateway_txn
  ON payment_transactions (gateway, gateway_txn_id)
  WHERE gateway_txn_id IS NOT NULL;
CREATE INDEX idx_payment_tx_order ON payment_transactions (order_id);
```

### 5.2 改表（全部可空/带默认，向后兼容）

| 表 | 变更 | 用途 |
|---|---|---|
| `usage_ledger` | `+ amount_cny NUMERIC(18,8)`、`+ currency`、`+ order_id UUID`、`+ wallet_ledger_id UUID` | 用量与资金的关联 |
| `quota_reservations` | `+ reserved_amount_cny NUMERIC(18,8)`、`+ final_amount_cny NUMERIC(18,8)` | 钱包轨预扣 |
| `request_logs` | `+ billing_amount_cny NUMERIC(18,8)`、`billing_source` 增加 `'wallet'` | 请求快照与报表 |
| `users` | `preferred_billing` 约束加入 `'wallet'`（旧 `token` 迁移为 `wallet`）；`coding_plan_strategy` 不动 | 双轨偏好 |
| `plans` | `+ amount_limit_cny NUMERIC(18,8)`（token 轨额度包）、`+ bonus_balance_cny` | 订阅/额度包余额 |
| `usage_ledger`/`quota_reservations`/`request_logs` | `billing_plan` 约束加入 `'wallet'` | 新轨标识 |
| `upstream_model_mappings` / `provider_model_templates` | 语义标注为 L3 成本价（不改列） | 文档 + 注释 |

> `billing_plan='token'` 存量行保留不迁移（历史可读）；`wallet` 为新写入值。展示层把 `token` 归一到 `wallet`。

### 5.3 与现有 `usage_ledger` 的关系

- `usage_ledger` = **用量账本**（tokens / requests），保留。
- `wallet_ledger` = **资金账本**（元），新增。
- 一次请求在钱包轨产生：`usage_ledger(charge, token_delta=-tokens, amount_cny=-X)` + `wallet_ledger(charge, amount_cny=-X)`，靠 `request_log_id` 关联，双向对账。
- 订阅轨不产生 `wallet_ledger`（无资金变动），但 `usage_ledger` 记 `amount_cny = 套餐内折算价 × 权重` 供毛利分析（**不扣余额**，仅影子记账）。

---

## 6. 计费流程（目标态）

### 6.1 Reserve

```
1. 确定主轨 primary = log.BillingPlan ?? preferred_billing
2. Candidates(primary, fallback_enabled) 生成候选链
   - coding → [coding, wallet]
   - wallet → [wallet, coding]
   - image  → [image, wallet, coding]
3. 逐候选尝试（每次尝试必须是单事务原子，失败不得留痕，TLC Fallback 反例）：
   coding: advisory lock(user, coding) → 四维容量检查 → 预留 requests=Σ request_weight（reserve 时快照）
   wallet: advisory lock(user, wallet) → 冻结预估金额 → 余额校验
4. 成功：写 quota_reservations（含 amount_cny 字段）+ usage_ledger(reserve)
5. 全失败：402 QUOTA_EXCEEDED
```

⚠️ **回退原子性（TLC `F_leaky` 反例）**：每个候选尝试必须单事务原子——失败尝试必须完全回滚，
否则「先扣减后失败」再回退下一轨会产生重复扣减与资金泄漏。禁止把一次候选尝试拆成多步非事务写。

### 6.2 Finalize

```
coding: final_requests = request_weight(矩阵) × multiplier(倍率规则)
wallet: final_amount  = Σ(tokens × 矩阵单价) × multiplier
        → wallet_ledger(charge, -final_amount), 更新 wallets.balance_cny/frozen_cny
        → usage_ledger(charge, token_delta=-tokens, amount_cny=-final_amount)
```

⚠️ **跨账本原子性（TLC 反例 X_separate 提炼）**：请求完成路径目前分三次独立写
（配额 charge、`request_logs` 终态、`FinalizeMarketplaceSettlement`），**不在同一事务**。
若「消费者扣款」成功而「供应商入账」失败，全局资金守恒仍成立（钱卡在平台 holding），
但供应者被短付，且监控难以发现。

**规则**：钱包扣费与市场结算（消费者扣款 + 供应商入账）必须在**同一数据库事务**内完成，
或采用事务外发箱（outbox）保证最终一致。对账补偿 worker 只能做 eventual 修复，
不得作为唯一保障。

### 6.3 Release / Expire

- 释放钱包预扣 → `wallet_ledger(unfreeze/refund)`，恢复 `frozen_cny`。
- ⚠️ **TTL 过期释放是与「结算复核」成对的必要机制（TLC `L_no_expire` 反例）**：
  §3.2 的复核会拒绝某些结算，若请求协程崩溃/静默断连导致 `Release` 未被调用，
  该预留将**永久悬挂**，`frozen_cny` 永久占用。因此 `ExpireReservations` 清理 worker
  （`runtime.RunRuntimeCleanupWorker`）必须无条件兜底释放所有超 TTL 的预扣。
  缺少它 ⇔ 预留永久泄漏。

### 6.4 免费豁免（不变）

- `models.billing_mode='free_global'` → 不预留、不扣费，`billing_source='free_model'`。
- 用户自有免扣 key → 同上，`billing_source='user_key'`。
- ⚠️ **免扣路径的释放语义（TLC 反例 E_leak / E_late 提炼）**：`MarkFree` / `MarkUserKeyFree` 必须
  （1）仅在**未结算**（`~charged`）时生效；（2）同时**释放预留**（`freeze → balance`）；（3）已结算后
  必须为**幂等空操作，不得退款**。否则分别产生「冻结永久泄漏」与「双重退款/资金凭空增加」。

---

## 7. 充值 / 收款流程（支付后置）

### 7.1 目标链路（支付接入后）

```
用户下单 → orders(pending)
  → 调支付网关 → payment_transactions(created)
  → 网关回调 → payment_transactions(succeeded) + orders(paid)
  → wallet_ledger(topup, +amount) + wallets.balance_cny += amount
  → 若 kind=plan：发放 user_plans + bonus 入账
```

### 7.2 现阶段（无支付）

- 兑换码改为走 `orders(kind=topup, method=redeem, status=paid)` + `wallet_ledger(topup)`，**余额单位从 token 改为元**。
- 管理员后台可手工建单 `method=manual` 直接入账（ToB/对公）。
- `RedeemService` 的 token 充值逻辑替换为钱包入账；套餐奖励逻辑保留。

### 7.3 兑换码模型调整

- `redeem_codes.token_amount INT` → 新增 `amount_cny NUMERIC(18,8)`（保留旧列读取兼容）。
- 兑换时写 `orders` + `wallet_ledger`，不再直接写 `usage_ledger(recharge, token)`。

### 7.4 退款

- ⚠️ **退款有界（TLC 反例 T1 提炼）**：只退未消费部分，要求 `balance_cny >= 退款额`，否则先消费后退款会把余额打成负数。不足时只允许部分退或拒绝。
- `orders(status=refunded)` + `wallet_ledger(refund, -amount)`。
- 预留 `wallet_ledger(entry_type='withdrawal')` 支持提现（TokenGP 卖家）。

### 7.5 幂等键规范（TLC 不变式 CreditAtMostOnce 提炼）

所有资金/配额写入都必须带幂等键，且键的格式固定：

| 场景 | 幂等键 |
|---|---|
| 钱包结算 | `req:{request_log_id}:charge` |
| 钱包释放 | `req:{request_log_id}:release` |
| 订单入账 | `order:{order_id}:credit` |
| 订单退款 | `order:{order_id}:refund` |
| 兑换码入账 | `redeem:{redeem_code_id}:{user_id}` |

支付回调的幂等由 `orders.status='paid'` + `payment_transactions(gateway, gateway_txn_id)` 唯一索引双重守卫；**已终态订单的重复回调必须是空操作**。

### 7.6 市场分账（TokenGP）规则（TLC 反例 M_dup / M_reversal 提炼）

现有 `marketplace_request_settlements` / `marketplace_ledger` 保留，但明确两条强制规则：

1. **结算唯一性**：`marketplace_request_settlements` 的 `UNIQUE(request_log_id)` 是**承载性约束**——
   它是「同一请求只放款一次」的唯一保证，去掉即重复放款且全局资金不守恒（TLC `SettlementOnce` 已验证）。
   新增的 `orders` / `wallet_ledger` 链路不得绕过它。
2. **回滚有界**：争议/退款回滚必须只回滚**未提现部分**（要求供应者 `avail >= reward`），
   否则已提现后回滚会把余额打成负数（TLC `NoNegativeAvail` 已验证）。
3. **分账守恒**：`consumer_amount = supplier_reward + platform_fee` 且 `platform_fee >= 0`，
   供应者侧 `credited − reversed = avail + withdrawn`（TLC `SplitConservation`/`PayoutConservation` 已验证）。

---

## 8. 定价与展示统一

- **单一数据源**：landing 模型页、控制台请求明细、账本、对账全部读 `model_prices` + 倍率。
- 修正 `docs-site/guide/billing.md`：明确「基础价（矩阵/平台）× 倍率（时段/活动）」，并区分订阅轨（次数权重）与钱包轨（元）。
- ⚠️ **展示口径必须等于放行口径（TLC 反例 Q_cycle_first 提炼）**：executor 放行取四维窗口剩余**最小值**；
  面板头部若取 `windows[0]`（当前实现）会在短窗耗尽时夸大剩余（实测 16～22 倍）。修法二选一：
  ① 头部直接展示四维剩余最小值；② 逐窗口展示并高亮当前“约束窗”。**不得默认取 `windows[0]`。**
- `dashboard/app/service/QuotaService.php` 与 executor `quota_capacity.go` 的窗口口径**强制对齐**，并加跨端一致性测试（同一 fixture 下两端口径相等）。
- 面板统一展示：订阅轨显示四维窗口 + 折算元；钱包轨显示余额（元）+ 已用（元）+ 冻结。

---

## 9. 迁移策略（expand-then-contract）

迁移不可回滚，只能回镜像。分四个阶段：

| 阶段 | 内容 | 兼容性 |
|---|---|---|
| **E1 扩展** | 建 `model_prices`、`wallets`、`wallet_ledger`、`orders`、`payment_transactions`；给现有表加可空 `amount_cny` 等列；扩展约束加入 `wallet` | 旧代码不读新表，完全兼容 |
| **E2 回填** | 回填 `model_prices`（L2 平台默认价从现有 `upstream_model_mappings` 聚合）；给存量用户建 `wallets` 行；把存量 `token` 套餐额度按配置费率折算为 `amount_limit_cny`（或标记 legacy） | 只写新列，可空，旧代码忽略 |
| **E3 切读** | executor 新版本支持矩阵定价 + 钱包扣费；dashboard 支持矩阵/钱包/订单管理；双写 `usage_ledger.amount_cny` | 新旧代码均可运行；`billing_plan` 新旧值并存 |
| **E4 收口** | 停写旧字段（`plans.token_limit` 用于新 token 套餐、`usage_ledger(recharge,token)`）；文档下线；观察期后仅保留只读 | 需确认无旧镜像回滚需求 |

> 关键：**E3 之前不得改任何旧列语义**；E3 之后新老镜像必须都能跑（`billing_plan IN ('coding','token','image','wallet','free')`）。

---

## 10. 改造清单

### 10.1 迁移（executor/migrations/，从 000076 起）

| 文件 | 内容 |
|---|---|
| `000076_model_prices.up/down.sql` | 建 `model_prices` |
| `000077_wallet_core.up/down.sql` | 建 `wallets` + `wallet_ledger` |
| `000078_orders_payments.up/down.sql` | 建 `orders` + `payment_transactions` |
| `000079_billing_amount_columns.up/down.sql` | `usage_ledger`/`quota_reservations`/`request_logs` 加 `amount_cny` 等 |
| `000080_billing_plan_wallet.up/down.sql` | 各约束加入 `'wallet'`；`users.preferred_billing` 加入 `'wallet'` |
| `000081_plans_amount_limit.up/down.sql` | `plans.amount_limit_cny` / `bonus_balance_cny`；`redeem_codes.amount_cny` |
| `000082_backfill_model_prices.up/down.sql` | E2 回填（数据迁移，down 可清空新表） |

### 10.2 Executor（Go）

| 文件 | 改动 |
|---|---|
| `internal/postgres/models/` | 新增 `ModelPrice`、`Wallet`、`WalletLedger`、`Order`、`PaymentTransaction` 模型 |
| `internal/postgres/pricing.go`（新） | `ResolveModelPrice(planID, modelID)` 三层解析链 |
| `internal/postgres/wallet.go`（新） | 钱包预留/结算/退款，乐观锁 + advisory lock |
| `internal/postgres/quota_capacity.go` | 钱包轨 `amount_cny` 容量；与 dashboard 口径对齐 |
| `internal/postgres/quota_reserve.go` | 支持 `reserved_amount_cny` |
| `internal/postgres/multiplier.go` | 保留；新增 `ResolveRequestWeight`（矩阵权重） |
| `internal/executor/billing/` | 新增 `wallet.go`（钱包轨原语）、`pricing.go`（价格解析）；`candidates.go` 回退链改 `wallet` |
| `internal/executor/types/` | `QuotaReservation`/`RequestLog` 加 amount 字段；`BillingPlanWallet` 常量 |
| `internal/executor/auth/` | `PreferredBilling` 支持 `wallet`（兼容旧 `token`） |
| `internal/executor/protocols/` | 计费调用点改双轨；timeline 记金额 |
| `internal/postgres/migration_contract_test.go` | 新表契约测试 |

### 10.3 Dashboard（PHP）

| 文件 | 改动 |
|---|---|
| `app/controller/dashboard/ModelPrice.php`（新） | 矩阵 CRUD（平台默认 + 套餐矩阵） |
| `app/controller/dashboard/Wallet.php`（新） | 用户钱包查询、手工调账 |
| `app/controller/dashboard/Order.php`（新） | 订单列表、手工建单、退款 |
| `app/controller/dashboard/Plan.php` | 支持 `amount_limit_cny`、矩阵入口 |
| `app/controller/dashboard/Redeem.php` | `amount_cny` 字段替换 token_amount |
| `app/service/RedeemService.php` | 兑换走 `orders` + `wallet_ledger` |
| `app/service/QuotaService.php` | 统一钱包/订阅展示；与 executor 对齐 |
| `app/controller/panel/*` | 我的钱包、订单、充值页接口 |
| `app/model/` | 新增 `ModelPrice`、`Wallet`、`WalletLedger`、`Order`、`PaymentTransaction` |
| `route/app.php` | 新路由 |

### 10.4 前端（React）

| 页面 | 改动 |
|---|---|
| `web/src/pages/plans/` | 展示矩阵价（按模型列价/权重） |
| `web/src/pages/landing/Models.tsx` | 价格来源切 `model_prices` |
| `web/src/pages/panel/`（新/改） | 钱包余额、充值下单、订单列表、账本 |
| `web/src/pages/dashboard/`（新/改） | 定价矩阵编辑、钱包/订单管理 |
| `web/src/pages/price-rules/` | 明确「基础价 × 倍率」文案与侧别说明 |

### 10.5 文档

| 文件 | 改动 |
|---|---|
| `dashboard/docs-site/guide/billing.md` | 重写计费公式，区分双轨 |
| `dashboard/docs-site/guide/plans.md` | 补充钱包/额度包 |
| `dashboard/docs-site/guide/plan-cycles.md` | 补充钱包轨 |
| 新增 `guide/wallet.md`、`guide/topup.md` | 钱包与充值说明 |
| `dashboard/docs/backend-conventions.md` | 记录新表与不变量 |
| `executor/AGENTS.md` / `dashboard/AGENTS.md` | 新迁移起始号、双轨约定 |

---

## 11. 形式化验证（TLA+ / TLC）

设计规则已用 TLA+ 建模、TLC 穷举验证（11 个模型 / 30 组配置）。模型与运行方式见 `../tla/README.md`，可视化见 `../tla/diagrams.html`。

| 模型 | 验证对象 | 原稿结果 | 修订结果 |
|---|---|---|---|
| `Wallet.tla` | 双轨预留/结算/释放 + 并发 | ❌ `NoOverdraft`（结算超预估→透支）、❌ `NoOversell`（权重中途变大） | ✅ recheck / snapshot 双方案均通过（1.4M states） |
| `Topup.tla` | 订单/回调/退款 | ❌ `NoNegativeBalance`（先消费后退款） | ✅ `SafeRefund=TRUE` 通过 |
| `Fallback.tla` | 候选回退原子性（P5） | ❌ `NoLeak`（失败尝试已扣减→重复扣） | ✅ `FailMode=atomic` 通过 |
| `Windows.tla` | 四维窗口 + 短期窗重置 | ❌ `ConsumedWithinTotal`（重置越界绕过总量） | ✅ `ResetMode=correct` 通过 |
| `Liveness.tla` | 预留活性 | ❌ 时序性质（复核拒绝→永久悬挂） | ✅ `ExpireEnabled=TRUE` 通过 |
| `QuotaDisplay.tla` | 展示口径 vs 放行口径 | ❌ `DisplayAccurate`（面板夸大剩余） | ✅ `DisplayPolicy=min` 通过 |
| `MarketSettlement.tla` | 市场分账/放款/提现/回滚 | ❌ `SettlementOnce`（重复放款）、❌ `NoNegativeAvail`（提现后回滚） | ✅ `UniqueGuard + SafeReversal` 通过 |
| `WindowModels.tla` | 独立窗口 vs 周期套住短窗 | —（两语义都安全） | ✅ 两者均安全；`SameCapacity` 被反驳，证明容量不同 |
| `Exempt.tla` | 免费模型 / 自有 Key 免扣 | ❌ `FreeNotFrozen`（冻结泄漏）、❌ `Conservation`（双重退款） | ✅ `ExemptMode=safe` 通过 |
| `CrossLedger.tla` | 消费者扣款 vs 供应商入账原子性 | ❌ `LedgerPairing`（分账错位） | ✅ `AtomicMode=atomic`；对账仅 eventual |
| `Rounding.tla` | 预留 / 结算取整方向 | ❌ `NoUndercharge`（漏收）、❌ `NoOverdraft`（透支） | ✅ `ReserveRound=up`；或 `+Recheck` |

**被 TLC 验证的强制不变式**（实现必须保持）：

```
NoOverdraft               balance_cny >= 0 / frozen_cny >= 0
NoOversell                subUsed + subHold <= 限额
HoldCoversReservation     未结清钱包预留 <= 该用户 frozen_cny
SubHoldCoversReservation  未结清订阅预留 <= 该用户订阅冻结量
Conservation              balance + frozen + spent = 初始总额
ChargeIdempotent          同一请求不重复扣费
CreditAtMostOnce          同一订单不重复入账
RefundImpliesCredited     未入账不得退款
NoLeak                    候选回退失败不得扣减
ConsumedWithinTotal       单调累计 <= 总量限额
ReservationsResolved      每个 reserved 最终 done 或 released（活性）
```

**由反例提炼、已写入本文档的规则**：

| 规则 | 位置 | 反例 |
|---|---|---|
| 钱包结算复核 | §3.2 | `W1_naive` |
| 订阅权重快照/复核 | §3.1 | `W2_walletOnly` |
| 结算复核 + TTL 兜底必须成对 | §6.3 | `L_no_expire` |
| 候选回退单事务原子 | §6.1 | `F_leaky` |
| 短期窗重置不影响周期/总量 | §3.1 | `N_buggy` |
| 退款有界 | §7.4 | `T1_naive` |
| 幂等键规范 | §7.5 | — |
| 展示口径 = 放行口径 | §8 | `Q_cycle_first` |
| 市场结算唯一 + 回滚有界 | §7.6 | `M_dup`、`M_reversal` |
| 窗口语义定死一种 | §3.1 | `WM_samecapacity` |
| 免扣路径必须释放预留 | §6.4 | `E_leak`、`E_late` |
| 消费者扣款与供应商入账同事务 | §6.2 | `X_separate` |
| 取整方向：预留向上、结算精确 | §3.2 | `R_up_down`、`R_down_up` |

> 未建模：金额舍入（整数抽象）、多用户锁竞争概率、周期套住周/5h 的旧模型对比、市场分账闭环。

---

## 12. 风险与待决事项

| # | 事项 | 影响 | 建议 |
|---|---|---|---|
| R1 | 存量 `token` 套餐额度如何折算为 `amount_limit_cny` | 折算率错会影响已付费用户权益 | 提供配置费率 + 人工审核；先标记 legacy 并行一段 |
| R2 | `wallet` 与 `token` 双值并存期的报表口径 | 报表可能漏算/重复 | `usage_ledger` 视图归一化 `token→wallet` |
| R3 | 钱包浮点精度 | 抹零/超扣 | 全链路 `NUMERIC`，Go 用 `decimal` 库，禁止 float；TLC 模型已用整数抽象验证守恒 |
| R4 | 支付网关选型（微信/支付宝/易支付/对公） | 影响 `payment_transactions` 字段 | 先按通用字段建表，网关适配层后置 |
| R5 | 对账/开票/税务 | 合规 | 订单 + 资金账本已满足基础；发票系统另立项 |
| R6 | 面板与 executor 窗口口径对齐 | 用户投诉 | 跨端一致性测试作为合并门禁 |
| R7 | 免费模型与无价模型混淆 | 隐性亏损 | 无价显式拒绝，免费需 `billing_mode` 显式声明 |
| R13 | 结算复核拒绝后预留悬挂 | `frozen_cny` 永久占用 | **已定规则**：§6.3 复核必须配 TTL 过期释放；TLC `ReservationsResolved` 已验证 |
| R14 | 候选回退非原子 | 重复扣减/资金泄漏 | **已定规则**：§6.1 每次尝试单事务原子；TLC `NoLeak` 已验证 |
| R15 | 短期窗重置越界 | 绕过总量上限 | **已定规则**：§3.1 重置只影响 5h/周；TLC `ConsumedWithinTotal` 已验证 |
| R16 | 面板剩余额度夸大 | 用户投诉/退款 | **已定规则**：§8 展示口径取四维最小值；TLC `DisplayAccurate` 已验证 |
| R17 | 市场重复放款/提现后回滚 | 供应者资金错账 | **已定规则**：§7.6 唯一约束 + 回滚有界；TLC `SettlementOnce`/`NoNegativeAvail` 已验证 |
| R18 | 窗口语义代码与文档不一致 | 容量口径分歧 | **已定规则**：§3.1 必须定死一种并写入代码注释；TLC 证明两语义均安全但容量不同 |
| R19 | 免扣路径冻结泄漏/双重退款 | 资金错账 | **已定规则**：§6.4 未结算才生效 + 必须释放 + 已结算幂等；TLC `FreeNotFrozen`/`Conservation` 已验证 |
| R20 | 消费者扣款与供应商入账不同事务 | 供应者被短付（守恒仍成立，难发现） | **已定规则**：§6.2 同事务或 outbox；TLC `LedgerPairing` 已验证 |
| R21 | 取整方向不一致 | 透支或漏收 | **已定规则**：§3.2 预留向上、结算精确；TLC `NoUndercharge`/`NoOverdraft` 已验证 |
| R8 | 多 coding 套餐 + 矩阵权重的策略排序 | 扣费顺序变化 | 矩阵只改单个套餐内扣量，不改套餐间排序，风险可控 |
| R9 | 迁移体量大（29GB 历史表） | 锁表/耗时 | E1/E2 全部 `ADD COLUMN NULL` + 后台回填，避免长事务 |

| R10 | 结算超预估导致透支 | 资金/坏账 | **已定规则**：结算前复核（§3.2）+ 预留取最坏情况；TLC 已验证 |
| R11 | 预扣冻结与余额口径误解 | 对账缺口 | **已定规则**：§3.2 冻结语义；不变式 `frozen = Σ reserved_amount_cny` |
| R12 | 重复回调/重复结算 | 多送钱/重复扣费 | **已定规则**：§7.5 幂等键；TLC `CreditAtMostOnce` 已验证 |

---

## 12.1 实施记录（E3 / E4 已落地）

本节记录与上文设计的**实际取舍差异**，避免后来者按设计逐条对照时误判。

### 钱包轨（E3）

| 设计条目 | 落地做法 | 理由 |
|---|---|---|
| §4.3 金额 × 倍率 | **暂未接入钱包轨**，仅 `用量 × 快照单价` | 预留估算拿不到路由维度的倍率（路由尚未选定），若只在结算乘倍率会造成系统性「预留不足 → 触发坏账」。倍率接入需同时改预留估算口径，单开一轮。 |
| wallet 插入 coding/token 回退链 | **只做 opt-in**：`users.preferred_billing='wallet'` 才有 `[wallet, coding]` | 反向插入会让任何用户耗完套餐就被自动切到「从人民币余额扣钱」，属非预期扣费。 |
| 灰度开关 `system_config.wallet_billing_enabled` | **未加**，以 per-user opt-in 代替 | 止损只需一条 `UPDATE users SET preferred_billing='coding'`，不需要回滚镜像。 |
| §3.2 复核不足的处理 | **有界坏账**：收满「可用余额 + 本预留冻结额」，余额落到 0 且永不为负，差额在 `wallet_ledger.reason` 留 `capped` | 预留发生在上游调用之前、结算发生在服务完成之后，此时「拒绝」= 用户白用；直接静默 release 更是免单。设计原文只写了「不得为负」，此处补上「不得免单」。 |
| §3.1 价格在 reserve 时快照 | 已落地：`quota_reservations` 新增 5 个价格列（迁移 000083），预留时写死，结算只折算不再查 `model_prices` | 中途改价/矩阵下架不会让同一请求的预扣与实扣用两套单价。 |

**登录口径**：钱包轨 `billing_plan='wallet'`、`billing_source='wallet'`；
`request_logs.billing_amount_cny` 必须非 0（为 0 即代表金额未接线 = 免费通道）。

### 市场分账（E4）

设计 §7.6 的三跳现已全部落地（`executor/internal/postgres/marketplace_payout.go`）：

| 环节 | 实现 | 幂等保证 |
|---|---|---|
| 分账 | 请求成功 → `marketplace_request_settlements(pending)` + `supplier_reward_pending`（`available_at = +7d`） | `UNIQUE(request_log_id)` |
| 放款 | `available_at` 到期后 pending → available，写 `supplier_reward_available`，settlement 置 `available` + `settled_at` | `idempotency_key='supplier_reward_available:<settlement_id>'`（TLA+ `SettlementOnce`） |
| 提现 | 写 `withdrawal` 负数流水，锁内校验余额 | 幂等键先查后写 + `pg_advisory_xact_lock(user)`（TLA+ `NoNegativeAvail`） |

触发方式：执行器内部端点 `POST /internal/v1/executor/runtime/payout`（适合挂定时任务）、
`POST /internal/v1/executor/marketplace/withdrawal`、`GET /internal/v1/executor/marketplace/balance`。
**控制面（dashboard）的提现页面 / 审批流尚未接**，当前仅供运维与自动化调用。

仍待办：`supplier_reward_reversal`（争议回滚，需定义「只回滚未提现部分」）、
`platform_fee` 独立流水（目前只是 settlement 上的一个数）。

## 13. 附：术语

| 词 | 含义 |
|---|---|
| 订阅轨 | coding/image 套餐，按次/张消耗权益 |
| 按量轨 / 钱包 | 以人民币元计量的预付余额，按 token 折算扣费 |
| 矩阵（model_prices） | 套餐×模型定价表；`plan_id IS NULL` 为平台默认价 |
| 次数权重（request_weight） | 订阅轨中单次请求消耗的"次数"，来自矩阵 |
| 基础价 | 矩阵或平台默认价，未经倍率调整 |
| 倍率 | `price_multiplier_rules`，对基础价的时段/活动调整 |
| 成本价 | 路由级上游单价，仅供毛利核算 |
| 预扣 | 请求开始时冻结额度，结束后结算 |
| L1/L2/L3 | 套餐矩阵 / 平台默认价 / 路由成本价 |
