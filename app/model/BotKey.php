<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * BotKey —— 对应数据表 bot_keys
 *
 * @property string $id
 * @property string $user_id
 * @property string $name
 * @property string $scope
 * @property string $key_prefix
 * @property string $key_suffix
 * @property string $key_hash
 * @property string $status
 * @property string $last_used_at
 * @property string $created_at
 * @property string $updated_at
 *
 * @mixin \think\Model
 */
class BotKey extends Model
{
    // 数据表（表名为复数，与默认蛇形命名不同，需显式指定）
    protected $table = 'bot_keys';

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
        'last_used_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    // ==================== 关联关系 ====================

    /** 所属 User（外键 bot_keys.user_id） @return \think\model\relation\BelongsTo */
    public function user(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id', 'id');
    }
}
