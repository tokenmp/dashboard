# TokenMP 计费重设计 · TLA+ 形式化验证

用 TLA+ 把设计里的**计费状态机**抽象建模，并用 TLC 穷举检查安全/活性性质。
目的：在设计阶段就把会导致**资金错账 / 配额超卖 / 预留泄漏**的规则漏洞逼出来。

配套设计文档：`../dashboard/docs/billing-redesign.md`

## 文件

| 文件 | 验证对象 | 关键问题 |
|---|---|---|
| `Wallet.tla` | 双轨预留/结算/释放 + 并发交错 | 钱包透支、订阅超卖、幂等、资金守恒 |
| `Topup.tla` | 订单 → 支付回调 → 入账 → 消费 → 退款 | 重复回调多送钱、先消费后退款变负 |
| `Fallback.tla` | 候选回退 `coding↔wallet` | 部分失败的重复扣减 / 资金泄漏（P5） |
| `Windows.tla` | 四维时间窗 + 短期窗重置 | 重置越界绕过总量上限 |
| `Liveness.tla` | 预留活性 + TTL 过期释放 | 结算复核不通过时预留永久悬挂 |
| `QuotaDisplay.tla` | 剩余额度展示口径 vs 放行口径 | 面板显示大额剩余但 executor 拒绝（线上 16～22 倍问题） |
| `MarketSettlement.tla` | 市场分账/放款/提现/回滚 | 重复结算、提现后回滚变负、分账不守恒 |
| `WindowModels.tla` | 独立窗口 vs 周期套住短窗 | 两种语义都安全但容量不同，必须选一 |
| `Exempt.tla` | 免费模型 / 自有 Key 免扣释放 | 标记免费不释放（冻结泄漏）、结算后退款（双重退款） |
| `CrossLedger.tla` | 消费者扣款 vs 供应商入账原子性 | 扣款与入账不在同一事务 → 分账错位 |
| `Rounding.tla` | 预留 / 结算取整方向 | 取整方向不一致 → 透支或漏收 |
| `diagrams.html` / `diagrams/` | 全部验证逻辑的 tldraw 可视化 | 人工查看 |

## 运行

```bash
cd tla
tlc -deadlock -config W3_recheck.cfg Wallet.tla
tlc -deadlock -config T2_safe.cfg    Topup.tla
tlc -deadlock -config F_atomic.cfg   Fallback.tla
tlc -deadlock -config N_correct.cfg  Windows.tla
tlc -deadlock -config L_expire.cfg   Liveness.tla
tlc -deadlock -config Q_min.cfg      QuotaDisplay.tla
tlc -deadlock -config M_safe.cfg     MarketSettlement.tla
tlc -deadlock -config WM_nested.cfg  WindowModels.tla
tlc -deadlock -config E_safe.cfg     Exempt.tla
tlc -deadlock -config X_atomic.cfg   CrossLedger.tla
tlc -deadlock -config R_up_up.cfg    Rounding.tla
```

- `-deadlock`：模型到达「所有请求都结束」的终态会报 deadlock，这是预期终态。
- 本机 `tlc` 包装脚本给每次调用独立 `java.io.tmpdir`，避免共享 `/tmp` 时标准模块解压冲突。
- `Liveness.tla` 用 `PROPERTY` 检查时序性质，需 `-deadlock` 且输出为 `Temporal properties were violated`。

## 通用抽象

- 金额与次数全部用**整数最小单位**，避免浮点。
- 钱包是闭系统：`available + hold + spent = MaxWallet`（守恒）。
- 危险情形用非确定选择显式覆盖：`EstCosts`/`ActCosts` 独立选取（实际 > 预估）、
  `ActWeights` 在 reserve/finalize 各取一次（权重中途变化）、`Abort` 不保证发生（请求协程崩溃）。

---

## 1. Wallet.tla —— 双轨配额与钱包安全

开关：`WalletRecheck ↦ {FALSE,TRUE}`、`CodingMode ↦ {naive,recheck,snapshot}`。

