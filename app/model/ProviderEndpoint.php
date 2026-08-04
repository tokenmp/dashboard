<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * ProviderEndpoint —— 对应数据表 provider_endpoints
 *
 * @property string $id
 * @property string $provider_id
 * @property string $protocol
 * @property string $path
 * @property string $status
 * @property string $created_at
 * @property string $updated_at
 * @property string|null $kind
 * @property string|null $adapter
 * @property string $method
 * @property string $auth_type
 * @property array $headers
 * @property string $request_mode
 *
 * @mixin \think\Model
 */
class ProviderEndpoint extends Model
{
    // 数据表（表名为复数，与默认蛇形命名不同，需显式指定）
    protected $table = 'provider_endpoints';

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
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
        'headers' => 'json',
    ];

    // ==================== 关联关系 ====================

    /** 所属 Provider（外键 provider_endpoints.provider_id） @return \think\model\relation\BelongsTo */
    public function provider(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(Provider::class, 'provider_id', 'id');
    }

    /** 拥有多条 UpstreamModelMapping（外键 provider_endpoint_id） @return \think\model\relation\HasMany */
    public function upstreamModelMappings(): \think\model\relation\HasMany
    {
        return $this->hasMany(UpstreamModelMapping::class, 'provider_endpoint_id', 'id');
    }
}
