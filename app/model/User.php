<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * User —— 对应数据表 users
 *
 * @property string $id
 * @property string $email
 * @property string $password_hash
 * @property string $role
 * @property string $status
 * @property string $preferred_billing
 * @property bool $fallback_enabled
 * @property string $created_at
 * @property string $updated_at
 * @property int $token_version
 *
 * @mixin \think\Model
 */
class User extends Model
{
    // 数据表（表名为复数，与默认蛇形命名不同，需显式指定）
    protected $table = 'users';

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
        'fallback_enabled' => 'bool',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
        'token_version' => 'integer',
    ];

    // ==================== 关联关系 ====================

    /** 拥有多条 UserRiskReset（外键 admin_user_id） @return \think\model\relation\HasMany */
    public function adminRiskResets(): \think\model\relation\HasMany
    {
        return $this->hasMany(UserRiskReset::class, 'admin_user_id', 'id');
    }

    /** 拥有多条 BotKey（外键 user_id） @return \think\model\relation\HasMany */
    public function botKeys(): \think\model\relation\HasMany
    {
        return $this->hasMany(BotKey::class, 'user_id', 'id');
    }

    /** 拥有多条 MarketplaceRequestSettlement（外键 consumer_user_id） @return \think\model\relation\HasMany */
    public function consumerSettlements(): \think\model\relation\HasMany
    {
        return $this->hasMany(MarketplaceRequestSettlement::class, 'consumer_user_id', 'id');
    }

    /** 拥有多条 MarketplaceLedger（外键 user_id） @return \think\model\relation\HasMany */
    public function marketplaceLedger(): \think\model\relation\HasMany
    {
        return $this->hasMany(MarketplaceLedger::class, 'user_id', 'id');
    }

    /** 拥有多条 QuotaReservation（外键 user_id） @return \think\model\relation\HasMany */
    public function quotaReservations(): \think\model\relation\HasMany
    {
        return $this->hasMany(QuotaReservation::class, 'user_id', 'id');
    }

    /** 拥有多条 RedeemCodeRedemption（外键 user_id） @return \think\model\relation\HasMany */
    public function redeemCodeRedemptions(): \think\model\relation\HasMany
    {
        return $this->hasMany(RedeemCodeRedemption::class, 'user_id', 'id');
    }

    /** 拥有多条 RedeemCode（外键 created_by） @return \think\model\relation\HasMany */
    public function redeemCodes(): \think\model\relation\HasMany
    {
        return $this->hasMany(RedeemCode::class, 'created_by', 'id');
    }

    /** 拥有多条 RequestLog（外键 user_id） @return \think\model\relation\HasMany */
    public function requestLogs(): \think\model\relation\HasMany
    {
        return $this->hasMany(RequestLog::class, 'user_id', 'id');
    }

    /** 拥有多条 MarketplaceListing（外键 reviewed_by） @return \think\model\relation\HasMany */
    public function reviewedListings(): \think\model\relation\HasMany
    {
        return $this->hasMany(MarketplaceListing::class, 'reviewed_by', 'id');
    }

    /** 拥有多条 MarketplaceListing（外键 seller_user_id） @return \think\model\relation\HasMany */
    public function sellerListings(): \think\model\relation\HasMany
    {
        return $this->hasMany(MarketplaceListing::class, 'seller_user_id', 'id');
    }

    /** 拥有多条 MarketplaceRequestSettlement（外键 supplier_user_id） @return \think\model\relation\HasMany */
    public function supplierSettlements(): \think\model\relation\HasMany
    {
        return $this->hasMany(MarketplaceRequestSettlement::class, 'supplier_user_id', 'id');
    }

    /** 拥有多条 UpstreamKey（外键 owner_user_id） @return \think\model\relation\HasMany */
    public function upstreamKeys(): \think\model\relation\HasMany
    {
        return $this->hasMany(UpstreamKey::class, 'owner_user_id', 'id');
    }

    /** 拥有多条 UsageLedger（外键 user_id） @return \think\model\relation\HasMany */
    public function usageLedger(): \think\model\relation\HasMany
    {
        return $this->hasMany(UsageLedger::class, 'user_id', 'id');
    }

    /** 拥有多条 UserApiKey（外键 user_id） @return \think\model\relation\HasMany */
    public function userApiKeys(): \think\model\relation\HasMany
    {
        return $this->hasMany(UserApiKey::class, 'user_id', 'id');
    }

    /** 拥有多条 UserAutoModelConfig（外键 user_id） @return \think\model\relation\HasMany */
    public function userAutoModelConfigs(): \think\model\relation\HasMany
    {
        return $this->hasMany(UserAutoModelConfig::class, 'user_id', 'id');
    }

    /** 拥有多条 UserAutoModelFallback（外键 user_id） @return \think\model\relation\HasMany */
    public function userAutoModelFallbacks(): \think\model\relation\HasMany
    {
        return $this->hasMany(UserAutoModelFallback::class, 'user_id', 'id');
    }

    /** 拥有多条 UserPlan（外键 user_id） @return \think\model\relation\HasMany */
    public function userPlans(): \think\model\relation\HasMany
    {
        return $this->hasMany(UserPlan::class, 'user_id', 'id');
    }

    /** 拥有多条 UserRiskReset（外键 user_id） @return \think\model\relation\HasMany */
    public function userRiskResets(): \think\model\relation\HasMany
    {
        return $this->hasMany(UserRiskReset::class, 'user_id', 'id');
    }
}
