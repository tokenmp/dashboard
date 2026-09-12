---------------------------- MODULE Wallet ----------------------------
(*
  双轨计费 · 配额与钱包安全模型（抽象）

  建模目标：验证设计中「订阅轨（coding 按次）+ 按量轨（wallet 按元）」在
  预留 / 结算 / 释放 生命周期 + 并发交错下，不会出现：
    - 钱包透支（available < 0 / hold < 0）
    - 订阅超卖（subUsed + subHold > SubLimit）
    - 预留冻结不覆盖未结清预留
    - 同一请求被重复扣费
    - 资金不守恒

  抽象说明：
    - 金额/次数用整数最小单位，避免浮点。
    - 钱包为闭系统：初始 available = MaxWallet，守恒式
        available + hold + spent = MaxWallet。
    - 预估成本 EstCosts、实际成本 ActCosts 独立非确定选取，覆盖「实际 > 预估」。
    - 订阅权重 ActWeights 在 reserve 与 finalize 各取一次，覆盖「权重/倍率中途变化」。
    - 候选回退（coding↔wallet）被抽象为「任选一轨预留」，因其为单事务原子操作；
      这里不建模部分失败，见评审 P5。

  两个独立的设计规则开关：
    WalletRecheck：钱包结算前是否校验 available + 本预留冻结额 >= 实际成本。
        FALSE = 原稿（直接补扣，可透支）
        TRUE  = 修订规则（不足则本步不使能 → 需降级/拒绝/记坏账）
    CodingMode：订阅结算的权重处理方式。
        "naive"    = 原稿（结算按新的权重，不检查）
        "recheck"  = 修订规则 A（校验 subUsed + (subHold - 本预留) + w <= SubLimit）
        "snapshot" = 修订规则 B（reserve 时快照权重，结算用快照，不重算）

  验证结论（见 README.md）：
    - WalletRecheck=FALSE            → NoOverdraft 反例
    - WalletRecheck=TRUE, naive      → NoOversell 反例
    - WalletRecheck=TRUE, recheck    → 全通过
    - WalletRecheck=TRUE, snapshot   → 全通过
*)
EXTENDS Integers, FiniteSets, TLC

CONSTANTS Users, Requests, MaxWallet, SubLimit,
          EstCosts, ActCosts, ActWeights, WalletRecheck, CodingMode

VARIABLES
  available,   (* user -> 可用余额 *)
  hold,        (* user -> 已冻结余额 *)
  spent,       (* user -> 累计真实消耗 *)
  subUsed,     (* user -> 订阅已结算次数 *)
  subHold,     (* user -> 订阅已冻结次数 *)
  owner,       (* request -> user *)
  pc,          (* request -> "idle" | "reserved" | "done" | "released" *)
  track,       (* request -> "wallet" | "coding" *)
  holdAmt,     (* request -> 冻结量（wallet=元，coding=次数） *)
  charged      (* request -> 是否已落 wallet 扣费（幂等标志） *)

vars == << available, hold, spent, subUsed, subHold,
          owner, pc, track, holdAmt, charged >>

TypeOK ==
  /\ available \in [Users -> -3..MaxWallet+3]
  /\ hold      \in [Users -> -3..MaxWallet+3]
  /\ spent     \in [Users -> 0..MaxWallet+3]
  /\ subUsed   \in [Users -> 0..SubLimit+2]
  /\ subHold   \in [Users -> 0..SubLimit+2]
  /\ owner     \in [Requests -> Users]
  /\ pc        \in [Requests -> {"idle","reserved","done","released"}]
  /\ track     \in [Requests -> {"wallet","coding"}]
  /\ holdAmt   \in [Requests -> 0..MaxWallet+2]
  /\ charged   \in [Requests -> BOOLEAN]

Init ==
  /\ available = [u \in Users |-> MaxWallet]
  /\ hold      = [u \in Users |-> 0]
  /\ spent     = [u \in Users |-> 0]
  /\ subUsed   = [u \in Users |-> 0]
  /\ subHold   = [u \in Users |-> 0]
  /\ \E f \in [Requests -> Users]: owner = f
  /\ pc        = [r \in Requests |-> "idle"]
  /\ track     = [r \in Requests |-> "wallet"]
  /\ holdAmt   = [r \in Requests |-> 0]
  /\ charged   = [r \in Requests |-> FALSE]

(* ── 预留：钱包轨 ── *)
ReserveWallet(u, r) ==
  /\ owner[r] = u
  /\ pc[r] = "idle"
  /\ \E e \in EstCosts:
       /\ available[u] >= e
       /\ available' = [available EXCEPT ![u] = @ - e]
       /\ hold'      = [hold EXCEPT ![u] = @ + e]
       /\ track'     = [track EXCEPT ![r] = "wallet"]
       /\ holdAmt'   = [holdAmt EXCEPT ![r] = e]
       /\ pc'        = [pc EXCEPT ![r] = "reserved"]
  /\ UNCHANGED << spent, subUsed, subHold, owner, charged >>

