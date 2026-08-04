<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * Notification —— 对应数据表 notifications
 *
 * @property string $id
 * @property string $user_id
 * @property string $type
 * @property string $title
 * @property string|null $body
 * @property string $severity
 * @property string|null $action_label
 * @property string|null $action_url
 * @property array $metadata
 * @property string|null $read_at
 * @property string|null $expires_at
 * @property string $created_at
 * @property string|null $idempotency_key
 *
 * @mixin \think\Model
 */
class Notification extends Model
{
    // 数据表（表名为复数，与默认蛇形命名不同，需显式指定）
    protected $table = 'notifications';

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
        'metadata' => 'json',
        'read_at' => 'datetime',
        'expires_at' => 'datetime',
        'created_at' => 'datetime',
    ];
}