| 配置 | WalletRecheck | CodingMode | 结果 |
|---|---|---|---|
| `W1_naive` | FALSE | naive | ❌ `NoOverdraft`：预留 est=0 → 结算 actual=3 → `available = -1` |
| `W2_walletOnly` | TRUE | naive | ❌ `NoOversell`：reserve 权重 1 → finalize 权重 3 → `subUsed+subHold = 4 > 3` |
| `W3_recheck` | TRUE | recheck | ✅ 1,387,280 states / 462,052 distinct / depth 7 |
| `W4_snapshot` | TRUE | snapshot | ✅ |

不变式：`NoOverdraft`、`NoOversell`、`HoldCoversReservation`、`SubHoldCoversReservation`、
`Conservation`、`ChargeIdempotent`。

**结论**：钱包必须结算复核；订阅权重必须「reserve 快照」或「结算按时点会计口径复核」。

## 2. Topup.tla —— 充值订单与幂等

开关：`SafeRefund ↦ {FALSE,TRUE}`。

| 配置 | SafeRefund | 结果 |
|---|---|---|
| `T1_naive` | FALSE | ❌ `NoNegativeBalance`：入账2→消费2→退款2 → `avail = -2` |
| `T2_safe` | TRUE | ✅ |

不变式：`NoNegativeBalance`、`CreditAtMostOnce`、`Conservation`、`RefundImpliesCredited`、`CreditedImpliesPaid`。

**结论**：退款必须有界（只退未消费部分）；入账以订单状态 + 幂等键双重守卫。

## 3. Fallback.tla —— 候选回退原子性（P5）

开关：`FailMode ↦ {atomic,leaky}`。

| 配置 | FailMode | 结果 |
|---|---|---|
| `F_atomic` | atomic | ✅ |
| `F_leaky` | leaky | ❌ `NoLeak`：失败尝试已扣减，回退下一候选再扣一次 |

不变式：`NoDoubleAttempt`、`NoLeak`、`Conservation`。

**结论**：设计假设「每次候选尝试是单事务原子」是**承载性假设**——失败尝试必须完全不留痕（回滚），否则产生重复扣减/资金泄漏。当前 SQL 单事务满足，但实现时必须保证。

## 4. Windows.tla —— 四维时间窗与重置

开关：`ResetMode ↦ {correct,buggy}`。

| 配置 | ResetMode | 结果 |
|---|---|---|
| `N_correct` | correct | ✅（重置只前移 `windows_reset_at`） |
| `N_buggy` | buggy | ❌ `ConsumedWithinTotal`：重置清空历史 → 绕过总量上限 |

不变式：`WindowBounds`（各窗口已用 ≤ 限额）、`ConsumedWithinTotal`（单调累计 ≤ 总量）。

**结论**：`windows_reset_at` **只能影响 5h/周两个短期窗**；周期与总量必须由**单调累计**（不可被重置推导）来约束，否则用户可反复重置绕过总量上限。这与迁移 `000067` 的设计一致。

## 5. Liveness.tla —— 预留活性与 TTL 兜底

开关：`ExpireEnabled ↦ {FALSE,TRUE}`；`WalletRecheck=TRUE`；`Abort` 无公平性约束（模拟协程崩溃）。

| 配置 | ExpireEnabled | 结果 |
|---|---|---|
| `L_no_expire` | FALSE | ❌ `Temporal properties were violated` |
| `L_expire` | TRUE | ✅ |

反例轨迹：`ReserveWallet(e=0, actCost=3)`（available=2）→ 复核 `2+0 >= 3` 失败 → finalize 永不使能 →
`Abort` 未发生、`Expire` 不存在 → `pc="reserved"` 永久悬挂。

性质：`ReservationsResolved ≡ ∀r: (pc[r]="reserved") ~> (pc[r] ∈ {"done","released"})`。

**结论**：§3.2 的「结算复核」**必须与 TTL 过期释放成对出现**。复核拒绝了一次结算，就制造了一个
无法自愈的预留；只有 `ExpireReservations` 清理 worker 是唯一无条件保证。二者缺一即产生预留泄漏
（`frozen_cny` 永久占用）。

