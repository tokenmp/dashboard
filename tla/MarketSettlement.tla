---------------------- MODULE MarketSettlement ----------------------
(*
  TokenGP 市场分账 · 结算/放款/提现/回滚闭环

  背景（迁移 000048）：
    marketplace_listings             上架：售价 / 奖励价 / 平台费率
    marketplace_request_settlements  每请求一条结算：consumer_amount /
                                     supplier_reward / platform_fee，UNIQUE(request_log_id)
    marketplace_ledger               资金分录：consumer_charge /
                                     supplier_reward_pending / available / reversal /
                                     platform_fee / withdrawal

  本模型验证以下安全性质：
    SplitConservation    消费者扣款 = 供应者奖励 + 平台费（费率非负）
    SettlementOnce       同一请求只结算（放款）一次
    PayoutConservation   已放款 - 已回滚 = 可提现 + 已提现（供应者侧资金守恒）
    NoNegativeAvail      可提现余额不得为负
    LedgerConservation   全局分段守恒：已扣款 = 已放款 - 已回滚 + 平台费 + 待放款

  两个设计开关：
    UniqueGuard：
      TRUE  = 放款受 UNIQUE(request_log_id) 守卫（设计）
      FALSE = 允许对已放款请求重复放款（模拟缺少幂等约束）
    SafeReversal：
      TRUE  = 回滚要求 avail >= Reward（只回滚未提现部分）
      FALSE = 回滚不检查余额（提现后回滚 → 余额变负）
*)
EXTENDS Integers, FiniteSets, TLC

CONSTANTS Requests, Reward, Fee, UniqueGuard, SafeReversal

VARIABLES
  st,           (* request -> "none" | "pending" | "available" | "reversed" *)
  releaseCount, (* request -> 放款次数（幂等标志） *)
  avail,        (* 供应者可提现余额 *)
  withdrawn,    (* 供应者已提现 *)
  credited,     (* 供应者累计放款 *)
  reversed,     (* 供应者累计回滚 *)
  platform,     (* 平台累计手续费 *)
  consumed,     (* 消费者累计扣款 *)
  pendingAmt    (* 已结算待放款金额 *)

vars == << st, releaseCount, avail, withdrawn, credited, reversed,
          platform, consumed, pendingAmt >>

Charge == Reward + Fee

TypeOK ==
  /\ st           \in [Requests -> {"none","pending","available","reversed"}]
  /\ releaseCount \in [Requests -> 0..2]
  /\ avail        \in -2..4*Charge+2
  /\ withdrawn    \in 0..4*Charge+2
  /\ credited     \in 0..8*Charge+2
  /\ reversed     \in 0..4*Charge+2
  /\ platform     \in -2..8*Charge+2
  /\ consumed     \in -2..4*Charge+2
  /\ pendingAmt   \in 0..4*Charge+2

Init ==
  /\ st           = [r \in Requests |-> "none"]
  /\ releaseCount = [r \in Requests |-> 0]
  /\ avail      = 0
  /\ withdrawn  = 0
  /\ credited   = 0
  /\ reversed   = 0
  /\ platform   = 0
  /\ consumed   = 0
  /\ pendingAmt = 0

Settle(r) ==
  /\ st[r] = "none"
  /\ st'         = [st EXCEPT ![r] = "pending"]
  /\ consumed'   = consumed + Charge
  /\ pendingAmt' = pendingAmt + Charge
  /\ UNCHANGED << releaseCount, avail, withdrawn, credited, reversed, platform >>

Release(r) ==
  /\ st[r] = "pending"
  /\ st'           = [st EXCEPT ![r] = "available"]
  /\ releaseCount' = [releaseCount EXCEPT ![r] = @ + 1]
  /\ pendingAmt'   = pendingAmt - Charge
  /\ avail'        = avail + Reward
  /\ credited'     = credited + Reward
  /\ platform'     = platform + Fee
  /\ UNCHANGED << withdrawn, reversed, consumed >>

(* 重复放款：仅当关闭 UNIQUE 守卫时可达，用来证明该约束的必要性 *)
DupRelease(r) ==
  /\ ~UniqueGuard
  /\ st[r] = "available"
  /\ releaseCount' = [releaseCount EXCEPT ![r] = @ + 1]
  /\ avail'        = avail + Reward
  /\ credited'     = credited + Reward
  /\ platform'     = platform + Fee
  /\ UNCHANGED << st, withdrawn, reversed, consumed, pendingAmt >>

Withdraw(amt) ==
  /\ amt \in 1..avail
  /\ avail'     = avail - amt
  /\ withdrawn' = withdrawn + amt
  /\ UNCHANGED << st, releaseCount, credited, reversed, platform, consumed, pendingAmt >>

Reverse(r) ==
  /\ st[r] = "available"
  /\ (SafeReversal => avail >= Reward)
  /\ st'       = [st EXCEPT ![r] = "reversed"]
  /\ avail'    = avail - Reward
  /\ reversed' = reversed + Reward
  /\ platform' = platform - Fee
  /\ consumed' = consumed - Charge
  /\ UNCHANGED << releaseCount, withdrawn, credited, pendingAmt >>

Next ==
  \/ \E r \in Requests: Settle(r)
  \/ \E r \in Requests: Release(r)
  \/ \E r \in Requests: DupRelease(r)
  \/ \E amt \in 1..Charge: Withdraw(amt)
  \/ \E r \in Requests: Reverse(r)

Spec == Init /\ [][Next]_vars

(* ───────────────────────── 不变式 ───────────────────────── *)

SplitConservation ==
  \A r \in Requests: st[r] # "none" => Charge = Reward + Fee

SettlementOnce ==
  \A r \in Requests: releaseCount[r] <= 1

PayoutConservation ==
  credited - reversed = avail + withdrawn

NoNegativeAvail ==
  avail >= 0

LedgerConservation ==
  consumed = (credited - reversed) + platform + pendingAmt
====
