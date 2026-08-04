<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * 上游密钥（upstream_keys）—— 上游 API Key 凭据
 *
 * 某供应商下的一条真实上游 API Key（加密存储），携带并发上限、优先级、配额、计费类型等执行期控制信息，是路由选中后真正用来「发请求 + 算并发 + 算用量」的实体。
 * 挂在 provider 之下，可被上游模型映射、价格倍率规则、并发租约等引用。
 *
 * @property string      $id                     上游密钥 ID（UUID 主键）
 * @property string      $provider_id            所属供应商 ID
 * @property string      $name                   密钥展示名（管理端命名，仅作展示）
 * @property string|null $key_prefix             明文密钥前缀，脱敏展示用；可空
 * @property string|null $key_suffix             明文密钥后缀，脱敏展示用；可空
 * @property string      $encrypted_key          加密后的真实密钥，执行器解密后转发
 * @property int         $encryption_version     加密方案版本，默认 1
 * @property int         $max_concurrency        允许的最大并发租约数，默认 10；并发计数达到上限时拒绝新请求
 * @property int         $priority               路由优先级，越大越先选，同级按创建时间升序，默认 0
 * @property int|null    $quota_total            配额上限；为空表示不限
 * @property string      $quota_used             已用配额，默认 0
 * @property float|null  $cost                   该密钥的成本单价，用于成本核算；可空
 * @property string|null $expires_at             密钥到期时间；可空
 * @property string      $status                 状态：active（默认）/ disabled / deleted（软删）
 * @property string|null $notes                  备注；可空
 * @property string      $created_at             创建时间
 * @property string      $updated_at             更新时间
 * @property string      $quota_type             配额/计费类别，决定用量计到哪种套餐。取值：token_plan（默认）/ coding_plan / image_plan
 * @property string|null $owner_user_id          用户自带密钥时的归属用户；平台密钥必须为空
 * @property string      $source_type            来源类型：platform（默认，平台官方密钥）/ user（用户自带密钥）
 * @property string      $visibility             可见范围：private（默认）/ marketplace
 * @property string      $review_status          审核/上架状态：draft / pending / approved（默认）/ rejected
 * @property string      $market_status          市场上架后的健康/交易状态：offline / online（默认）/ paused / degraded / exhausted / suspended
 * @property string|null $verified_at            最近一次校验通过时间；可空
 * @property string|null $last_validation_error  最近一次校验失败的错误描述；可空
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
