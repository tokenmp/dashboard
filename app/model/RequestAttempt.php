<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * RequestAttempt —— 对应数据表 request_attempts
 *
 * @property string $id
 * @property string $request_log_id
 * @property string|null $upstream_key_id
 * @property string|null $provider_id
 * @property string|null $upstream_url
 * @property int|null $status_code
 * @property int|null $latency_ms
 * @property string|null $error_code
 * @property string|null $error_message
 * @property int $attempt_index
 * @property string $created_at
 * @property string|null $request_id
 * @property string|null $trace_id
 * @property string|null $response_body
 * @property string|null $provider_error_code
 * @property string|null $provider_error_type
 * @property int|null $provider_http_status
 * @property array $metadata
 *
 * @mixin \think\Model
 */
class RequestAttempt extends Model
{
    // 数据表（表名为复数，与默认蛇形命名不同，需显式指定）
    protected $table = 'request_attempts';

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
        'request_log_id' => 'string',
        'upstream_key_id' => 'string',
        'provider_id' => 'string',
        'status_code' => 'integer',
        'latency_ms' => 'integer',
        'attempt_index' => 'integer',
        'created_at' => 'datetime',
        'provider_http_status' => 'integer',
        'metadata' => 'json',
    ];

    // ==================== 关联关系 ====================

    /** 所属 Provider（外键 request_attempts.provider_id） @return \think\model\relation\BelongsTo */
    public function provider(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(Provider::class, 'provider_id', 'id');
    }

    /** 所属 UpstreamKey（外键 request_attempts.upstream_key_id） @return \think\model\relation\BelongsTo */
    public function upstreamKey(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(UpstreamKey::class, 'upstream_key_id', 'id');
    }
}
