-------------------------- MODULE Liveness ---------------------------
(*
  预留活性 · TTL 过期释放的必要性

  背景：按 TLA+ 反例 W1 提炼的修订规则「钱包结算前复核
        available + 本预留冻结额 >= 实际成本」——不足则不结算。
  但请求已经执行、实际成本已定：若复核不通过，该预留无法 finalize。

  真实世界的两条出口：
    - Release：请求方主动中止（客户端断开 / 上游报错）时退还。**不保证发生**：
      请求协程可能崩溃、连接静默丢失，Release 永远不被调用。
    - Expire：TTL 清理 worker 兜底释放。**这是唯一的无条件保证。**

  本模型把「中止」建成非确定环境动作 Abort（无公平性约束），从而验证：
    - ExpireEnabled=FALSE → 存在「已完成但复核不通过、且从未中止」的行为，
      该预留永久悬挂 → 活性性质不成立；
    - ExpireEnabled=TRUE  → 活性成立。

  与 Wallet.tla 的差异：
    - 实际成本在 reserve 时选定并固定（actCost），使「复核不通过」可达；
    - 增加 Tick / Abort / Expire 与弱公平性。
*)
EXTENDS Integers, FiniteSets, TLC

CONSTANTS Users, Requests, MaxWallet, TTL,
          EstCosts, ActCosts, WalletRecheck, ExpireEnabled

VARIABLES
  available, hold, spent, subUsed, subHold,
  owner, pc, track, holdAmt, actCost, age, charged, aborted

vars == << available, hold, spent, subUsed, subHold,
          owner, pc, track, holdAmt, actCost, age, charged, aborted >>

TypeOK ==
  /\ available \in [Users -> -2..MaxWallet+2]
  /\ hold      \in [Users -> -2..MaxWallet+2]
  /\ spent     \in [Users -> 0..MaxWallet+4]
  /\ subUsed   \in [Users -> 0..MaxWallet+4]
  /\ subHold   \in [Users -> 0..MaxWallet+4]
  /\ owner     \in [Requests -> Users]
  /\ pc        \in [Requests -> {"idle","reserved","done","released"}]
  /\ track     \in [Requests -> {"wallet","coding"}]
  /\ holdAmt   \in [Requests -> 0..MaxWallet+2]
  /\ actCost   \in [Requests -> 0..MaxWallet+2]
  /\ age       \in [Requests -> 0..TTL]
  /\ charged   \in [Requests -> BOOLEAN]
  /\ aborted   \in [Requests -> BOOLEAN]

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
  /\ actCost   = [r \in Requests |-> 0]
  /\ age       = [r \in Requests |-> 0]
  /\ charged   = [r \in Requests |-> FALSE]
  /\ aborted   = [r \in Requests |-> FALSE]

ReserveWallet(u, r) ==
  /\ owner[r] = u
  /\ pc[r] = "idle"
  /\ \E e \in EstCosts, a \in ActCosts:
       /\ available[u] >= e
       /\ available' = [available EXCEPT ![u] = @ - e]
       /\ hold'      = [hold EXCEPT ![u] = @ + e]
       /\ track'     = [track EXCEPT ![r] = "wallet"]
       /\ holdAmt'   = [holdAmt EXCEPT ![r] = e]
       /\ actCost'   = [actCost EXCEPT ![r] = a]
       /\ age'       = [age EXCEPT ![r] = 0]
       /\ pc'        = [pc EXCEPT ![r] = "reserved"]
  /\ UNCHANGED << spent, subUsed, subHold, owner, charged, aborted >>

ReserveCoding(u, r) ==
  /\ owner[r] = u
  /\ pc[r] = "idle"
  /\ \E w \in ActCosts:
       /\ subUsed[u] + subHold[u] + w <= MaxWallet
       /\ subHold' = [subHold EXCEPT ![u] = @ + w]
       /\ track'   = [track EXCEPT ![r] = "coding"]
       /\ holdAmt' = [holdAmt EXCEPT ![r] = w]
       /\ age'     = [age EXCEPT ![r] = 0]
       /\ pc'      = [pc EXCEPT ![r] = "reserved"]
  /\ UNCHANGED << available, hold, spent, subUsed, owner, actCost, charged, aborted >>

