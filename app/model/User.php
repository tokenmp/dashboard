<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * 用户表（users）—— 平台终端用户账户主表
 *
 * 每个用户可用邮箱+密码登录管理端，并用 API 密钥或 Bot 密钥调用执行面（executor）。
 * 它承载用户的角色、账号状态与计费偏好。
 * token_version 每次改密码/状态/角色时自增，使该用户已签发的所有 JWT 立即失效。
 *
 * @property string $id                 用户 ID（UUID 主键）
 * @property string $email              登录邮箱，全局唯一
 * @property string $password_hash      密码哈希（单向），永不对外返回
 * @property string $role               角色：user（默认）/ admin
 * @property string $status             状态：active（默认）/ disabled
 * @property string $preferred_billing  首选计费方式：coding（默认）/ token
 * @property bool   $fallback_enabled   首选额度不足时是否回退另一种计费（默认开）
 * @property string $created_at         账号创建时间
 * @property string $updated_at         最近更新时间（改资料/密码/状态时刷新）
 * @property int    $token_version      令牌版本号；改密码/状态/角色时自增以吊销所有 JWT
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
