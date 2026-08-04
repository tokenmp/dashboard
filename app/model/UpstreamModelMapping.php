<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * UpstreamModelMapping —— 对应数据表 upstream_model_mappings
 *
 * @property string $id
 * @property string $upstream_key_id
 * @property string $model_id
 * @property string|null $upstream_model_name
 * @property float|null $input_price_per_token
 * @property float|null $output_price_per_token
 * @property int|null $max_tokens
 * @property string $status
 * @property string $created_at
 * @property string $updated_at
 * @property string|null $provider_endpoint_id
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
