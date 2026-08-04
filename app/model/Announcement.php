<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * Announcement —— 对应数据表 announcements
 *
 * @property string $id
 * @property string $title
 * @property string $body
 * @property string $severity
 * @property string $scope
 * @property bool $dismissible
 * @property string $status
 * @property int $sort_order
 * @property string $publish_from
 * @property string|null $publish_until
 * @property string|null $created_by
 * @property string $created_at
 * @property string $updated_at
 *
 * @mixin \think\Model
 */
class Announcement extends Model
{
    // 数据表（表名为复数，与默认蛇形命名不同，需显式指定）
    protected $table = 'announcements';

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
        'dismissible' => 'bool',
        'sort_order' => 'integer',
        'publish_from' => 'datetime',
        'publish_until' => 'datetime',
        'created_by' => 'string',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];
}
