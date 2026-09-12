----------------------- MODULE WindowModels -----------------------
(*
  coding 四维窗口的两种候选语义对比

  背景：dashboard QuotaService 注释称「执行器目前仍按『周期套住周/5h』的旧模型放行」，
        但 executor quota_capacity.go 实际取四维窗口剩余的最小值（独立窗口）。
        两种语义都安全，但**用户可见容量不同**，必须先定义清楚再实现。

  两种语义（区别只在短窗下界是否再被当前周期起点夹住）：
    independent（独立窗口）：
        短窗下界 = max(activated_at, windows_reset_at)
    nested（周期套住短窗）：
        短窗下界 = max(activated_at, windows_reset_at, cycle_window_start)
        即周期翻滚时，5h/周窗的历史随之清空。

  两者的周期窗都是 [cycle_window_start, now]；剩余都取三维最小值。

  验证：
    SafeChosen        当前语义下各窗已用 <= 限额（放行判定安全）
    NestedDominates   nested 容量 >= independent 容量（nested 更宽松）
    SameCapacity      两者相等——预期被反驳，证明语义切换会改变用户可见容量
*)
EXTENDS Integers, FiniteSets, TLC

CONSTANTS Slots, W5, Wk, L5, LW, LC, MaxTime, Semantics

VARIABLES t, evTime, cycleStart, resetAt

vars == << t, evTime, cycleStart, resetAt >>

TypeOK ==
  /\ t          \in 0..MaxTime
  /\ evTime     \in [Slots -> 0..MaxTime+1]
  /\ cycleStart \in 0..MaxTime
  /\ resetAt    \in 0..MaxTime

UNUSED == MaxTime + 1
UsedSlots == {s \in Slots : evTime[s] # UNUSED}

(* 独立窗口：短窗只受 activated_at(=0) 与 resetAt 约束 *)
Used5i  == Cardinality({s \in UsedSlots :
              evTime[s] <= t /\ evTime[s] >= t - W5 + 1 /\ evTime[s] >= resetAt})
UsedWki == Cardinality({s \in UsedSlots :
              evTime[s] <= t /\ evTime[s] >= t - Wk + 1 /\ evTime[s] >= resetAt})

(* 周期套住：短窗下界再与 cycleStart 取大 *)
Used5n  == Cardinality({s \in UsedSlots :
              evTime[s] <= t /\ evTime[s] >= t - W5 + 1 /\ evTime[s] >= resetAt
              /\ evTime[s] >= cycleStart})
UsedWkn == Cardinality({s \in UsedSlots :
              evTime[s] <= t /\ evTime[s] >= t - Wk + 1 /\ evTime[s] >= resetAt
              /\ evTime[s] >= cycleStart})

(* 周期窗两者相同：[cycleStart, now] *)
UsedC == Cardinality({s \in UsedSlots : evTime[s] >= cycleStart})

Min3(a, b, c) == IF a <= b /\ a <= c THEN a ELSE IF b <= c THEN b ELSE c

RemI == Min3(L5 - Used5i, LW - UsedWki, LC - UsedC)
RemN == Min3(L5 - Used5n, LW - UsedWkn, LC - UsedC)
ChosenRem == IF Semantics = "independent" THEN RemI ELSE RemN

Init ==
  /\ t = 0
  /\ evTime = [s \in Slots |-> UNUSED]
  /\ cycleStart = 0
  /\ resetAt = 0

Tick ==
  /\ t < MaxTime
  /\ t' = t + 1
  /\ UNCHANGED << evTime, cycleStart, resetAt >>

Use ==
  /\ \E s \in Slots:
       /\ evTime[s] = UNUSED
       /\ ChosenRem >= 1
       /\ evTime' = [evTime EXCEPT ![s] = t]
  /\ UNCHANGED << t, cycleStart, resetAt >>

RollCycle ==
  /\ cycleStart' = t
  /\ UNCHANGED << t, evTime, resetAt >>

ResetShortWindow ==
  /\ resetAt' = t
  /\ UNCHANGED << t, evTime, cycleStart >>

Next == Tick \/ Use \/ RollCycle \/ ResetShortWindow
Spec == Init /\ [][Next]_vars

SafeChosen ==
  IF Semantics = "independent"
  THEN Used5i <= L5 /\ UsedWki <= LW /\ UsedC <= LC
  ELSE Used5n <= L5 /\ UsedWkn <= LW /\ UsedC <= LC

(* nested 的窗口下界更晚（或相等）→ 计数更少 → 剩余更多 *)
NestedDominates == RemN >= RemI

(* 预期被反驳：证明两种语义的用户可见容量不同 *)
SameCapacity == RemN = RemI
====
