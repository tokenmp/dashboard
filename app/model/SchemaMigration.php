<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * schema_migrations —— 数据库迁移记录（记录已应用的迁移文件名与时间）
 *
 * golang-migrate 风格的迁移台账。
 * 每执行一个迁移脚本就写入一行文件名与应用时间，文件名作为主键用于判断某个迁移是否已被应用。
 * dashboard 侧只读这张表用于展示与对账。
 *
 * @property string $filename    迁移文件名，作为唯一标识，用于判断该迁移是否已应用
 * @property string $applied_at  迁移应用时间
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
