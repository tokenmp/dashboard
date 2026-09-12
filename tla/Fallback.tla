-------------------------- MODULE Fallback --------------------------
(*
  双轨候选回退 · 原子性模型（评审 P5）

  场景：用户主轨配额不足时，executor 按 Candidates 依次尝试
        coding → wallet / wallet → coding / image → wallet → coding。
  设计假设：每次候选尝试是「单事务原子」的——要么完全预留，要么完全不留痕。

  本模型验证：一旦某个候选尝试「先扣减、后失败」，回退到下一个候选就会
  造成重复扣减 / 资金泄漏；从而证明「单事务原子」是承载性假设，不可省。

  FailMode：
    "atomic" = 失败尝试不留痕（设计假设）
    "leaky"  = 失败尝试仍扣减（把金额记入 lost，模拟未回滚的部分失败）

  不变式：
    NoDoubleAttempt  每个请求最多成功扣减一次
    NoLeak           lost = 0（没有任何金额掉进未回滚的尝试里）
    Conservation      available + hold + lost = MaxWallet
*)
EXTENDS Integers, FiniteSets, TLC

CONSTANTS Users, Requests, MaxWallet, EstCosts, FailMode

VARIABLES
  available,  (* user -> 可用余额 *)
  hold,       (* user -> 已冻结余额（成功预留） *)
  lost,       (* user -> 未回滚的泄漏金额 *)
  owner,      (* request -> user *)
  pc,         (* request -> "idle" | "reserved" | "rejected" *)
  attempts    (* request -> 成功扣减次数 *)

vars == << available, hold, lost, owner, pc, attempts >>

TypeOK ==
  /\ available \in [Users -> -2..MaxWallet+2]
  /\ hold      \in [Users -> -2..MaxWallet+2]
  /\ lost      \in [Users -> 0..MaxWallet+2]
  /\ owner     \in [Requests -> Users]
  /\ pc        \in [Requests -> {"idle","reserved","rejected"}]
  /\ attempts  \in [Requests -> 0..2]

Init ==
  /\ available = [u \in Users |-> MaxWallet]
  /\ hold      = [u \in Users |-> 0]
  /\ lost      = [u \in Users |-> 0]
  /\ \E f \in [Requests -> Users]: owner = f
  /\ pc        = [r \in Requests |-> "idle"]
  /\ attempts  = [r \in Requests |-> 0]

(* 候选成功：扣减并置为 reserved *)
AttemptSuccess(u, r) ==
  /\ owner[r] = u
  /\ pc[r] = "idle"
  /\ \E e \in EstCosts:
       /\ available[u] >= e
       /\ available' = [available EXCEPT ![u] = @ - e]
       /\ hold'      = [hold EXCEPT ![u] = @ + e]
       /\ pc'        = [pc EXCEPT ![r] = "reserved"]
       /\ attempts'  = [attempts EXCEPT ![r] = @ + 1]
  /\ UNCHANGED << lost, owner >>

(* 候选失败：atomic 不留痕；leaky 仍扣减并记入 lost *)
AttemptFail(u, r) ==
  /\ owner[r] = u
  /\ pc[r] = "idle"
  /\ \E e \in EstCosts:
       /\ available[u] >= e
       /\ IF FailMode = "atomic"
          THEN UNCHANGED << available, hold, lost, attempts >>
          ELSE /\ available' = [available EXCEPT ![u] = @ - e]
               /\ lost'      = [lost EXCEPT ![u] = @ + e]
               /\ attempts'  = [attempts EXCEPT ![r] = @ + 1]
               /\ UNCHANGED hold
  /\ UNCHANGED << owner, pc >>

Reject(u, r) ==
  /\ owner[r] = u
  /\ pc[r] = "idle"
  /\ pc' = [pc EXCEPT ![r] = "rejected"]
  /\ UNCHANGED << available, hold, lost, owner, attempts >>

Next ==
  \/ \E u \in Users, r \in Requests: AttemptSuccess(u, r)
  \/ \E u \in Users, r \in Requests: AttemptFail(u, r)
  \/ \E u \in Users, r \in Requests: Reject(u, r)

Spec == Init /\ [][Next]_vars

NoDoubleAttempt ==
  \A r \in Requests: attempts[r] <= 1

NoLeak ==
  \A u \in Users: lost[u] = 0

Conservation ==
  \A u \in Users: available[u] + hold[u] + lost[u] = MaxWallet
====
