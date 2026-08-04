<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * MarketplaceRequestSettlement —— 对应数据表 marketplace_request_settlements
 *
 * @property string $id
 * @property string $request_log_id
 * @property string|null $request_attempt_id
 * @property string $listing_id
 * @property string $consumer_user_id
 * @property string $supplier_user_id
 * @property string $upstream_key_id
 * @property string $input_tokens
 * @property string $output_tokens
 * @property string $cache_tokens
 * @property float $input_sale_price_per_token
 * @property float $output_sale_price_per_token
 * @property float $input_reward_per_token
 * @property float $output_reward_per_token
 * @property float $consumer_amount
 * @property float $supplier_reward
 * @property float $platform_fee
 * @property string $currency
 * @property string $usage_source
 * @property string $status
 * @property string|null $settled_at
 * @property string $created_at
 *
 * @mixin \think\Model
 */
class MarketplaceRequestSettlement extends Model
{
    // 数据表（表名为复数，与默认蛇形命名不同，需显式指定）
    protected $table = 'marketplace_request_settlements';

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
        'request_attempt_id' => 'string',
        'listing_id' => 'string',
        'consumer_user_id' => 'string',
        'supplier_user_id' => 'string',
        'upstream_key_id' => 'string',
        'input_sale_price_per_token' => 'float',
        'output_sale_price_per_token' => 'float',
        'input_reward_per_token' => 'float',
        'output_reward_per_token' => 'float',
        'consumer_amount' => 'float',
        'supplier_reward' => 'float',
        'platform_fee' => 'float',
        'settled_at' => 'datetime',
        'created_at' => 'datetime',
    ];

    // ==================== 关联关系 ====================

    /** 所属 User（外键 marketplace_request_settlements.consumer_user_id） @return \think\model\relation\BelongsTo */
    public function consumerUser(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(User::class, 'consumer_user_id', 'id');
    }

    /** 所属 MarketplaceListing（外键 marketplace_request_settlements.listing_id） @return \think\model\relation\BelongsTo */
    public function listing(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(MarketplaceListing::class, 'listing_id', 'id');
    }

    /** 所属 User（外键 marketplace_request_settlements.supplier_user_id） @return \think\model\relation\BelongsTo */
    public function supplierUser(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(User::class, 'supplier_user_id', 'id');
    }

    /** 所属 UpstreamKey（外键 marketplace_request_settlements.upstream_key_id） @return \think\model\relation\BelongsTo */
    public function upstreamKey(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(UpstreamKey::class, 'upstream_key_id', 'id');
    }

    /** 拥有多条 MarketplaceLedger（外键 settlement_id） @return \think\model\relation\HasMany */
    public function marketplaceLedger(): \think\model\relation\HasMany
    {
        return $this->hasMany(MarketplaceLedger::class, 'settlement_id', 'id');
    }
}
