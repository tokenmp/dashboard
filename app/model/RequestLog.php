<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * request_logs —— 请求日志主表（单次用户请求的完整画像）
 *
 * 每条记录对应一次用户经执行器发起的请求，是整个日志、统计、风控与计费归因的核心事实表。
 * 请求进来时先写入元信息并把用量状态置为 pending；
 * 请求完成后回填用量、延迟、错误、计费快照等，并把完成时间置为当前时刻。
 * 服务重启遗留的进行中行会被兜底标记为 503、客户端取消，并归为用量缺失。
 * 这张表覆盖标识关联、模型路由、计费快照、用量、性能、错误、断连诊断与思考模式等共计 43 个字段，构成一次请求的完整画像。
 *
 * @property string      $id                        日志主键，由应用生成，全局唯一标识这条请求
 * @property string|null $user_id                   发起请求的用户
 * @property string|null $user_api_key_id           用户自建的 API Key，用于区分请求来自哪把密钥
 * @property string|null $model_name                实际计费与落库使用的模型名，即最终生效值
 * @property string|null $protocol                  请求协议，例如 openai、anthropic、openai_chat、openai_responses、anthropic_messages、image_generation、tokenmp_gateway 或 custom
 * @property bool        $stream                    是否为流式请求
 * @property string|null $billing_plan              本次命中的计费套餐类型：coding、token、image 或 free
 * @property int|null    $final_status_code         下游最终返回的 HTTP 状态码；为 0 表示未完成或仍在进行中
 * @property bool|null   $success                   本次请求是否成功
 * @property int|null    $input_tokens              输入 token 数
 * @property int|null    $output_tokens             输出 token 数
 * @property int|null    $total_tokens              总 token 数，等于输入与输出之和
 * @property int|null    $latency_ms                本次请求的总耗时（毫秒）
 * @property int|null    $ttft_ms                   首个 token 的延迟（毫秒），也是客户端取消风控判断「是否已产生成本」的依据之一
 * @property string|null $error_code                平台归一化后的错误码，例如 CLIENT_CANCELED、RATE_LIMITED
 * @property string|null $error_message             错误文案
 * @property string      $usage_status              用量数据的可信度：final 为最终值，pending 表示进行中，estimated 表示估算，missing 表示缺失（如取消或重启兜底）
 * @property string      $created_at                请求开始时间
 * @property string|null $completed_at              请求结束时间，回填用量时置为当前时刻
 * @property string|null $request_id                外部或内部请求标识，可跨表把尝试与事件串起来；支持模糊检索
 * @property string|null $trace_id                  链路追踪 ID；支持模糊检索
 * @property string|null $request_body              调试用的请求正文，列表查询不取、仅详情取；客户端取消风控按其字节量判断
 * @property string|null $requested_model_name      客户端原始请求里写的模型名
 * @property string|null $resolved_model_name       路由解析后最终确定的模型名
 * @property string|null $route_group_name          命中的路由组名，留空视为 default
 * @property string|null $requested_provider_name   客户端指定或期望的供应商名
 * @property string|null $provider_error_code       上游供应商返回的原始错误 code
 * @property string|null $provider_error_type       上游供应商返回的原始错误 type
 * @property int|null    $provider_http_status      上游返回的 HTTP 状态码
 * @property bool        $response_started          客户端断连时，执行器是否已经开始向下游写出响应
 * @property string|null $disconnect_stage          断连发生的阶段，例如 upstream_request、upstream_body、stream_response、upstream_poll、upstream_poll_wait、upstream_submission 或 service_restart
 * @property int|null    $upstream_status           断连时已知的上游 HTTP 状态，是风控判断「已产生成本」的依据之一
 * @property string|null $billing_source            更细的计费来源：coding、token、image、free_model 或 coding_entitlement
 * @property int|null    $cache_tokens              命中提示缓存的 token 数
 * @property bool        $thinking_mode             是否启用了思考（推理）模式
 * @property string|null $thinking_effort           实际生效的思考强度，如 low、medium、high，可能因上游限制被降级
 * @property string|null $billing_user_plan_id      本次实际付费的用户套餐实例
 * @property string|null $billing_plan_id           本次实际付费的套餐定义
 * @property string|null $billing_plan_name         套餐名称的冗余快照，便于展示与排查
 * @property int         $billing_charge_requests   本次结算实际扣减的请求次数
 * @property int         $billing_charge_tokens     本次结算实际扣减的 token 数
 * @property string|null $thinking_effort_original  客户端原始请求里写的思考强度
 * @property bool        $thinking_effort_degraded  是否因上游不支持而把思考强度降级
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
