<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * SystemConfig —— 对应数据表 system_config
 *
 * @property string $key
 * @property array $value
 * @property string $updated_at
 *
 * @mixin \think\Model
 */
class SystemConfig extends Model
{
    // 数据表（表名为复数，与默认蛇形命名不同，需显式指定）
    protected $table = 'system_config';

    // 主键（character varying）
    protected $pk = 'key';

    // 使用 pgsql 连接（见 config/database.php 中 'pgsql' 配置）
    protected $connection = 'pgsql';

    // 自动时间戳（created_at / updated_at，非默认 create_time/update_time）
    protected $autoWriteTimestamp = 'datetime';
    protected $createTime = false;
    protected $updateTime = 'updated_at';

    // 字段类型转换
    protected $type = [
        'value' => 'json',
        'updated_at' => 'datetime',
    ];
}
