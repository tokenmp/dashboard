<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * UserReleaseRead —— 对应数据表 user_release_reads
 *
 * @property string $id
 * @property string $user_id
 * @property string $release_id
 * @property string $read_at
 *
 * @mixin \think\Model
 */
class UserReleaseRead extends Model
{
    // 数据表（表名为复数，与默认蛇形命名不同，需显式指定）
    protected $table = 'user_release_reads';

    // 主键（uuid DEFAULT gen_random_uuid）
    protected $pk = 'id';

    // 使用 pgsql 连接（见 config/database.php 中 'pgsql' 配置）
    protected $connection = 'pgsql';

    // 本表无 created_at/updated_at，关闭自动时间戳
    protected $autoWriteTimestamp = false;

    // 字段类型转换
    protected $type = [
        'id' => 'string',
        'user_id' => 'string',
        'release_id' => 'string',
        'read_at' => 'datetime',
    ];
}