(* 钱包结算：复核不通过（实际 > available + 本预留冻结）时本动作不可使能 *)
FinalizeWallet(u, r) ==
  /\ owner[r] = u
  /\ pc[r] = "reserved" /\ track[r] = "wallet" /\ ~charged[r]
  /\ (WalletRecheck => available[u] + holdAmt[r] >= actCost[r])
  /\ hold'      = [hold EXCEPT ![u] = @ - holdAmt[r]]
  /\ available' = [available EXCEPT ![u] = @ - (actCost[r] - holdAmt[r])]
  /\ spent'     = [spent EXCEPT ![u] = @ + actCost[r]]
  /\ charged'   = [charged EXCEPT ![r] = TRUE]
  /\ pc'        = [pc EXCEPT ![r] = "done"]
  /\ UNCHANGED << subUsed, subHold, owner, track, holdAmt, actCost, age, aborted >>

FinalizeCoding(u, r) ==
  /\ owner[r] = u
  /\ pc[r] = "reserved" /\ track[r] = "coding"
  /\ subHold' = [subHold EXCEPT ![u] = @ - holdAmt[r]]
  /\ subUsed' = [subUsed EXCEPT ![u] = @ + holdAmt[r]]
  /\ pc'      = [pc EXCEPT ![r] = "done"]
  /\ UNCHANGED << available, hold, spent, owner, track, holdAmt, actCost, age, charged, aborted >>

(* 请求方主动中止：非确定环境动作，**不保证发生**（崩溃/静默断连） *)
Abort(u, r) ==
  /\ owner[r] = u
  /\ pc[r] = "reserved"
  /\ aborted' = [aborted EXCEPT ![r] = TRUE]
  /\ UNCHANGED << available, hold, spent, subUsed, subHold,
                  owner, pc, track, holdAmt, actCost, age, charged >>

(* 释放：仅当已中止 *)
Release(u, r) ==
  /\ owner[r] = u
  /\ pc[r] = "reserved" /\ aborted[r]
  /\ pc' = [pc EXCEPT ![r] = "released"]
  /\ UNCHANGED << spent, owner, track, holdAmt, actCost, charged, age, aborted >>
  /\ IF track[r] = "wallet"
     THEN /\ available' = [available EXCEPT ![u] = @ + holdAmt[r]]
          /\ hold'      = [hold EXCEPT ![u] = @ - holdAmt[r]]
          /\ UNCHANGED << subUsed, subHold >>
     ELSE /\ subHold' = [subHold EXCEPT ![u] = @ - holdAmt[r]]
          /\ UNCHANGED << available, hold, subUsed >>

Tick ==
  /\ age' = [r \in Requests |->
              IF pc[r] = "reserved" /\ age[r] < TTL THEN age[r] + 1 ELSE age[r]]
  /\ UNCHANGED << available, hold, spent, subUsed, subHold,
                  owner, pc, track, holdAmt, actCost, charged, aborted >>

(* TTL 到期释放：复核不通过且无人中止时的唯一兜底出口 *)
Expire(u, r) ==
  /\ ExpireEnabled
  /\ owner[r] = u
  /\ pc[r] = "reserved" /\ age[r] >= TTL
  /\ pc' = [pc EXCEPT ![r] = "released"]
  /\ UNCHANGED << spent, owner, track, holdAmt, actCost, charged, age, aborted >>
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
  \/ \E u \in Users, r \in Requests: Abort(u, r)
  \/ \E u \in Users, r \in Requests: Release(u, r)
  \/ \E u \in Users, r \in Requests: Expire(u, r)
  \/ Tick

(* 公平性：不约束 Abort（环境可永不中止）；约束 tick / finalize / release / expire *)
Fairness ==
  /\ WF_vars(Tick)
  /\ \A u \in Users, r \in Requests: WF_vars(FinalizeWallet(u, r))
  /\ \A u \in Users, r \in Requests: WF_vars(FinalizeCoding(u, r))
  /\ \A u \in Users, r \in Requests: WF_vars(Release(u, r))
  /\ \A u \in Users, r \in Requests: WF_vars(Expire(u, r))

Spec == Init /\ [][Next]_vars /\ Fairness

(* ── 安全不变式 ── *)
NoOverdraft ==
  \A u \in Users: available[u] >= 0 /\ hold[u] >= 0

Conservation ==
  \A u \in Users: available[u] + hold[u] + spent[u] = MaxWallet

(* ── 活性：每个预留最终都会被结算或释放（不允许永久悬挂） ── *)
ReservationsResolved ==
  \A r \in Requests: (pc[r] = "reserved") ~> (pc[r] \in {"done","released"})
====
