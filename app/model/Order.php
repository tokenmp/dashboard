<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * orders —— 充值/购套餐单据
 *
 * 资金进入平台的入口单据。`kind='topup'` 为余额充值，`kind='plan'` 为购买套餐。
 * 兑换码走 `kind='topup', method='redeem', status='paid'`；后台手工入账走 `method='manual'`。
 * 支付网关接入前 status 直接落 paid（设计文档 §7.2），接入后由支付回调推进：
 * `pending → paid → refunded`（或 cancelled / expired）。重复回调以 `idempotency_key` 唯一约束兜底。
 *
 * @property string      $id               订单主键
 * @property string      $order_no         对外单号，全局唯一
 * @property string      $user_id          下单用户
 * @property string      $kind             订单类型：topup（充值）/ plan（购套餐）
 * @property string      $amount_cny       应付金额（元）
 * @property string      $bonus_cny        赠送额度（元），默认 0
 * @property string|null $plan_id          kind=plan 时的套餐 ID
 * @property string|null $redeem_code_id   兑换码来源（kind=topup 且 method=redeem）
 * @property string|null $method           支付渠道：alipay / wechat / manual / redeem
 * @property string      $status           订单状态：pending / paid / cancelled / refunded / expired
 * @property string|null $idempotency_key  幂等键，全局唯一
 * @property array       $metadata         扩展信息，默认空对象
 * @property string      $created_at       创建时间
 * @property string|null $paid_at          支付完成时间
 * @property string|null $expires_at       应付款截止时间
 *
 * @mixin \think\Model
 */
class Order extends Model
{
    // 数据表（表名为复数，与默认蛇形命名不同，需显式指定）
    protected $table = 'orders';

    // 主键（uuid DEFAULT gen_random_uuid）
    protected $pk = 'id';

    // 使用 pgsql 连接（见 config/database.php 中 'pgsql' 配置）
    protected $connection = 'pgsql';

    // 自动时间戳（本表只有 created_at，无 updated_at）
    protected $autoWriteTimestamp = 'datetime';
    protected $createTime = 'created_at';
    protected $updateTime = false;

    // 字段类型转换（金额 NUMERIC 保留字符串避免精度丢失）
    protected $type = [
        'id' => 'string',
        'user_id' => 'string',
        'plan_id' => 'string',
        'redeem_code_id' => 'string',
        'metadata' => 'json',
        'created_at' => 'datetime',
        'paid_at' => 'datetime',
        'expires_at' => 'datetime',
    ];

    // ==================== 关联关系 ====================

    /** 所属 User（外键 orders.user_id） @return \think\model\relation\BelongsTo */
    public function user(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id', 'id');
    }

    /** 所属 Plan（外键 orders.plan_id） @return \think\model\relation\BelongsTo */
    public function plan(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(Plan::class, 'plan_id', 'id');
    }

    /** 拥有多条 WalletLedger（外键 wallet_ledger.order_id） @return \think\model\relation\HasMany */
    public function walletLedgers(): \think\model\relation\HasMany
    {
        return $this->hasMany(WalletLedger::class, 'order_id', 'id');
    }

    /** 拥有多条 PaymentTransaction（外键 payment_transactions.order_id） @return \think\model\relation\HasMany */
    public function paymentTransactions(): \think\model\relation\HasMany
    {
        return $this->hasMany(PaymentTransaction::class, 'order_id', 'id');
    }
}
