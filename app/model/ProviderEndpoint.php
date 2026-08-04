<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * 供应商接入端点（provider_endpoints）—— 协议与转发地址
 *
 * 描述某供应商下「用哪个协议、走哪个 HTTP 路径、用什么适配器」的接入点，是路由链路中匹配请求协议并选出可转发 URL 的一环。
 * 每条端点都挂在 provider 之下，并可被上游模型映射显式绑定（不绑定时由执行器按协议自动选）。
 *
 * @property string      $id            端点 ID（UUID 主键）
 * @property string      $provider_id   所属供应商 ID
 * @property string      $protocol      上游协议族，决定如何匹配路由。取值：openai / anthropic / openai_chat / openai_responses / anthropic_messages / image_generation / tokenmp_gateway / custom
 * @property string      $path          该协议下的 HTTP 路径（如 /v1/chat/completions），与供应商 base_url 拼成最终上游 URL
 * @property string      $status        状态：active（默认）/ disabled / deleted（软删）
 * @property string      $created_at    创建时间
 * @property string      $updated_at    更新时间
 * @property string|null $kind          端点功能分类（高层语义），路由过滤用，如 llm.chat、llm.message、image.generate；可空
 * @property string|null $adapter       具体适配器标识，如 openai.chat、anthropic.messages、openai.images、zhipu.images、volcengine.visual.images；可空
 * @property string      $method        HTTP 方法，默认 POST，支持 GET / POST / PUT / PATCH / DELETE
 * @property string      $auth_type     认证头类型，默认 bearer；anthropic 系列用 x-api-key
 * @property array       $headers       附加请求头，默认空对象
 * @property string      $request_mode  请求转发模式，默认 passthrough
 *
 * @mixin \think\Model
 */
class ProviderEndpoint extends Model
{
    // 数据表（表名为复数，与默认蛇形命名不同，需显式指定）
    protected $table = 'provider_endpoints';

    // 主键（uuid DEFAULT gen_random_uuid）
    protected $pk = 'id';

    // 使用 pgsql 连接（见 config/database.php 中 'pgsql' 配置）
    protected $connection = 'pgsql';

    // 自动时间戳（created_at / updated_at，非默认 create_time/update_time）
    protected $autoWriteTimestamp = 'datetime';
    protected $createTime = 'created_at';
    protected $updateTime = 'updated_at';

    // 字段类型转换
    protected $type = [
        'id' => 'string',
        'provider_id' => 'string',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
        'headers' => 'json',
    ];

    // ==================== 关联关系 ====================

    /** 所属 Provider（外键 provider_endpoints.provider_id） @return \think\model\relation\BelongsTo */
    public function provider(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(Provider::class, 'provider_id', 'id');
    }

    /** 拥有多条 UpstreamModelMapping（外键 provider_endpoint_id） @return \think\model\relation\HasMany */
    public function upstreamModelMappings(): \think\model\relation\HasMany
    {
        return $this->hasMany(UpstreamModelMapping::class, 'provider_endpoint_id', 'id');
    }
}