---

## 6. QuotaDisplay.tla —— 展示口径 = 放行口径

背景：executor 放行取四维窗口剩余的最小值
（`remaining = max(min(5h, week, cycle, total) - reserved, 0)`）；dashboard 面板头条取
`windows[0]`（total 或 cycle/month），不是最小值 → 短窗耗尽时面板仍显示大额剩余。

开关：`DisplayPolicy ↦ {cycle_first, min}`。

| 配置 | DisplayPolicy | 结果 |
|---|---|---|
| `Q_cycle_first` | cycle_first（对齐面板现状） | ❌ `DisplayAccurate`：1 次请求用尽 5h 窗（Rem5=0），面板仍显示 cycle 剩余 4 |
| `Q_min` | min（对齐 executor） | ✅ |

不变式：`WindowSound`、`DisplayAccurate ≡ (Displayed > 0) <=> (MinRem > 0)`。

**结论**：任何「单一窗口」头条数字只有在等于各窗剩余最小值时才与放行一致。设计必须
二选一：①头条直接展示 min；②展示各窗口并高亮“约束窗”。绝不能默认取 `windows[0]`。

## 7. MarketSettlement.tla —— 市场分账闭环

开关：`UniqueGuard ↦ {TRUE,FALSE}`、`SafeReversal ↦ {TRUE,FALSE}`。

| 配置 | UniqueGuard | SafeReversal | 结果 |
|---|---|---|---|
| `M_safe` | TRUE | TRUE | ✅ |
| `M_dup` | FALSE | TRUE | ❌ `SettlementOnce`（重复放款 → 供应者多拿钱） |
| `M_reversal` | TRUE | FALSE | ❌ `NoNegativeAvail`（已提现后回滚 → 余额变负） |

不变式：`SplitConservation`（`Charge = Reward + Fee`）、`SettlementOnce`、
`PayoutConservation`（`credited − reversed = avail + withdrawn`）、`NoNegativeAvail`、
`LedgerConservation`（`consumed = credited − reversed + platform + pending`）。

**结论**：
1. `marketplace_request_settlements` 的 `UNIQUE(request_log_id)` 是**承载性约束**，
   去掉即重复放款且全局资金不守恒。
2. 回滚/争议必须**有界**（只回滚未提现部分），否则提现后回滚产生负余额。

---

## 8. WindowModels.tla —— 窗口语义对比实验

背景：dashboard `QuotaService` 注释称「执行器仍按『周期套住周/5h』旧模型放行」，
但 `quota_capacity.go` 实际取四维剩余最小值（独立窗口）。两种语义都安全，但容量不同。

定义：
- `independent`：短窗下界 = `max(activated_at, windows_reset_at)`
- `nested`：短窗下界 = `max(activated_at, windows_reset_at, cycle_window_start)`
  （周期翻滚时 5h/周窗历史随之清空）

| 配置 | Semantics | 结果 |
|---|---|---|
| `WM_independent` | independent | ✅ `SafeChosen` + `NestedDominates` |
| `WM_nested` | nested | ✅ `SafeChosen` + `NestedDominates` |
| `WM_samecapacity` | — | ❌ `SameCapacity`：两种语义容量**确实不同** |

**结论**：两种语义**都安全**，但 `nested >= independent`（已证明单调支配）。
语义切换会改变用户可见容量 → 这是**产品决策**而非正确性问题。设计必须**明确定死一种**并写入代码注释，
不允许代码与文档各执一词。

## 9. Exempt.tla —— 免扣路径释放语义

开关：`ExemptMode ↦ {safe,leak,late}`。

| 配置 | ExemptMode | 结果 |
|---|---|---|
| `E_safe` | safe | ✅ |
| `E_leak` | leak（标记免费不释放） | ❌ `FreeNotFrozen`：冻结永久泄漏 |
| `E_late` | late（结算后退款） | ❌ `Conservation`：资金凭空增加 |

