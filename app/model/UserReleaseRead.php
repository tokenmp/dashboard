<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * 版本发布已读记录（user_release_reads）—— 更新日志的已读标记
 *
 * 记录每个用户已读过哪些版本发布条目，用于前端更新日志的已读/未读与红点提示。
 * 同一用户对同一发布至多一条，再次阅读通过覆盖更新刷新阅读时间。
 *
 * @property string $id          记录唯一标识
 * @property string $user_id     阅读用户
 * @property string $release_id  被阅读的版本发布标识
 * @property string $read_at     阅读时间点
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
