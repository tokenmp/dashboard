<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * payment_transactions —— 支付网关流水
 *
 * 一笔订单在某个支付网关上的交易记录，用于对账与回调幂等。
 * `(gateway, gateway_txn_id)` 有部分唯一索引（gateway_txn_id 非空时生效），
 * 保证同一网关交易号只落一行；`raw_payload` 保存网关原始回调报文。
 * 支付网关后置（设计决策 D7），当前仅 model 先行、字段按通用网关预留。
 *
 * @property string      $id             流水主键
 * @property string      $order_id       关联订单
 * @property string      $gateway        支付网关：alipay / wechat / manual / redeem
 * @property string|null $gateway_txn_id 网关侧交易号
 * @property string      $amount_cny     交易金额（元）
 * @property string      $status         状态：created / succeeded / failed / refunded
 * @property array       $raw_payload    网关原始报文，默认空对象
 * @property string      $created_at     创建时间
 * @property string      $updated_at     更新时间
 *
 * @mixin \think\Model
 */
class PaymentTransaction extends Model
{
    // 数据表（表名为复数，与默认蛇形命名不同，需显式指定）
    protected $table = 'payment_transactions';

    // 主键（uuid DEFAULT gen_random_uuid）
    protected $pk = 'id';

    // 使用 pgsql 连接（见 config/database.php 中 'pgsql' 配置）
    protected $connection = 'pgsql';

    // 自动时间戳（created_at / updated_at，非默认 create_time/update_time）
    protected $autoWriteTimestamp = 'datetime';
    protected $createTime = 'created_at';
    protected $updateTime = 'updated_at';

    // 字段类型转换（金额 NUMERIC 保留字符串避免精度丢失）
    protected $type = [
        'id' => 'string',
        'order_id' => 'string',
        'raw_payload' => 'json',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    // ==================== 关联关系 ====================

    /** 所属 Order（外键 payment_transactions.order_id） @return \think\model\relation\BelongsTo */
    public function order(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(Order::class, 'order_id', 'id');
    }
}
