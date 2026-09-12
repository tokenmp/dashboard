------------------------ MODULE QuotaDisplay -------------------------
(*
  剩余额度展示口径 vs 放行口径一致性

  背景（CONTEXT.md 记录的线上问题）：
    - executor 放行判定取四维窗口剩余的最小值：
        remaining = max(min(5h_rem, week_rem, cycle_rem, total_rem) - reserved, 0)
      （见 executor/internal/postgres/quota_capacity.go 的 coding_capacity）
    - dashboard 面板头条取 windows[0]（total 或 cycle/month），不是最小值
      （见 dashboard/app/service/QuotaService.php）。
    后果：某一短窗接近耗尽时，面板仍显示大额剩余，实测夸大 16～22 倍。

  本模型抽象三个窗口（滚动 5h / 滚动周 / 周期累计），验证：
    DisplayPolicy="cycle_first"（对齐面板现状）→ DisplayAccurate 反例；
    DisplayPolicy="min"        （对齐 executor）→ DisplayAccurate 成立。

  不变式：
    DisplayAccurate   展示"有剩余" 当且仅当 放行判定"有剩余"。
*)
EXTENDS Integers, FiniteSets, TLC

CONSTANTS Slots, W5, Wk, L5, LW, LC, MaxTime, DisplayPolicy

VARIABLES t, evTime

vars == << t, evTime >>

TypeOK ==
  /\ t      \in 0..MaxTime
  /\ evTime \in [Slots -> 0..MaxTime+1]

UNUSED == MaxTime + 1

UsedSlots == {s \in Slots : evTime[s] # UNUSED}

Used5 == Cardinality({s \in UsedSlots : evTime[s] <= t /\ evTime[s] >= t - W5 + 1})
UsedW == Cardinality({s \in UsedSlots : evTime[s] <= t /\ evTime[s] >= t - Wk + 1})
UsedC == Cardinality(UsedSlots)

Rem5 == L5 - Used5
RemW == LW - UsedW
RemC == LC - UsedC

Min3(a, b, c) == IF a <= b /\ a <= c THEN a ELSE IF b <= c THEN b ELSE c

(* executor 的真实放行判定 *)
MinRem == Min3(Rem5, RemW, RemC)

(* 面板展示：现状取 windows[0]（此处以 cycle 代表），修订取 min *)
Displayed == IF DisplayPolicy = "cycle_first" THEN RemC ELSE MinRem

Init ==
  /\ t = 0
  /\ evTime = [s \in Slots |-> UNUSED]

Tick ==
  /\ t < MaxTime
  /\ t' = t + 1
  /\ UNCHANGED evTime

Use ==
  /\ \E s \in Slots:
       /\ evTime[s] = UNUSED
       /\ MinRem >= 1                       (* executor 放行判定 *)
       /\ evTime' = [evTime EXCEPT ![s] = t]
  /\ UNCHANGED t

Next == Tick \/ Use
Spec == Init /\ [][Next]_vars

(* ── 不变式 ── *)

(* 放行判定本身永不超过各窗口限额 *)
WindowSound == Used5 <= L5 /\ UsedW <= LW /\ UsedC <= LC

(* 展示"还有额度" 必须与 放行"还能请求" 等价 *)
DisplayAccurate == (Displayed > 0) <=> (MinRem > 0)
====
