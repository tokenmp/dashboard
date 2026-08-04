<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * 上游模型映射（upstream_model_mappings）—— 上游密钥与平台模型的桥接
 *
 * 定义「一条上游密钥能用上游模型名去服务哪个平台模型」的核心映射，是路由连接的中心。
 * 同一条（上游密钥、平台模型、端点）三元组在未软删范围内唯一；
 * 输入/输出 token 单价与最大输出长度也落在映射上。
 *
 * @property string      $id                      映射 ID（UUID 主键）
 * @property string      $upstream_key_id         所用的上游密钥 ID
 * @property string      $model_id                服务的平台模型 ID
 * @property string|null $upstream_model_name     转发到上游时实际用的模型名（如平台模型叫 gpt-4o，上游可能要发 gpt-4o-2024-08-06）；为空时回退平台模型名
 * @property float|null  $input_price_per_token   输入 token 单价，用于计费；可空
 * @property float|null  $output_price_per_token  输出 token 单价，用于计费；可空
 * @property int|null    $max_tokens              该映射上的最大输出 token 数，参与 /v1/models 的平均上下文窗口聚合；可空
 * @property string      $status                  状态：active（默认）/ disabled / deleted（软删）
 * @property string      $created_at              创建时间
 * @property string      $updated_at              更新时间
 * @property string|null $provider_endpoint_id    显式绑定的接入端点；为空时执行器按协议在该供应商的端点中自动匹配
 *
 * @mixin \think\Model
 */
class UpstreamModelMapping extends Model
{
    // 数据表（表名为复数，与默认蛇形命名不同，需显式指定）
    protected $table = 'upstream_model_mappings';

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
        'upstream_key_id' => 'string',
        'model_id' => 'string',
        'input_price_per_token' => 'float',
        'output_price_per_token' => 'float',
        'max_tokens' => 'integer',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
        'provider_endpoint_id' => 'string',
    ];

    // ==================== 关联关系 ====================

    /** 所属 AiModel（外键 upstream_model_mappings.model_id） @return \think\model\relation\BelongsTo */
    public function model(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(AiModel::class, 'model_id', 'id');
    }

    /** 所属 ProviderEndpoint（外键 upstream_model_mappings.provider_endpoint_id） @return \think\model\relation\BelongsTo */
    public function providerEndpoint(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(ProviderEndpoint::class, 'provider_endpoint_id', 'id');
    }

    /** 所属 UpstreamKey（外键 upstream_model_mappings.upstream_key_id） @return \think\model\relation\BelongsTo */
    public function upstreamKey(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(UpstreamKey::class, 'upstream_key_id', 'id');
    }

    /** 拥有多条 MarketplaceListing（外键 upstream_model_mapping_id） @return \think\model\relation\HasMany */
    public function marketplaceListings(): \think\model\relation\HasMany
    {
        return $this->hasMany(MarketplaceListing::class, 'upstream_model_mapping_id', 'id');
    }

    /** 拥有多条 UpstreamRouteGroupMembership（外键 upstream_model_mapping_id） @return \think\model\relation\HasMany */
    public function upstreamRouteGroupMemberships(): \think\model\relation\HasMany
    {
        return $this->hasMany(UpstreamRouteGroupMembership::class, 'upstream_model_mapping_id', 'id');
    }
}
