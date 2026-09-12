<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * wallet_ledger —— 资金账本（人民币元）
 *
 * 平台唯一的资金流水账本：充值、赠送、扣费、退款、调账、提现、过期、冻结/解冻都写在此表。
 * `amount_cny` 正数表示入账、负数表示出账；`balance_after` 记录记账后的可用余额快照。
 * `idempotency_key` 全局唯一，用于抵御重复回调/重放（见设计文档 §7.5 幂等键规范）。
 *
 * @property string      $id               流水主键
 * @property string      $user_id          流水归属用户
 * @property string|null $request_log_id   关联请求日志；充值/调账等非请求场景为空
 * @property string|null $order_id         关联订单；充值/退款场景填写
 * @property string      $entry_type       流水类型：topup/bonus/charge/refund/adjustment/withdrawal/expire/freeze/unfreeze/bad_debt
 * @property string      $amount_cny       金额（元），正=入账、负=出账
 * @property string      $balance_after    记账后可用余额快照（元）
 * @property string      $currency         币种，默认 CNY
 * @property string|null $reason           人类可读的变动说明
 * @property string|null $idempotency_key  幂等键，全局唯一
 * @property array       $metadata         扩展信息，默认空对象
 * @property string      $created_at       创建时间
 *
 * @mixin \think\Model
 */
class WalletLedger extends Model
{
    // 数据表（表名为复数，与默认蛇形命名不同，需显式指定）
    protected $table = 'wallet_ledger';

    // 主键（uuid DEFAULT gen_random_uuid）
    protected $pk = 'id';

    // 使用 pgsql 连接（见 config/database.php 中 'pgsql' 配置）
    protected $connection = 'pgsql';

    // 自动时间戳（created_at / updated_at，非默认 create_time/update_time；本表无 updated_at）
    protected $autoWriteTimestamp = 'datetime';
    protected $createTime = 'created_at';
    protected $updateTime = false;

    // 字段类型转换（金额 NUMERIC 保留字符串避免精度丢失）
    protected $type = [
        'id' => 'string',
        'user_id' => 'string',
        'request_log_id' => 'string',
        'order_id' => 'string',
        'metadata' => 'json',
        'created_at' => 'datetime',
    ];

    // ==================== 关联关系 ====================

    /** 所属 User（外键 wallet_ledger.user_id） @return \think\model\relation\BelongsTo */
    public function user(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id', 'id');
    }

    /** 所属 Order（外键 wallet_ledger.order_id） @return \think\model\relation\BelongsTo */
    public function order(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(Order::class, 'order_id', 'id');
    }

    /** 所属 RequestLog（外键 wallet_ledger.request_log_id） @return \think\model\relation\BelongsTo */
    public function requestLog(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(RequestLog::class, 'request_log_id', 'id');
    }
}
