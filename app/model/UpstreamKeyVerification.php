<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * UpstreamKeyVerification —— 对应数据表 upstream_key_verifications
 *
 * @property string $id
 * @property string $upstream_key_id
 * @property string $status
 * @property int|null $http_status
 * @property int|null $latency_ms
 * @property string|null $error_code
 * @property string|null $error_message
 * @property array $verified_models
 * @property string $created_at
 *
 * @mixin \think\Model
 */
class UpstreamKeyVerification extends Model
{
    // 数据表（表名为复数，与默认蛇形命名不同，需显式指定）
    protected $table = 'upstream_key_verifications';

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
        'http_status' => 'integer',
        'latency_ms' => 'integer',
        'verified_models' => 'json',
        'created_at' => 'datetime',
    ];

    // ==================== 关联关系 ====================

    /** 所属 UpstreamKey（外键 upstream_key_verifications.upstream_key_id） @return \think\model\relation\BelongsTo */
    public function upstreamKey(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(UpstreamKey::class, 'upstream_key_id', 'id');
    }
}
