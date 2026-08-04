<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * 供应商（providers）—— AI 上游供应方
 *
 * 平台对接的外部 AI 服务方（如 openai、anthropic）。
 * 是上游侧顶层归属实体，provider_endpoints 与 upstream_keys 都挂在它之下；
 * 软删用 status=deleted，且 name 在未软删记录内大小写不敏感且唯一。
 *
 * @property string      $id            供应商 ID（UUID 主键）
 * @property string      $name          供应商标识名，路由选择时按它过滤；在未软删记录内大小写不敏感且全局唯一
 * @property string|null $display_name  展示名（友好/中文名）；可空
 * @property string      $base_url      供应商根地址，与端点路径拼成最终上游 URL
 * @property string      $status        状态：active（默认）/ disabled / deleted（软删）
 * @property string      $created_at    创建时间
 * @property string      $updated_at    最近更新时间，改资料或状态时刷新
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
