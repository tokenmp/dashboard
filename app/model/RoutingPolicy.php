<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * 路由策略（routing_policies）—— 加权打分配置
 *
 * 执行器在多条候选路由间做加权打分排序时使用的权重配置。
 * 同一时刻全局只有一条 active 策略生效；
 * 各维度权重取值在 0~1 之间。
 * 纯配置表，无外键关联。
 *
 * @property string $id                   策略 ID（UUID 主键）
 * @property string $name                 策略名，仅作展示
 * @property float  $price_weight         价格维度权重（单价越低越优），默认 0.3
 * @property float  $speed_weight         速度维度权重（延迟/首字延迟），默认 0.2
 * @property float  $success_weight       成功率维度权重，默认 0.2
 * @property float  $availability_weight  可用性维度权重，默认 0.15
 * @property float  $concurrency_weight   并发余量维度权重，默认 0.1
 * @property float  $quota_weight         配额余量维度权重，默认 0.05
 * @property float  $temperature          打分温度/随机度，用于引入选择多样性，默认 0.1
 * @property string $status               状态：active / disabled（全局仅一条 active）
 * @property string $created_at           创建时间
 * @property string $updated_at           更新时间
 *
 * @mixin \think\Model
 */
class RoutingPolicy extends Model
{
    // 数据表（表名为复数，与默认蛇形命名不同，需显式指定）
    protected $table = 'routing_policies';

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
        'price_weight' => 'float',
        'speed_weight' => 'float',
        'success_weight' => 'float',
        'availability_weight' => 'float',
        'concurrency_weight' => 'float',
        'quota_weight' => 'float',
        'temperature' => 'float',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];
}
