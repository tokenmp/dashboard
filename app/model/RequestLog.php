<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * RequestLog —— 对应数据表 request_logs
 *
 * @property string $id
 * @property string|null $user_id
 * @property string|null $user_api_key_id
 * @property string|null $model_name
 * @property string|null $protocol
 * @property bool $stream
 * @property string|null $billing_plan
 * @property int|null $final_status_code
 * @property bool|null $success
 * @property int|null $input_tokens
 * @property int|null $output_tokens
 * @property int|null $total_tokens
 * @property int|null $latency_ms
 * @property int|null $ttft_ms
 * @property string|null $error_code
 * @property string|null $error_message
 * @property string $usage_status
 * @property string $created_at
 * @property string|null $completed_at
 * @property string|null $request_id
 * @property string|null $trace_id
 * @property string|null $request_body
 * @property string|null $requested_model_name
 * @property string|null $resolved_model_name
 * @property string|null $route_group_name
 * @property string|null $requested_provider_name
 * @property string|null $provider_error_code
 * @property string|null $provider_error_type
 * @property int|null $provider_http_status
 * @property bool $response_started
 * @property string|null $disconnect_stage
 * @property int|null $upstream_status
 * @property string|null $billing_source
 * @property int|null $cache_tokens
 * @property bool $thinking_mode
 * @property string|null $thinking_effort
 * @property string|null $billing_user_plan_id
 * @property string|null $billing_plan_id
 * @property string|null $billing_plan_name
 * @property int $billing_charge_requests
 * @property int $billing_charge_tokens
 * @property string|null $thinking_effort_original
 * @property bool $thinking_effort_degraded
 *
 * @mixin \think\Model
 */
class RequestLog extends Model
{
    // 数据表（表名为复数，与默认蛇形命名不同，需显式指定）
    protected $table = 'request_logs';

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
        'user_api_key_id' => 'string',
        'stream' => 'bool',
        'final_status_code' => 'integer',
        'success' => 'bool',
        'input_tokens' => 'integer',
        'output_tokens' => 'integer',
        'total_tokens' => 'integer',
        'latency_ms' => 'integer',
        'ttft_ms' => 'integer',
        'created_at' => 'datetime',
        'completed_at' => 'datetime',
        'provider_http_status' => 'integer',
        'response_started' => 'bool',
        'upstream_status' => 'integer',
        'cache_tokens' => 'integer',
        'thinking_mode' => 'bool',
        'billing_user_plan_id' => 'string',
        'billing_plan_id' => 'string',
        'billing_charge_requests' => 'integer',
        'billing_charge_tokens' => 'integer',
        'thinking_effort_degraded' => 'bool',
    ];

    // ==================== 关联关系 ====================

    /** 所属 Plan（外键 request_logs.billing_plan_id） @return \think\model\relation\BelongsTo */
    public function billingPlan(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(Plan::class, 'billing_plan_id', 'id');
    }

    /** 所属 UserPlan（外键 request_logs.billing_user_plan_id） @return \think\model\relation\BelongsTo */
    public function billingUserPlan(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(UserPlan::class, 'billing_user_plan_id', 'id');
    }

    /** 所属 User（外键 request_logs.user_id） @return \think\model\relation\BelongsTo */
    public function user(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id', 'id');
    }

    /** 所属 UserApiKey（外键 request_logs.user_api_key_id） @return \think\model\relation\BelongsTo */
    public function userApiKey(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(UserApiKey::class, 'user_api_key_id', 'id');
    }
}
