<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * 价格倍率规则（price_multiplier_rules）—— 计费调价规则
 *
 * 在路由选中后，对最终计费单价做「乘以倍率」调整的规则集。
 * 支持按供应商、上游密钥、模型、协议、时区、星期、时段、生效区间多维匹配，并用优先级、叠加方式、互斥组控制多条规则如何叠加。
 *
 * @property string      $id               规则 ID（UUID 主键）
 * @property string|null $provider_id      命中范围：供应商；为空表示不限
 * @property string|null $upstream_key_id  命中范围：上游密钥；为空表示不限
 * @property string|null $model_id         命中范围：平台模型；为空表示不限
 * @property string|null $protocol         命中范围：协议；为空表示不限。取值：openai / anthropic / openai_chat / openai_responses / anthropic_messages / image_generation / tokenmp_gateway / custom
 * @property string      $timezone         时段判断所用时区，默认 UTC
 * @property int         $days_of_week     生效星期，1=周一至 7=周日，空数组表示每天
 * @property string      $start_time       每日生效起始时刻（HH:MM）
 * @property string      $end_time         每日生效结束时刻（HH:MM）
 * @property float       $multiplier       价格倍率，乘到单价上，须大于 0
 * @property int         $priority         优先级，越大越优，默认 0
 * @property string      $status           状态：active（默认）/ disabled / deleted（软删）
 * @property string      $created_at       创建时间
 * @property string      $updated_at       更新时间
 * @property string      $compose_mode     多规则叠加方式：set（默认，取最高优先级规则直接设定倍率）/ multiply（多条命中倍率相乘）
 * @property string|null $effective_from   生效起始时间；可空，与 effective_until 同时给定时要早于后者
 * @property string|null $effective_until  生效结束时间；可空
 * @property string|null $exclusive_group  互斥组名，同组规则只取一条；可空
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
        'multiplier' => 'float',
        'priority' => 'integer',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
        'effective_from' => 'datetime',
        'effective_until' => 'datetime',
        'side' => 'string',
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
