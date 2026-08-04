<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * request_attempts —— 请求尝试明细（同一请求向不同上游或 Key 的逐次尝试）
 *
 * 一次请求可能因路由重试而触发多次上游尝试，每次尝试都会写一行。
 * 它记录每一次用了哪把上游 Key、走哪个供应商与上游 URL、返回的 HTTP 状态、耗时以及错误，用于还原请求的重试链路与排障。
 * 执行过程中的路由评分等运行时信息会被合并进元数据字段，按尝试序号升序即可还原尝试顺序。
 * 请求归档时，这些明细会随主日志一并删除。
 * 相比 request_logs 的一次请求完整画像，这里更偏重单次上游尝试的细节。
 *
 * @property string      $id                    尝试主键，全局唯一标识
 * @property string      $request_log_id        所属的请求日志；请求归档时会一并删除
 * @property string|null $upstream_key_id       本次尝试使用的上游 Key
 * @property string|null $provider_id           本次尝试使用的供应商
 * @property string|null $upstream_url          本次实际请求的上游 URL
 * @property int|null    $status_code           本次尝试返回的 HTTP 状态码
 * @property int|null    $latency_ms            本次尝试的耗时（毫秒）；客户端取消风控会按它是否超过阈值来判定「疑似已产生成本」
 * @property string|null $error_code            本次尝试的平台错误码
 * @property string|null $error_message         本次尝试的错误文案
 * @property int         $attempt_index         尝试序号，从 0 或 1 起递增，用于排序与定位元数据
 * @property string      $created_at            创建时间
 * @property string|null $request_id            冗余存储的 request_id，便于跨表追踪
 * @property string|null $trace_id              冗余存储的 trace_id，便于跨表追踪
 * @property string|null $response_body         本次上游响应的正文，用于调试
 * @property string|null $provider_error_code   上游返回的原始错误 code
 * @property string|null $provider_error_type   上游返回的原始错误 type
 * @property int|null    $provider_http_status  上游返回的 HTTP 状态
 * @property array       $metadata              排障元数据，例如路由评分的变化等运行时信息
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
