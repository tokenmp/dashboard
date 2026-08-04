<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * UpstreamKey —— 对应数据表 upstream_keys
 *
 * @property string $id
 * @property string $provider_id
 * @property string $name
 * @property string|null $key_prefix
 * @property string|null $key_suffix
 * @property string $encrypted_key
 * @property int $encryption_version
 * @property int $max_concurrency
 * @property int $priority
 * @property int|null $quota_total
 * @property string $quota_used
 * @property float|null $cost
 * @property string|null $expires_at
 * @property string $status
 * @property string|null $notes
 * @property string $created_at
 * @property string $updated_at
 * @property string $quota_type
 * @property string|null $owner_user_id
 * @property string $source_type
 * @property string $visibility
 * @property string $review_status
 * @property string $market_status
 * @property string|null $verified_at
 * @property string|null $last_validation_error
 *
 * @mixin \think\Model
 */
class UpstreamKey extends Model
{
    // 数据表（表名为复数，与默认蛇形命名不同，需显式指定）
    protected $table = 'upstream_keys';

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
        'encryption_version' => 'integer',
        'max_concurrency' => 'integer',
        'priority' => 'integer',
        'quota_total' => 'integer',
        'cost' => 'float',
        'expires_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
        'owner_user_id' => 'string',
        'verified_at' => 'datetime',
    ];

    // ==================== 关联关系 ====================

    /** 所属 User（外键 upstream_keys.owner_user_id） @return \think\model\relation\BelongsTo */
    public function ownerUser(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_user_id', 'id');
    }

    /** 所属 Provider（外键 upstream_keys.provider_id） @return \think\model\relation\BelongsTo */
    public function provider(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(Provider::class, 'provider_id', 'id');
    }

    /** 拥有多条 KeyLease（外键 upstream_key_id） @return \think\model\relation\HasMany */
    public function keyLeases(): \think\model\relation\HasMany
    {
        return $this->hasMany(KeyLease::class, 'upstream_key_id', 'id');
    }

    /** 拥有多条 MarketplaceRequestSettlement（外键 upstream_key_id） @return \think\model\relation\HasMany */
    public function marketplaceRequestSettlements(): \think\model\relation\HasMany
    {
        return $this->hasMany(MarketplaceRequestSettlement::class, 'upstream_key_id', 'id');
    }

    /** 拥有多条 PriceMultiplierRule（外键 upstream_key_id） @return \think\model\relation\HasMany */
    public function priceMultiplierRules(): \think\model\relation\HasMany
    {
        return $this->hasMany(PriceMultiplierRule::class, 'upstream_key_id', 'id');
    }

    /** 拥有多条 RequestAttempt（外键 upstream_key_id） @return \think\model\relation\HasMany */
    public function requestAttempts(): \think\model\relation\HasMany
    {
        return $this->hasMany(RequestAttempt::class, 'upstream_key_id', 'id');
    }

    /** 拥有多条 RequestLogEvent（外键 upstream_key_id） @return \think\model\relation\HasMany */
    public function requestLogEvents(): \think\model\relation\HasMany
    {
        return $this->hasMany(RequestLogEvent::class, 'upstream_key_id', 'id');
    }

    /** 拥有多条 UpstreamKeyVerification（外键 upstream_key_id） @return \think\model\relation\HasMany */
    public function upstreamKeyVerifications(): \think\model\relation\HasMany
    {
        return $this->hasMany(UpstreamKeyVerification::class, 'upstream_key_id', 'id');
    }

    /** 拥有多条 UpstreamModelMapping（外键 upstream_key_id） @return \think\model\relation\HasMany */
    public function upstreamModelMappings(): \think\model\relation\HasMany
    {
        return $this->hasMany(UpstreamModelMapping::class, 'upstream_key_id', 'id');
    }
}
