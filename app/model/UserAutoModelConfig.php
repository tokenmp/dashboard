<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * 自动模型路由主模型配置（user_auto_model_configs）—— 用户的自动模型路由偏好
 *
 * 用户设置的「自动模型路由」偏好，指定一个主模型，配合按顺序排列的备选模型列表（存于 user_auto_model_fallbacks）。
 * 执行器优先使用主模型，不可用时按备选顺序降级。
 * 每用户至多一条，属个人偏好，与套餐配额无关。
 *
 * @property string $id                  配置记录唯一标识
 * @property string $user_id             所属用户，每用户至多一条
 * @property string $primary_model_name  用户选择的主模型名
 * @property string $created_at          创建时间
 * @property string $updated_at          最近更新时间
 *
 * @mixin \think\Model
 */
class UserAutoModelConfig extends Model
{
    // 数据表（表名为复数，与默认蛇形命名不同，需显式指定）
    protected $table = 'user_auto_model_configs';

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
        'user_id' => 'string',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    // ==================== 关联关系 ====================

    /** 所属 User（外键 user_auto_model_configs.user_id） @return \think\model\relation\BelongsTo */
    public function user(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id', 'id');
    }
}
