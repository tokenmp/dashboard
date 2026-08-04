<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * request_log_events —— 请求日志事件与时间线（一次请求内各阶段的结构化事件流）
 *
 * 以「时间线」的形式记录一次请求经过的每个阶段——建连、选路由、上游提交、回流、重试、风控等，用于在详情页还原整个执行过程。
 * 每条事件都挂在所属请求日志上，并冗余 request_id 与 trace_id 便于跨表查询。
 * 状态字段标记该阶段是信息提示、成功、失败还是被跳过。
 * 请求归档时，事件流会随主日志级联删除。
 * 它和 request_attempts 的区别在于：attempts 是逐次上游尝试的明细，而这里是阶段级的事件流。
 *
 * @property string      $id               事件主键，全局唯一标识
 * @property string      $request_log_id   所属的请求日志，删除时级联删除其事件
 * @property string|null $request_id       冗余存储的 request_id，便于跨表查询
 * @property string|null $trace_id         冗余存储的 trace_id，便于跨表查询
 * @property string      $stage            阶段标识，例如 upstream_request、upstream_body、stream_response、upstream_poll 等
 * @property string      $status           本事件的结果状态：info 为信息提示，success 为成功，failed 为失败，skipped 为被跳过
 * @property string|null $message          事件说明文案
 * @property string|null $upstream_key_id  本阶段涉及的上游 Key
 * @property string|null $provider_id      本阶段涉及的供应商
 * @property string|null $upstream_url     本阶段涉及的上游 URL
 * @property int|null    $attempt_index    关联的尝试序号，指向 request_attempts 的对应行
 * @property int|null    $status_code      本阶段的 HTTP 状态码
 * @property int|null    $duration_ms      本阶段耗时（毫秒）
 * @property array       $metadata         本阶段的附加结构化数据
 * @property string      $created_at       事件发生时间，按本列升序再按 id 升序即可还原阶段顺序
 *
 * @mixin \think\Model
 */
class RequestLogEvent extends Model
{
    // 数据表（表名为复数，与默认蛇形命名不同，需显式指定）
    protected $table = 'request_log_events';

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
        'attempt_index' => 'integer',
        'status_code' => 'integer',
        'duration_ms' => 'integer',
        'metadata' => 'json',
        'created_at' => 'datetime',
    ];

    // ==================== 关联关系 ====================

    /** 所属 Provider（外键 request_log_events.provider_id） @return \think\model\relation\BelongsTo */
    public function provider(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(Provider::class, 'provider_id', 'id');
    }

    /** 所属 UpstreamKey（外键 request_log_events.upstream_key_id） @return \think\model\relation\BelongsTo */
    public function upstreamKey(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(UpstreamKey::class, 'upstream_key_id', 'id');
    }
}
