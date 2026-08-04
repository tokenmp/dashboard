<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * MarketplaceListing —— 对应数据表 marketplace_listings
 *
 * @property string $id
 * @property string $seller_user_id
 * @property string $upstream_model_mapping_id
 * @property float $input_sale_price_per_token
 * @property float $output_sale_price_per_token
 * @property float $input_reward_per_token
 * @property float $output_reward_per_token
 * @property float $platform_fee_rate
 * @property string $currency
 * @property int|null $daily_token_limit
 * @property int|null $monthly_token_limit
 * @property string $status
 * @property string|null $reviewed_by
 * @property string|null $reviewed_at
 * @property string|null $published_at
 * @property string $created_at
 * @property string $updated_at
 *
 * @mixin \think\Model
 */
class MarketplaceListing extends Model
{
    // 数据表（表名为复数，与默认蛇形命名不同，需显式指定）
    protected $table = 'marketplace_listings';

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
        'seller_user_id' => 'string',
        'upstream_model_mapping_id' => 'string',
        'input_sale_price_per_token' => 'float',
        'output_sale_price_per_token' => 'float',
        'input_reward_per_token' => 'float',
        'output_reward_per_token' => 'float',
        'platform_fee_rate' => 'float',
        'daily_token_limit' => 'integer',
        'monthly_token_limit' => 'integer',
        'reviewed_by' => 'string',
        'reviewed_at' => 'datetime',
        'published_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    // ==================== 关联关系 ====================

    /** 所属 User（外键 marketplace_listings.reviewed_by） @return \think\model\relation\BelongsTo */
    public function reviewedBy(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by', 'id');
    }

    /** 所属 User（外键 marketplace_listings.seller_user_id） @return \think\model\relation\BelongsTo */
    public function sellerUser(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(User::class, 'seller_user_id', 'id');
    }

    /** 所属 UpstreamModelMapping（外键 marketplace_listings.upstream_model_mapping_id） @return \think\model\relation\BelongsTo */
    public function upstreamModelMapping(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(UpstreamModelMapping::class, 'upstream_model_mapping_id', 'id');
    }

    /** 拥有多条 MarketplaceLedger（外键 listing_id） @return \think\model\relation\HasMany */
    public function marketplaceLedger(): \think\model\relation\HasMany
    {
        return $this->hasMany(MarketplaceLedger::class, 'listing_id', 'id');
    }

    /** 拥有多条 MarketplaceRequestSettlement（外键 listing_id） @return \think\model\relation\HasMany */
    public function marketplaceRequestSettlements(): \think\model\relation\HasMany
    {
        return $this->hasMany(MarketplaceRequestSettlement::class, 'listing_id', 'id');
    }
}
