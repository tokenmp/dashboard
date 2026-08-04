<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * announcements —— 站内公告（管理端发布、面向全站或指定范围展示的横幅通知）
 *
 * 由管理后台维护的公告条目，前端按发布状态、展示范围、生效时间窗与排序权重拉取展示。
 * 严重级别决定前端样式，是否可关闭决定用户能否手动消除横幅。
 *
 * @property string      $id             公告主键，全局唯一标识
 * @property string      $title          公告标题
 * @property string      $body           公告正文
 * @property string      $severity       严重级别，决定前端样式，例如 info、warning、urgent
 * @property string      $scope          展示范围，例如 all 表示全站，也可指定特定页面
 * @property bool        $dismissible    用户是否可手动关闭该公告
 * @property string      $status         发布状态，例如 draft（草稿）、published（已发布）、archived（已归档）
 * @property int         $sort_order     排序权重，数值越小越靠前
 * @property string      $publish_from   生效起始时间
 * @property string|null $publish_until  生效截止时间，留空表示长期有效
 * @property string|null $created_by     创建人，即发布该公告的管理员
 * @property string      $created_at     创建时间
 * @property string      $updated_at     最近更新时间
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
