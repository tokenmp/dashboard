<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * SchemaMigration —— 对应数据表 schema_migrations
 *
 * @property string $filename
 * @property string $applied_at
 *
 * @mixin \think\Model
 */
class SchemaMigration extends Model
{
    // 数据表（表名为复数，与默认蛇形命名不同，需显式指定）
    protected $table = 'schema_migrations';

    // 主键（text）
    protected $pk = 'filename';

    // 使用 pgsql 连接（见 config/database.php 中 'pgsql' 配置）
    protected $connection = 'pgsql';

    // 本表无 created_at/updated_at，关闭自动时间戳
    protected $autoWriteTimestamp = false;

    // 字段类型转换
    protected $type = [
        'applied_at' => 'datetime',
    ];
}
