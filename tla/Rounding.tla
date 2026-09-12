--------------------------- MODULE Rounding ---------------------------
(*
  金额舍入 · 预留与结算的取整方向安全

  背景：金额精度 NUMERIC(18,8)（元），token 单价 NUMERIC(18,10)，
        coding 请求数 NUMERIC(12,4)。每次扣费 = tokens × 单价，乘积可能需要
        取整。预留（预估）与结算（实际）各自取整时，方向不一致会出问题。

  本模型用整数「最小单位」抽象（1 单位 = 1e-8 元），每笔请求的精确成本
  可能不是整数单位，故需取整。

  两个独立开关：
    ReserveRound  ∈ {"up","down"}   预留冻结时的取整方向
    FinalizeRound ∈ {"up","down"}   结算扣费时的取整方向
    Recheck                         结算前是否复核可用额足够（见 Wallet.tla）

  不变式：
    NoOverdraft       balance >= 0 / frozen >= 0
    NoUndercharge     结算扣费不得低于精确成本（取整向下 = 收入漏洞）
    DriftBound        |已扣 - 精确| <= N × (单位-1)（舍入漂移有界）
    Conservation      balance + frozen + spent = MaxWallet
*)
EXTENDS Integers, FiniteSets, TLC

CONSTANTS Requests, Unit, Costs, MaxWallet, ReserveRound, FinalizeRound, Recheck

VARIABLES
  balance, frozen, spent, exactSpent,
  pc, freezed, exact, chargeAmt

vars == << balance, frozen, spent, exactSpent, pc, freezed, exact, chargeAmt >>

RoundUp(e)   == ((e + Unit - 1) \div Unit) * Unit
RoundDown(e) == (e \div Unit) * Unit
Round(e, mode) == IF mode = "up" THEN RoundUp(e) ELSE RoundDown(e)

TypeOK ==
  /\ balance    \in -4*Unit..MaxWallet+4*Unit
  /\ frozen     \in -4*Unit..MaxWallet+4*Unit
  /\ spent      \in 0..4*Unit
  /\ exactSpent \in 0..4*Unit
  /\ pc         \in [Requests -> {"idle","reserved","done","released"}]
  /\ freezed    \in [Requests -> 0..4*Unit]
  /\ exact      \in [Requests -> 0..4*Unit]
  /\ chargeAmt  \in [Requests -> 0..4*Unit]

Init ==
  /\ balance = MaxWallet
  /\ frozen = 0
  /\ spent = 0
  /\ exactSpent = 0
  /\ pc = [r \in Requests |-> "idle"]
  /\ freezed = [r \in Requests |-> 0]
  /\ exact = [r \in Requests |-> 0]
  /\ chargeAmt = [r \in Requests |-> 0]

Reserve(r) ==
  /\ pc[r] = "idle"
  /\ \E e \in Costs:
       LET fr == Round(e, ReserveRound) IN
       /\ balance >= fr
       /\ balance' = balance - fr
       /\ frozen'  = frozen + fr
       /\ freezed' = [freezed EXCEPT ![r] = fr]
       /\ exact'   = [exact EXCEPT ![r] = e]
       /\ pc'      = [pc EXCEPT ![r] = "reserved"]
  /\ UNCHANGED << spent, exactSpent, chargeAmt >>

Finalize(r) ==
  /\ pc[r] = "reserved"
  /\ LET ch == Round(exact[r], FinalizeRound) IN
     /\ (Recheck => balance + freezed[r] >= ch)
     /\ balance'    = balance - (ch - freezed[r])
     /\ frozen'     = frozen - freezed[r]
     /\ spent'      = spent + ch
     /\ exactSpent' = exactSpent + exact[r]
     /\ chargeAmt'  = [chargeAmt EXCEPT ![r] = ch]
     /\ pc'         = [pc EXCEPT ![r] = "done"]
  /\ UNCHANGED << freezed, exact >>

Release(r) ==
  /\ pc[r] = "reserved"
  /\ balance' = balance + freezed[r]
  /\ frozen'  = frozen - freezed[r]
  /\ pc'      = [pc EXCEPT ![r] = "released"]
  /\ UNCHANGED << spent, exactSpent, freezed, exact, chargeAmt >>

Next ==
  \/ \E r \in Requests: Reserve(r)
  \/ \E r \in Requests: Finalize(r)
  \/ \E r \in Requests: Release(r)

Spec == Init /\ [][Next]_vars

(* ───────────────────────── 不变式 ───────────────────────── *)

NoOverdraft ==
  balance >= 0 /\ frozen >= 0

(* 结算不得低于精确成本：取整向下会漏收 *)
NoUndercharge ==
  \A r \in Requests: pc[r] = "done" => chargeAmt[r] >= exact[r]

(* 舍入漂移有界：每个请求至多差 1 个最小单位 *)
DriftBound ==
  /\ spent - exactSpent <= Cardinality(Requests) * (Unit - 1)
  /\ exactSpent - spent <= Cardinality(Requests) * (Unit - 1)

Conservation ==
  balance + frozen + spent = MaxWallet
====