不变式：`Conservation`、`FreeNotFrozen`、`FrozenOnlyReserved`、`NoChargeWhenFree`。

**结论**：`MarkFree` / `MarkUserKeyFree` 必须（1）仅在未结算时生效；（2）同时**释放预留**；
（3）已结算（`charged`）后必须为幂等空操作，**不得退款**。

---

## 10. CrossLedger.tla —— 跨账本原子性

背景（`executor/internal/postgres/logging.go`）：请求完成路径分**三次独立写**，不在同一事务：
1. `billing.Service.Finalize` → `FinalizeReservation` → `usage_ledger(charge)`（消费者扣）
2. `UpdateRequestLog` → 写 `request_logs` 终态
3. `FinalizeMarketplaceSettlement` → `marketplace_request_settlements` + ledger（供应商入）

开关：`AtomicMode ↦ {atomic, separate}`。

| 配置 | AtomicMode | 结果 |
|---|---|---|
| `X_atomic` | atomic | ✅ |
| `X_separate` | separate | ❌ `LedgerPairing`：消费者已扣、供应商未入账 |
| `X_reconcile` | separate + 对账动作 | ✅ `ReconcileEventually`（eventual 修复） |

不变式：`LedgerPairing`（每请求 `cCharged = sCredited`）、`GlobalConservation`
（`consumerOut = supplierIn + platform + holding`）、`HoldingNonNegative`。

**结论**：
- 分账错位**不破坏全局资金守恒**（钱卡在平台 holding），所以监控很难发现；但供应者被短付。
- 对账补偿（`Reconcile`）只能**eventual 修复**，无法修复中间态安全。
- 根治必须让「消费者扣款」与「供应商入账」在**同一事务**，或引入事务外发箱（outbox）。

---

## 11. Rounding.tla —— 金额取整方向

背景：金额 `NUMERIC(18,8)`（元）、单价 `NUMERIC(18,10)`、请求数 `NUMERIC(12,4)`。
每次扣费 = tokens × 单价，乘积可能不能整除，需取整。预留（预估）与结算（实际）各自取整时，
方向不一致会出问题。模型用整数最小单位抽象。

开关：`ReserveRound ↦ {up,down}`、`FinalizeRound ↦ {up,down}`、`Recheck`。

| 配置 | 预留 | 结算 | 结果 |
|---|---|---|---|
| `R_up_up` | up | up | ✅ 安全且不漏收 |
| `R_up_down` | up | down | ❌ `NoUndercharge`：结算低于精确成本 → 收入漏洞 |
| `R_down_up` | down | up | ❌ `NoOverdraft`：结算高于冻结且无复核 → 透支 |
| `R_down_up_recheck` | down | up | ✅（有复核，但可能悬挂 → 需 TTL，见 §5） |

不变式：`NoOverdraft`、`NoUndercharge`、`DriftBound`（`|已扣−精确| ≤ N×(单位−1)`）、`Conservation`。

**结论**：预留必须**向上取整**，结算按精确值（或至少不低于精确值）；
**不得**「预留向下 + 结算向上」而无复核。舍入漂移不可避免但**有界**（每请求 < 1 个最小单位），
对账时需接受这个界。

---

## 汇总（30 配置）

| 模型 | 反例配置 | 通过配置 |
|---|---|---|
| Wallet | `W1_naive` ❌ NoOverdraft、`W2_walletOnly` ❌ NoOversell | `W3_recheck`、`W4_snapshot` |
| Topup | `T1_naive` ❌ NoNegativeBalance | `T2_safe` |
| Fallback | `F_leaky` ❌ NoLeak | `F_atomic` |
| Windows | `N_buggy` ❌ ConsumedWithinTotal | `N_correct` |
| Liveness | `L_no_expire` ❌ 时序性质 | `L_expire` |
| QuotaDisplay | `Q_cycle_first` ❌ DisplayAccurate | `Q_min` |
| MarketSettlement | `M_dup` ❌ SettlementOnce、`M_reversal` ❌ NoNegativeAvail | `M_safe` |
| WindowModels | `WM_samecapacity` ❌ SameCapacity（证明两语义不同） | `WM_independent`、`WM_nested` |
| Exempt | `E_leak` ❌ FreeNotFrozen、`E_late` ❌ Conservation | `E_safe` |
| CrossLedger | `X_separate` ❌ LedgerPairing | `X_atomic`；`X_reconcile`（仅 eventual） |
| Rounding | `R_up_down` ❌ NoUndercharge、`R_down_up` ❌ NoOverdraft | `R_up_up`；`R_down_up_recheck` |

