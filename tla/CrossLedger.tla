------------------------- MODULE CrossLedger -------------------------
(*
  跨账本原子性 · 消费者扣款 vs 供应商入账

  背景（executor/internal/postgres/logging.go）：
    请求完成路径分三次独立写：
      1. billing.Service.Finalize → FinalizeReservation → usage_ledger(charge)   （消费者扣）
      2. UpdateRequestLog → 写 request_logs 终态
      3. FinalizeMarketplaceSettlement → marketplace_request_settlements + ledger （供应商入）
    三者不在同一事务。若 1 成功而 3 失败（含进程崩溃），消费者已被扣、
    供应商未入账 —— 全局资金守恒仍成立（钱卡在平台 holding），但**分账错位**。

  本模型验证：
    LedgerPairing      每笔请求「消费者已扣」与「供应商已入」必须同真同假
    GlobalConservation consumerOut = supplierIn + platform + holding

  开关 AtomicMode：
    "atomic"   = 单事务：扣款与入账一次完成（设计目标）
    "separate" = 分两次写（现状），中间态可观测到错位

  另含 Reconcile 动作，用于展示「对账补偿」能在 eventual 层面修复，
  但**安全性（中间态）已经破坏** —— 单事务才是根治。
*)
EXTENDS Integers, FiniteSets, TLC

CONSTANTS Requests, Amount, Reward, AtomicMode

VARIABLES
  cCharged,   (* request -> 消费者是否已扣 *)
  sCredited,  (* request -> 供应商是否已入账 *)
  consumerOut,(* 消费者累计扣款 *)
  supplierIn, (* 供应商累计入账 *)
  platform,   (* 平台累计手续费 *)
  holding     (* 已扣未入账的中间态金额 *)

vars == << cCharged, sCredited, consumerOut, supplierIn, platform, holding >>

Charge == Amount
Fee == Amount - Reward

TypeOK ==
  /\ cCharged    \in [Requests -> BOOLEAN]
  /\ sCredited   \in [Requests -> BOOLEAN]
  /\ consumerOut \in 0..Cardinality(Requests)*Amount
  /\ supplierIn  \in 0..Cardinality(Requests)*Reward
  /\ platform    \in 0..Cardinality(Requests)*Fee
  /\ holding     \in 0..Cardinality(Requests)*Amount

Init ==
  /\ cCharged    = [r \in Requests |-> FALSE]
  /\ sCredited   = [r \in Requests |-> FALSE]
  /\ consumerOut = 0
  /\ supplierIn  = 0
  /\ platform    = 0
  /\ holding     = 0

(* 单事务：扣款与入账一次完成 *)
AtomicFinalize(r) ==
  /\ AtomicMode = "atomic"
  /\ ~cCharged[r] /\ ~sCredited[r]
  /\ cCharged'    = [cCharged EXCEPT ![r] = TRUE]
  /\ sCredited'   = [sCredited EXCEPT ![r] = TRUE]
  /\ consumerOut' = consumerOut + Charge
  /\ supplierIn'  = supplierIn + Reward
  /\ platform'    = platform + Fee
  /\ UNCHANGED holding

(* 分步写：先扣款 *)
ChargeConsumer(r) ==
  /\ AtomicMode = "separate"
  /\ ~cCharged[r]
  /\ cCharged'    = [cCharged EXCEPT ![r] = TRUE]
  /\ consumerOut' = consumerOut + Charge
  /\ holding'     = holding + Charge
  /\ UNCHANGED << sCredited, supplierIn, platform >>

(* 分步写：后入账（可因失败/崩溃而缺席） *)
CreditSupplier(r) ==
  /\ AtomicMode = "separate"
  /\ cCharged[r] /\ ~sCredited[r]
  /\ sCredited'  = [sCredited EXCEPT ![r] = TRUE]
  /\ supplierIn' = supplierIn + Reward
  /\ platform'   = platform + Fee
  /\ holding'    = holding - Charge
  /\ UNCHANGED << cCharged, consumerOut >>

(* 对账补偿：把卡在 holding 的请求补入账（eventual 修复，不修复中间态） *)
Reconcile(r) ==
  /\ AtomicMode = "separate"
  /\ cCharged[r] /\ ~sCredited[r]
  /\ sCredited'  = [sCredited EXCEPT ![r] = TRUE]
  /\ supplierIn' = supplierIn + Reward
  /\ platform'   = platform + Fee
  /\ holding'    = holding - Charge
  /\ UNCHANGED << cCharged, consumerOut >>

Next ==
  \/ \E r \in Requests: AtomicFinalize(r)
  \/ \E r \in Requests: ChargeConsumer(r)
  \/ \E r \in Requests: CreditSupplier(r)
  \/ \E r \in Requests: Reconcile(r)

(* 对账补偿带弱公平性时的活性用 *)
Fairness == \A r \in Requests: WF_vars(Reconcile(r))
Spec == Init /\ [][Next]_vars
LiveSpec == Init /\ [][Next]_vars /\ Fairness

(* ───────────────────────── 不变式 ───────────────────────── *)

LedgerPairing ==
  \A r \in Requests: cCharged[r] = sCredited[r]

GlobalConservation ==
  consumerOut = supplierIn + platform + holding

HoldingNonNegative ==
  holding >= 0

(* 对账活性：卡住的请求最终会被补入账（但这是 eventual，不是安全） *)
ReconcileEventually ==
  \A r \in Requests: (cCharged[r] /\ ~sCredited[r]) ~> sCredited[r]
====
