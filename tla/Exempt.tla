--------------------------- MODULE Exempt ---------------------------
(*
  免扣路径 · 免费全局模型 / 用户自有免扣 Key 的释放语义

  背景（billing/service.go 的 MarkFree / MarkUserKeyFree）：
    成功 attempt 命中 free_global 模型或用户自有 free key 时，请求不计费：
    释放未结算的预留，并把 log 标记为免费来源。已是免费 / 已结算则跳过。

  危险点：
    - 标记免费却忘记释放预留 → 冻结永久泄漏（hold 不归零）；
    - 已结算（finalize）后再标记免费并退款 → 双重退款 / 资金凭空增加；
    - 同一请求既 finalize 又 markFree。

  开关 ExemptMode：
    "safe" = 标记免费前必须未结算且预留已冻结，且必须释放（设计）
    "leak" = 标记免费但不释放预留（冻结泄漏）
    "late" = 允许对已结算请求标记免费并退款（双重退款）

  不变式：
    Conservation     available + hold + spent = MaxWallet
    FreeNotFrozen    标记自由的请求不得仍持有冻结
    FrozenOnlyReserved  只有 reserved 请求才能持有冻结
    NoChargeWhenFree 免费请求不得有扣费
*)
EXTENDS Integers, FiniteSets, TLC

CONSTANTS Users, Requests, MaxWallet, EstCosts, ExemptMode

VARIABLES
  available, hold, spent,
  owner, pc, amt, frozen, charged

vars == << available, hold, spent, owner, pc, amt, frozen, charged >>

TypeOK ==
  /\ available \in [Users -> -2..MaxWallet+2]
  /\ hold      \in [Users -> -2..MaxWallet+2]
  /\ spent     \in [Users -> 0..MaxWallet+2]
  /\ owner     \in [Requests -> Users]
  /\ pc        \in [Requests -> {"idle","reserved","done","free","released"}]
  /\ amt       \in [Requests -> 0..MaxWallet+2]
  /\ frozen    \in [Requests -> BOOLEAN]
  /\ charged   \in [Requests -> BOOLEAN]

Init ==
  /\ available = [u \in Users |-> MaxWallet]
  /\ hold      = [u \in Users |-> 0]
  /\ spent     = [u \in Users |-> 0]
  /\ \E f \in [Requests -> Users]: owner = f
  /\ pc        = [r \in Requests |-> "idle"]
  /\ amt       = [r \in Requests |-> 0]
  /\ frozen    = [r \in Requests |-> FALSE]
  /\ charged   = [r \in Requests |-> FALSE]

Reserve(u, r) ==
  /\ owner[r] = u
  /\ pc[r] = "idle"
  /\ \E e \in EstCosts:
       /\ available[u] >= e
       /\ available' = [available EXCEPT ![u] = @ - e]
       /\ hold'      = [hold EXCEPT ![u] = @ + e]
       /\ amt'       = [amt EXCEPT ![r] = e]
       /\ frozen'    = [frozen EXCEPT ![r] = TRUE]
       /\ pc'        = [pc EXCEPT ![r] = "reserved"]
  /\ UNCHANGED << spent, owner, charged >>

(* 正常结算：从冻结转为已耗（实际=预留快照，简化） *)
Finalize(u, r) ==
  /\ owner[r] = u
  /\ pc[r] = "reserved" /\ frozen[r]
  /\ hold'    = [hold EXCEPT ![u] = @ - amt[r]]
  /\ frozen'  = [frozen EXCEPT ![r] = FALSE]
  /\ spent'   = [spent EXCEPT ![u] = @ + amt[r]]
  /\ charged' = [charged EXCEPT ![r] = TRUE]
  /\ pc'      = [pc EXCEPT ![r] = "done"]
  /\ UNCHANGED << available, owner, amt >>

Release(u, r) ==
  /\ owner[r] = u
  /\ pc[r] = "reserved" /\ frozen[r]
  /\ available' = [available EXCEPT ![u] = @ + amt[r]]
  /\ hold'      = [hold EXCEPT ![u] = @ - amt[r]]
  /\ frozen'    = [frozen EXCEPT ![r] = FALSE]
  /\ pc'        = [pc EXCEPT ![r] = "released"]
  /\ UNCHANGED << spent, owner, amt, charged >>

(* 安全：未结算 + 已冻结 → 释放并标记免费 *)
MarkFreeSafe(u, r) ==
  /\ ExemptMode = "safe"
  /\ owner[r] = u
  /\ pc[r] = "reserved" /\ frozen[r] /\ ~charged[r]
  /\ available' = [available EXCEPT ![u] = @ + amt[r]]
  /\ hold'      = [hold EXCEPT ![u] = @ - amt[r]]
  /\ frozen'    = [frozen EXCEPT ![r] = FALSE]
  /\ pc'        = [pc EXCEPT ![r] = "free"]
  /\ UNCHANGED << spent, owner, amt, charged >>

(* 故障：标记免费但不释放 → 冻结泄漏 *)
MarkFreeLeak(u, r) ==
  /\ ExemptMode = "leak"
  /\ owner[r] = u
  /\ pc[r] = "reserved" /\ frozen[r]
  /\ pc' = [pc EXCEPT ![r] = "free"]
  /\ UNCHANGED << available, hold, spent, owner, amt, frozen, charged >>

(* 故障：已结算后标记免费并退款 → 双重退款 / 资金凭空增加 *)
MarkFreeLate(u, r) ==
  /\ ExemptMode = "late"
  /\ owner[r] = u
  /\ pc[r] = "done" /\ ~frozen[r] /\ charged[r]
  /\ available' = [available EXCEPT ![u] = @ + amt[r]]
  /\ pc'        = [pc EXCEPT ![r] = "free"]
  /\ UNCHANGED << hold, spent, owner, amt, frozen, charged >>

Next ==
  \/ \E u \in Users, r \in Requests: Reserve(u, r)
  \/ \E u \in Users, r \in Requests: Finalize(u, r)
  \/ \E u \in Users, r \in Requests: Release(u, r)
  \/ \E u \in Users, r \in Requests: MarkFreeSafe(u, r)
  \/ \E u \in Users, r \in Requests: MarkFreeLeak(u, r)
  \/ \E u \in Users, r \in Requests: MarkFreeLate(u, r)

Spec == Init /\ [][Next]_vars

(* ───────────────────────── 不变式 ───────────────────────── *)

Conservation ==
  \A u \in Users: available[u] + hold[u] + spent[u] = MaxWallet

FreeNotFrozen ==
  \A r \in Requests: pc[r] = "free" => ~frozen[r]

FrozenOnlyReserved ==
  \A r \in Requests: frozen[r] => pc[r] = "reserved"

NoChargeWhenFree ==
  \A r \in Requests: pc[r] = "free" => ~charged[r]
====
