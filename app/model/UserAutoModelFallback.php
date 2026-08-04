<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * 自动模型备选列表（user_auto_model_fallbacks）—— 主模型降级时的备选项
 *
 * 存放主模型不可用时依次尝试的备选模型。
 * 每次更新配置都会先清空再按数组顺序重新写入，使备选项的先后顺序即优先级。
 * 逻辑上从属于同用户的主模型配置。
 *
 * @property string $id          记录唯一标识
 * @property string $user_id     所属用户
 * @property string $model_name  备选模型名
 * @property string $created_at  创建时间
 *
 * @mixin \think\Model
 */
class UserAutoModelFallback extends Model
{
    // 数据表（表名为复数，与默认蛇形命名不同，需显式指定）
    protected $table = 'user_auto_model_fallbacks';

    // 主键（uuid DEFAULT gen_random_uuid）
    protected $pk = 'id';

    // 使用 pgsql 连接（见 config/database.php 中 'pgsql' 配置）
    protected $connection = 'pgsql';

    // 自动时间戳（created_at / updated_at，非默认 create_time/update_time）
    protected $autoWriteTimestamp = 'datetime';
    protected $createTime = 'created_at';
    protected $updateTime = false;

    // 字段类型转换
    protected $type = [
        'id' => 'string',
        'user_id' => 'string',
        'created_at' => 'datetime',
    ];

    // ==================== 关联关系 ====================

    /** 所属 User（外键 user_auto_model_fallbacks.user_id） @return \think\model\relation\BelongsTo */
    public function user(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id', 'id');
    }
}
