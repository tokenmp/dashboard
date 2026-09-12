--------------------------- MODULE Windows ---------------------------
(*
  四维时间窗 · 滚动语义与重置模型

  验证 coding 订阅的四个限额维度（滚动 5h / 自然周 / 周期 / 总量）：
    - 放行判定「各窗口已用 + 1 <= 限额」时是否可能超卖；
    - 「重置短期窗口」（user_plans.windows_reset_at）若越界清空历史，
      是否会连周期/总量一起清掉，从而被反复重置绕过总量上限。

  建模方式：用「事件槽 + 时间戳」而非事件集合——
    Slots    固定的请求槽集合（每个槽最多一次请求）
    evTime   槽 -> 发生时刻（MaxTime+1 表示未使用）
    t        当前时间
    resetAt  短期窗重置锚点（只影响 5h / 周）
    consumed 单调累计消耗（不受任何重置影响）

  ResetMode：
    "correct"  重置只前移 resetAt，evTime 不变（对齐迁移 000067 的设计）
    "buggy"    重置把全部槽标记为未使用（错误地连周期/总量一起清）

  不变式：
    WindowBounds        各窗口已用 <= 各自限额
    ConsumedWithinTotal consumed <= LT（单调，任何重置都不得放宽）
*)
EXTENDS Integers, FiniteSets, TLC

CONSTANTS Slots, R5, Wk, L5, LW, LC, LT, MaxTime, ResetMode

VARIABLES t, evTime, resetAt, consumed

vars == << t, evTime, resetAt, consumed >>

TypeOK ==
  /\ t        \in 0..MaxTime
  /\ evTime   \in [Slots -> 0..MaxTime+1]
  /\ resetAt  \in 0..MaxTime
  /\ consumed \in 0..MaxTime+1

UNUSED == MaxTime + 1

UsedSlots == {s \in Slots : evTime[s] # UNUSED}

R5Used    == Cardinality({s \in UsedSlots : evTime[s] <= t /\ evTime[s] >= t - R5 + 1 /\ evTime[s] >= resetAt})
WkUsed    == Cardinality({s \in UsedSlots : evTime[s] <= t /\ evTime[s] >= t - Wk + 1 /\ evTime[s] >= resetAt})
CycleUsed == Cardinality(UsedSlots)
TotalUsed == Cardinality(UsedSlots)

Init ==
  /\ t = 0
  /\ evTime = [s \in Slots |-> UNUSED]
  /\ resetAt = 0
  /\ consumed = 0

Tick ==
  /\ t < MaxTime
  /\ t' = t + 1
  /\ UNCHANGED << evTime, resetAt, consumed >>

Use ==
  /\ \E s \in Slots:
       /\ evTime[s] = UNUSED
       /\ R5Used + 1    <= L5
       /\ WkUsed + 1    <= LW
       /\ CycleUsed + 1 <= LC
       /\ TotalUsed + 1 <= LT
       /\ evTime' = [evTime EXCEPT ![s] = t]
       /\ consumed' = consumed + 1
  /\ UNCHANGED << t, resetAt >>

ResetShortWindow ==
  /\ resetAt' = t
  /\ consumed' = consumed
  /\ t' = t
  /\ IF ResetMode = "correct"
     THEN evTime' = evTime
     ELSE evTime' = [s \in Slots |-> UNUSED]

Next ==
  \/ Tick
  \/ Use
  \/ ResetShortWindow

Spec == Init /\ [][Next]_vars

WindowBounds ==
  /\ R5Used    <= L5
  /\ WkUsed    <= LW
  /\ CycleUsed <= LC
  /\ TotalUsed <= LT

(* 单调累计不受任何重置影响：这是「总量不可被重置绕过」的形式化表述 *)
ConsumedWithinTotal ==
  consumed <= LT
====
