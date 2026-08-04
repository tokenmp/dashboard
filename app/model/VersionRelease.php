<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * VersionRelease —— 对应数据表 version_releases
 *
 * @property string $id
 * @property string $version
 * @property string $title
 * @property string|null $summary
 * @property string $body
 * @property string $release_type
 * @property string $released_at
 * @property string $status
 * @property int $sort_order
 * @property string|null $created_by
 * @property string $created_at
 * @property string $updated_at
 *
 * @mixin \think\Model
 */
class VersionRelease extends Model
{
    // 数据表（表名为复数，与默认蛇形命名不同，需显式指定）
    protected $table = 'version_releases';

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
        'released_at' => 'datetime',
        'sort_order' => 'integer',
        'created_by' => 'string',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];
}