## 从反例中提炼的强制规则（已写入设计文档）

1. **钱包结算必须复核**：`available + 本预留冻结额 >= 实际金额`；不足则走降级/拒绝/记坏账。
   （§3.2）
2. **订阅权重必须稳定**：`request_weight` 与 `multiplier` 在 reserve 时快照；或结算按时点口径复核。
   （§3.1）
3. **结算复核必须配 TTL 兜底**：被复核拒绝的预留只能靠 `ExpireReservations` 释放，否则永久泄漏。
   （§6.3）
4. **候选回退每次尝试必须单事务原子**：失败不留痕，否则重复扣减。（§6.1）
5. **短期窗重置不得影响周期/总量**：总量用单调累计约束。（§3.1 / 迁移 000067）
6. **退款有界**：只退未消费部分。（§7.4）
7. **幂等键规范**：`req:{id}:charge` / `order:{id}:credit` 等。（§7.5）
8. **冻结 ↔ 预留守恒**：`frozen_cny = Σ status='reserved' 的 reserved_amount_cny`。（§3.2）
9. **展示口径 = 放行口径**：面板剩余额度必须取四维窗口剩余的最小值（或逐窗口展示并高亮约束窗），
   不得默认取 `windows[0]`。（§8）
10. **市场结算唯一性**：`UNIQUE(request_log_id)` 是承载性约束；回滚必须只回滚未提现部分。（§7.6）
11. **窗口语义必须定死一种**：独立窗口与周期套住两语义都安全但容量不同，需产品拍板并写入代码。（§3.1）
12. **免扣路径必须释放预留**：`MarkFree`/`MarkUserKeyFree` 仅在未结算时生效且必须释放；已结算后为幂等空操作，不得退款。（§6.4）
13. **消费者扣款与供应商入账必须同事务**：否则分账错位；对账补偿只修复 eventual，不修复中间态安全。（§6.2）
14. **取整方向**：预留向上取整、结算按精确值；不得预留向下 + 结算向上而无复核；舍入漂移有界。（§3.2）

## 可视化（tldraw）

`diagrams.html` 是自包含的 tldraw 画布（从 esm.sh 加载 tldraw），把 §1–§11 的状态机、
不变式、反例与规则画成一张大板。本地打开：

```bash
cd tla && python3 -m http.server 8899   # 然后浏览器打开 http://127.0.0.1:8899/diagrams.html
```

`diagrams/` 内含导出的 `.tldraw`（可在 tldraw 桌面/网页打开继续编辑）、`diagrams.svg`
与六张分区块 PNG 截图。

## 未建模 / 后续可扩展

- 金额舍入：模型用整数，`NUMERIC(18,8)` 的舍入与 Go `decimal` 实现未建模。
- 多用户并发下的锁竞争（advisory lock 的哈希碰撞概率）未建模。
- 四维窗口的**跨窗口组合**（周期套住周/5h 的旧模型 vs 独立窗口）未建模为一个对比实验。
- 市场分账（`marketplace_ledger`）与卖家提现的资金闭环 —— 已在本轮建模（见 §7）。
- 免费模型 / 用户自有免扣 key 的释放路径 —— 已在本轮建模（见 §9）。
- 分账的汇率/税费/发票链路未建模。
- 窗口语义对比已建模（见 §8），但未验证「面板展示在两种语义下各自是否准确」。
- 多用户并发下 advisory lock 的哈希碰撞概率未建模。