(* ── 预留：订阅轨 ── *)
ReserveCoding(u, r) ==
  /\ owner[r] = u
  /\ pc[r] = "idle"
  /\ \E w \in ActWeights:
       /\ subUsed[u] + subHold[u] + w <= SubLimit
       /\ subHold' = [subHold EXCEPT ![u] = @ + w]
       /\ track'   = [track EXCEPT ![r] = "coding"]
       /\ holdAmt' = [holdAmt EXCEPT ![r] = w]
       /\ pc'      = [pc EXCEPT ![r] = "reserved"]
  /\ UNCHANGED << available, hold, spent, subUsed, owner, charged >>

(* ── 结算：钱包轨（实际成本 a，可能 > 冻结 e） ── *)
FinalizeWallet(u, r) ==
  /\ owner[r] = u
  /\ pc[r] = "reserved" /\ track[r] = "wallet" /\ ~charged[r]
  /\ \E a \in ActCosts:
       /\ (WalletRecheck => available[u] + holdAmt[r] >= a)
       /\ hold'      = [hold EXCEPT ![u] = @ - holdAmt[r]]
       /\ available' = [available EXCEPT ![u] = @ - (a - holdAmt[r])]
       /\ spent'     = [spent EXCEPT ![u] = @ + a]
       /\ charged'   = [charged EXCEPT ![r] = TRUE]
       /\ pc'        = [pc EXCEPT ![r] = "done"]
  /\ UNCHANGED << subUsed, subHold, owner, track, holdAmt >>

(* ── 结算：订阅轨（实际权重 w，可能 > 冻结权重） ── *)
FinalizeCoding(u, r) ==
  /\ owner[r] = u
  /\ pc[r] = "reserved" /\ track[r] = "coding"
  /\ \E w \in ActWeights:
       /\ (CodingMode = "snapshot" => w = holdAmt[r])
       /\ (CodingMode = "recheck"  => subUsed[u] + subHold[u] - holdAmt[r] + w <= SubLimit)
       /\ subHold' = [subHold EXCEPT ![u] = @ - holdAmt[r]]
       /\ subUsed' = [subUsed EXCEPT ![u] = @ + w]
       /\ pc'      = [pc EXCEPT ![r] = "done"]
  /\ UNCHANGED << available, hold, spent, owner, track, holdAmt, charged >>

(* ── 释放（未结算的预留退还） ── *)
Release(u, r) ==
  /\ owner[r] = u
  /\ pc[r] = "reserved"
  /\ pc' = [pc EXCEPT ![r] = "released"]
  /\ UNCHANGED << spent, owner, track, holdAmt, charged >>
  /\ IF track[r] = "wallet"
     THEN /\ available' = [available EXCEPT ![u] = @ + holdAmt[r]]
          /\ hold'      = [hold EXCEPT ![u] = @ - holdAmt[r]]
          /\ UNCHANGED << subUsed, subHold >>
     ELSE /\ subHold' = [subHold EXCEPT ![u] = @ - holdAmt[r]]
          /\ UNCHANGED << available, hold, subUsed >>

Next ==
  \/ \E u \in Users, r \in Requests: ReserveWallet(u, r)
  \/ \E u \in Users, r \in Requests: ReserveCoding(u, r)
  \/ \E u \in Users, r \in Requests: FinalizeWallet(u, r)
  \/ \E u \in Users, r \in Requests: FinalizeCoding(u, r)
  \/ \E u \in Users, r \in Requests: Release(u, r)

Spec == Init /\ [][Next]_vars

(* ───────────────────────── 不变式 ───────────────────────── *)

NoOverdraft ==
  \A u \in Users: available[u] >= 0 /\ hold[u] >= 0

NoOversell ==
  \A u \in Users: subUsed[u] + subHold[u] <= SubLimit

HoldCoversReservation ==
  \A r \in Requests:
    (pc[r] = "reserved" /\ track[r] = "wallet") => hold[owner[r]] >= holdAmt[r]

SubHoldCoversReservation ==
  \A r \in Requests:
    (pc[r] = "reserved" /\ track[r] = "coding") => subHold[owner[r]] >= holdAmt[r]

Conservation ==
  \A u \in Users: available[u] + hold[u] + spent[u] = MaxWallet

ChargeIdempotent ==
  \A r \in Requests:
    (charged[r] => pc[r] = "done")
    /\ (pc[r] = "done" /\ track[r] = "wallet" => charged[r])
====
