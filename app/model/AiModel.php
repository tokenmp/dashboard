<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * AiModel —— 对应数据表 models
 *
 * @property string $id
 * @property string $name
 * @property string|null $display_name
 * @property string|null $description
 * @property string $status
 * @property string $created_at
 * @property string $updated_at
 * @property string $capabilities
 * @property int|null $context_window_tokens
 * @property array $metadata
 * @property string $billing_mode
 *
 * @mixin \think\Model
 */
class AiModel extends Model
{
    // 数据表（表名为复数，与默认蛇形命名不同，需显式指定）
    protected $table = 'models';

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
        'context_window_tokens' => 'integer',
        'metadata' => 'json',
    ];

    // ==================== 关联关系 ====================

    /** 拥有多条 PriceMultiplierRule（外键 model_id） @return \think\model\relation\HasMany */
    public function priceMultiplierRules(): \think\model\relation\HasMany
    {
        return $this->hasMany(PriceMultiplierRule::class, 'model_id', 'id');
    }

    /** 拥有多条 UpstreamModelMapping（外键 model_id） @return \think\model\relation\HasMany */
    public function upstreamModelMappings(): \think\model\relation\HasMany
    {
        return $this->hasMany(UpstreamModelMapping::class, 'model_id', 'id');
    }
}
