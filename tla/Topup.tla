--------------------------- MODULE Topup ---------------------------
(*
  充值/订单 · 资金安全与幂等模型（抽象）

  验证设计中的充值链路：
    下单 → 支付回调 → 入账（本金+赠送） → 消费 → 退款
  在「支付网关至少一次投递（回调重复）」与「先消费后退款」下，不会出现：
    - 余额为负
    - 同一订单重复入账（重复回调多送钱）
    - 资金不守恒
    - 未入账即退款

  抽象说明：
    - 单用户；金额用整数最小单位。
    - 网关回调可能重复到达：DupPayCallback / DupRefundCallback 让已终态的
      订单再次收到回调，设计上应为「幂等空操作」。
    - SafeRefund 开关：
        FALSE = 设计原稿（退款不检查余额）
        TRUE  = 修订规则（仅退未消费部分：avail >= OrderAmount 才允许）
*)
EXTENDS Integers, FiniteSets, TLC

CONSTANTS Orders, OrderAmount, SafeRefund

VARIABLES
  avail,        (* 可用余额（单用户） *)
  ordStatus,    (* order -> "none" | "pending" | "paid" | "refunded" *)
  creditCount,  (* order -> 已入账次数（幂等标志） *)
  creditTotal,  (* 累计入账（本金+赠送，简化为 OrderAmount） *)
  refundTotal,  (* 累计退款 *)
  spent         (* 累计消费 *)

vars == << avail, ordStatus, creditCount, creditTotal, refundTotal, spent >>

TypeOK ==
  /\ avail       \in -4..4*OrderAmount+4
  /\ ordStatus   \in [Orders -> {"none","pending","paid","refunded"}]
  /\ creditCount \in [Orders -> 0..1]
  /\ creditTotal \in 0..Cardinality(Orders)*OrderAmount
  /\ refundTotal \in 0..Cardinality(Orders)*OrderAmount
  /\ spent       \in 0..Cardinality(Orders)*OrderAmount

Init ==
  /\ avail       = 0
  /\ ordStatus   = [o \in Orders |-> "none"]
  /\ creditCount = [o \in Orders |-> 0]
  /\ creditTotal = 0
  /\ refundTotal = 0
  /\ spent       = 0

CreateOrder(o) ==
  /\ ordStatus[o] = "none"
  /\ ordStatus' = [ordStatus EXCEPT ![o] = "pending"]
  /\ UNCHANGED << avail, creditCount, creditTotal, refundTotal, spent >>

PayOrder(o) ==
  /\ ordStatus[o] = "pending"
  /\ ordStatus' = [ordStatus EXCEPT ![o] = "paid"]
  /\ UNCHANGED << avail, creditCount, creditTotal, refundTotal, spent >>

(* 入账：必须 paid 且未入账过；重复调用因 creditCount=1 而不可使能 *)
CreditOrder(o) ==
  /\ ordStatus[o] = "paid" /\ creditCount[o] = 0
  /\ creditCount' = [creditCount EXCEPT ![o] = 1]
  /\ creditTotal' = creditTotal + OrderAmount
  /\ avail'       = avail + OrderAmount
  /\ UNCHANGED << ordStatus, refundTotal, spent >>

(* 退款：修订规则要求余额足以覆盖（只退未消费部分） *)
RefundOrder(o) ==
  /\ ordStatus[o] = "paid" /\ creditCount[o] = 1
  /\ (SafeRefund => avail >= OrderAmount)
  /\ ordStatus'   = [ordStatus EXCEPT ![o] = "refunded"]
  /\ refundTotal' = refundTotal + OrderAmount
  /\ avail'       = avail - OrderAmount
  /\ UNCHANGED << creditCount, creditTotal, spent >>

Spend(amt) ==
  /\ amt \in 1..avail
  /\ avail' = avail - amt
  /\ spent' = spent + amt
  /\ UNCHANGED << ordStatus, creditCount, creditTotal, refundTotal >>

(* 重复支付回调：设计上应为幂等空操作 *)
DupPayCallback(o) ==
  /\ ordStatus[o] = "paid"
  /\ UNCHANGED vars

(* 重复退款回调：幂等空操作 *)
DupRefundCallback(o) ==
  /\ ordStatus[o] = "refunded"
  /\ UNCHANGED vars

Next ==
  \/ \E o \in Orders: CreateOrder(o)
  \/ \E o \in Orders: PayOrder(o)
  \/ \E o \in Orders: CreditOrder(o)
  \/ \E o \in Orders: RefundOrder(o)
  \/ \E amt \in 1..4: Spend(amt)
  \/ \E o \in Orders: DupPayCallback(o)
  \/ \E o \in Orders: DupRefundCallback(o)

Spec == Init /\ [][Next]_vars

(* ───────────────────────── 不变式 ───────────────────────── *)

NoNegativeBalance ==
  avail >= 0

CreditAtMostOnce ==
  \A o \in Orders: creditCount[o] <= 1

Conservation ==
  avail + spent = creditTotal - refundTotal

RefundImpliesCredited ==
  \A o \in Orders: ordStatus[o] = "refunded" => creditCount[o] = 1

CreditedImpliesPaid ==
  \A o \in Orders: creditCount[o] = 1 => ordStatus[o] \in {"paid", "refunded"}
====
