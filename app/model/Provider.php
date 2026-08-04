<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * Provider —— 对应数据表 providers
 *
 * @property string $id
 * @property string $name
 * @property string|null $display_name
 * @property string $base_url
 * @property string $status
 * @property string $created_at
 * @property string $updated_at
 *
 * @mixin \think\Model
 */
class Provider extends Model
{
    // 数据表（表名为复数，与默认蛇形命名不同，需显式指定）
    protected $table = 'providers';

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
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    // ==================== 关联关系 ====================

    /** 拥有多条 PriceMultiplierRule（外键 provider_id） @return \think\model\relation\HasMany */
    public function priceMultiplierRules(): \think\model\relation\HasMany
    {
        return $this->hasMany(PriceMultiplierRule::class, 'provider_id', 'id');
    }

    /** 拥有多条 ProviderEndpoint（外键 provider_id） @return \think\model\relation\HasMany */
    public function providerEndpoints(): \think\model\relation\HasMany
    {
        return $this->hasMany(ProviderEndpoint::class, 'provider_id', 'id');
    }

    /** 拥有多条 RequestAttempt（外键 provider_id） @return \think\model\relation\HasMany */
    public function requestAttempts(): \think\model\relation\HasMany
    {
        return $this->hasMany(RequestAttempt::class, 'provider_id', 'id');
    }

    /** 拥有多条 RequestLogEvent（外键 provider_id） @return \think\model\relation\HasMany */
    public function requestLogEvents(): \think\model\relation\HasMany
    {
        return $this->hasMany(RequestLogEvent::class, 'provider_id', 'id');
    }

    /** 拥有多条 UpstreamKey（外键 provider_id） @return \think\model\relation\HasMany */
    public function upstreamKeys(): \think\model\relation\HasMany
    {
        return $this->hasMany(UpstreamKey::class, 'provider_id', 'id');
    }
}
