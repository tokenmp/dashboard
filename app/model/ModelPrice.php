<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * model_prices —— 套餐×模型定价矩阵（L1 套餐专属价 / L2 平台默认价）
 *
 * 定价的唯一事实源：`plan_id` 非空表示某套餐的专属价（L1），为空表示平台默认价（L2）。
 * 同一行按所属套餐类型解释：
 *  - coding / image：`request_weight` 是该套餐下每次请求消耗的「次数权重」（NULL 视为 1）；
 *  - token / wallet：`*_price_per_token` 是元/token 单价。
 * 解析链为「L1 命中 → L1；缺失 → L2；都缺失 → 拒绝计费」，路由级成本价（L3）不在此表。
 *
 * @property string      $id                            定价行主键
 * @property string|null $plan_id                       套餐 ID；为空表示平台默认价（L2）
 * @property string      $model_id                       平台模型 ID
 * @property string|null $request_weight                 订阅轨次数权重（NULL 视为 1）
 * @property string|null $input_price_per_token          按量轨输入单价（元/token）
 * @property string|null $output_price_per_token         按量轨输出单价（元/token）
 * @property string|null $cache_read_price_per_token     按量轨缓存读单价（元/token）
 * @property string|null $cache_write_price_per_token    按量轨缓存写单价（元/token）
 * @property string      $currency                       币种，默认 CNY
 * @property string      $status                         状态：active（默认）/ disabled / deleted（软删）
 * @property string      $created_at                     创建时间
 * @property string      $updated_at                     更新时间
 *
 * @mixin \think\Model
 */
class ModelPrice extends Model
{
    // 数据表（表名为复数，与默认蛇形命名不同，需显式指定）
    protected $table = 'model_prices';

    // 主键（uuid DEFAULT gen_random_uuid）
    protected $pk = 'id';

    // 使用 pgsql 连接（见 config/database.php 中 'pgsql' 配置）
    protected $connection = 'pgsql';

    // 自动时间戳（created_at / updated_at，非默认 create_time/update_time）
    protected $autoWriteTimestamp = 'datetime';
    protected $createTime = 'created_at';
    protected $updateTime = 'updated_at';

    // 字段类型转换（NUMERIC 出参为字符串，保留原样避免精度丢失）
    protected $type = [
        'id' => 'string',
        'plan_id' => 'string',
        'model_id' => 'string',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    // ==================== 关联关系 ====================

    /** 所属 Plan（外键 model_prices.plan_id；平台默认价时为空） @return \think\model\relation\BelongsTo */
    public function plan(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(Plan::class, 'plan_id', 'id');
    }

    /** 所属 AiModel（外键 model_prices.model_id） @return \think\model\relation\BelongsTo */
    public function aiModel(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(AiModel::class, 'model_id', 'id');
    }
}
