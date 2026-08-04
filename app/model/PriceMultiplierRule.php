<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * PriceMultiplierRule —— 对应数据表 price_multiplier_rules
 *
 * @property string $id
 * @property string|null $provider_id
 * @property string|null $upstream_key_id
 * @property string|null $model_id
 * @property string|null $protocol
 * @property string $timezone
 * @property int $days_of_week
 * @property string $start_time
 * @property string $end_time
 * @property float $multiplier
 * @property int $priority
 * @property string $status
 * @property string $created_at
 * @property string $updated_at
 * @property string $compose_mode
 * @property string|null $effective_from
 * @property string|null $effective_until
 * @property string|null $exclusive_group
 *
 * @mixin \think\Model
 */
class PriceMultiplierRule extends Model
{
    // 数据表（表名为复数，与默认蛇形命名不同，需显式指定）
    protected $table = 'price_multiplier_rules';

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
        'upstream_key_id' => 'string',
        'model_id' => 'string',
        'days_of_week' => 'integer',
        'multiplier' => 'float',
        'priority' => 'integer',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
        'effective_from' => 'datetime',
        'effective_until' => 'datetime',
    ];

    // ==================== 关联关系 ====================

    /** 所属 AiModel（外键 price_multiplier_rules.model_id） @return \think\model\relation\BelongsTo */
    public function model(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(AiModel::class, 'model_id', 'id');
    }

    /** 所属 Provider（外键 price_multiplier_rules.provider_id） @return \think\model\relation\BelongsTo */
    public function provider(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(Provider::class, 'provider_id', 'id');
    }

    /** 所属 UpstreamKey（外键 price_multiplier_rules.upstream_key_id） @return \think\model\relation\BelongsTo */
    public function upstreamKey(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(UpstreamKey::class, 'upstream_key_id', 'id');
    }
}
