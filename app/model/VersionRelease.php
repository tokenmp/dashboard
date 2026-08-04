<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * version_releases —— 版本发布说明（产品更新日志／Changelog）
 *
 * 由管理端维护的版本更新条目，前端用于展示「更新日志／新版本提示」。
 * 版本号全局唯一；
 * 另一张 user_release_reads 表记录每个用户对每条发布的已读状态，未读即触发「有新版本」的提示。
 * 展示与排序通常依据发布状态、发布时间与排序权重。
 *
 * @property string      $id            发布主键，全局唯一标识
 * @property string      $version       版本号，全局唯一
 * @property string      $title         版本标题
 * @property string|null $summary       摘要，一句话概述本次更新
 * @property string      $body          正文，即详细的更新内容（通常为 markdown）
 * @property string      $release_type  发布类型，例如 feature、improvement、fix、security
 * @property string      $released_at   发布时间，是展示与排序的基准
 * @property string      $status        发布状态，例如 draft（草稿）、published（已发布）、archived（已归档）
 * @property int         $sort_order    排序权重
 * @property string|null $created_by    创建人，即发布该版本的管理员
 * @property string      $created_at    创建时间
 * @property string      $updated_at    最近更新时间
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
