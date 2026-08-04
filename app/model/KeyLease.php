<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * KeyLease —— 对应数据表 key_leases
 *
 * @property string $id
 * @property string $upstream_key_id
 * @property string|null $request_log_id
 * @property string $status
 * @property string $expires_at
 * @property string $created_at
 * @property string|null $released_at
 *
 * @mixin \think\Model
 */
class KeyLease extends Model
{
    // 数据表（表名为复数，与默认蛇形命名不同，需显式指定）
    protected $table = 'key_leases';

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
        'upstream_key_id' => 'string',
        'request_log_id' => 'string',
        'expires_at' => 'datetime',
        'created_at' => 'datetime',
        'released_at' => 'datetime',
    ];

    // ==================== 关联关系 ====================

    /** 所属 UpstreamKey（外键 key_leases.upstream_key_id） @return \think\model\relation\BelongsTo */
    public function upstreamKey(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(UpstreamKey::class, 'upstream_key_id', 'id');
    }
}
