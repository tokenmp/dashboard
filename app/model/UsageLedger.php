<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * UsageLedger —— 对应数据表 usage_ledger
 *
 * @property string $id
 * @property string $user_id
 * @property string|null $request_log_id
 * @property string $ledger_type
 * @property string $billing_plan
 * @property string $token_delta
 * @property int $request_delta
 * @property string|null $reason
 * @property string $created_at
 *
 * @mixin \think\Model
 */
class UsageLedger extends Model
{
    // 数据表（表名为复数，与默认蛇形命名不同，需显式指定）
    protected $table = 'usage_ledger';

    // 主键（uuid DEFAULT gen_random_uuid）
    protected $pk = 'id';

    // 使用 pgsql 连接（见 config/database.php 中 'pgsql' 配置）
    protected $connection = 'pgsql';

    // 自动时间戳（created_at / updated_at，非默认 create_time/update_time）
    protected $autoWriteTimestamp = 'datetime';
    protected $createTime = 'created_at';
    protected $updateTime = false;

    // 字段类型转换
    protected $type = [
        'id' => 'string',
        'user_id' => 'string',
        'request_log_id' => 'string',
        'request_delta' => 'integer',
        'created_at' => 'datetime',
    ];

    // ==================== 关联关系 ====================

    /** 所属 User（外键 usage_ledger.user_id） @return \think\model\relation\BelongsTo */
    public function user(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id', 'id');
    }

    /** 拥有多条 RedeemCodeRedemption（外键 ledger_id） @return \think\model\relation\HasMany */
    public function redeemCodeRedemptions(): \think\model\relation\HasMany
    {
        return $this->hasMany(RedeemCodeRedemption::class, 'ledger_id', 'id');
    }
}
