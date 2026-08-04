<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * 平台模型目录（models，类名 AiModel）—— 面向用户的模型清单
 *
 * 面向用户暴露的「平台模型」目录（/v1/models 即取自此）。
 * 一条平台模型通过若干上游模型映射背后挂到多个上游密钥，从而具备多供应商容灾能力。
 * 模型名在未软删记录内大小写不敏感且唯一；
 * billing_mode 区分计费模型与全局免费模型。
 *
 * @property string      $id                     平台模型 ID（UUID 主键）
 * @property string      $name                   平台模型名，路由按其命中；在未软删记录内大小写不敏感且唯一
 * @property string|null $display_name           展示名；可空
 * @property string|null $description            模型描述；可空
 * @property string      $status                 状态：active（默认）/ disabled / deleted（软删）
 * @property string      $created_at             创建时间
 * @property string      $updated_at             更新时间
 * @property string      $capabilities           能力标签数组（如 text、图片、工具调用等），/v1/models 与路由都会带出，默认为 [text]
 * @property int|null    $context_window_tokens  模型上下文窗口（token 数）；可空
 * @property array       $metadata               扩展元数据，默认空对象
 * @property string      $billing_mode           计费模式：billable（默认）/ free_global（全局免费，不计用户配额）
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
