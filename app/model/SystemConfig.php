<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * system_config —— 系统配置（键到 JSON 值的运行时配置存储）
 *
 * 由管理端维护的运行时键值配置，执行面与管理面共享读取。
 * 值统一以 JSON 存储，数字、布尔、字符串皆可。
 * 敏感配置（如验证码密钥、SMTP 密码）为只写：列表与详情只返回脱敏后的元数据，更新时传空串表示「保持原值不变」。
 * 配置重载时会推进整体配置版本号与执行器缓存版本号，通知执行器运行时重新加载。
 *
 * @property string $key         配置项名，作为主键，同时也是唯一标识
 * @property array  $value       配置值，以 JSON 存储，可以是数字、布尔或字符串
 * @property string $updated_at  最后更新时间
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
