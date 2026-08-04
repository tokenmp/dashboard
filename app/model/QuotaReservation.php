<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * QuotaReservation —— 对应数据表 quota_reservations
 *
 * @property string $id
 * @property string $user_id
 * @property string|null $request_log_id
 * @property string $billing_plan
 * @property string $status
 * @property int $reserved_requests
 * @property string $reserved_tokens
 * @property int|null $final_requests
 * @property int|null $final_tokens
 * @property string $expires_at
 * @property string $created_at
 * @property string|null $finalized_at
 *
 * @mixin \think\Model
 */
class QuotaReservation extends Model
{
    // 数据表（表名为复数，与默认蛇形命名不同，需显式指定）
    protected $table = 'quota_reservations';

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
        'reserved_requests' => 'integer',
        'final_requests' => 'integer',
        'final_tokens' => 'integer',
        'expires_at' => 'datetime',
        'created_at' => 'datetime',
        'finalized_at' => 'datetime',
    ];

    // ==================== 关联关系 ====================

    /** 所属 User（外键 quota_reservations.user_id） @return \think\model\relation\BelongsTo */
    public function user(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id', 'id');
    }
}
