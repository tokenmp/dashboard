<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * 路由组（route_groups）—— 命名路由池
 *
 * 把同一批上游模型映射归到命名的池子里，让请求通过路由组名选择不同池子（如 default、灰度组、专用组）。
 * 系统内置组（如 default，is_system=true）受保护，不可随意删除；
 * 组名在未软删记录内大小写不敏感且唯一。
 *
 * @property string      $id            路由组 ID（UUID 主键）
 * @property string      $name          组标识名，路由按其命中；为空时执行器回退 default，在未软删记录内大小写不敏感且唯一
 * @property string|null $display_name  展示名；可空
 * @property string|null $description   描述；可空
 * @property bool        $is_system     是否系统内置组（如 default，受保护），默认否
 * @property string      $status        状态：active（默认）/ disabled / deleted（软删）
 * @property string      $created_at    创建时间
 * @property string      $updated_at    更新时间
 *
 * @mixin \think\Model
 */
class RouteGroup extends Model
{
    // 数据表（表名为复数，与默认蛇形命名不同，需显式指定）
    protected $table = 'route_groups';

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
        'is_system' => 'bool',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    // ==================== 关联关系 ====================

    /** 拥有多条 UpstreamRouteGroupMembership（外键 route_group_id） @return \think\model\relation\HasMany */
    public function upstreamRouteGroupMemberships(): \think\model\relation\HasMany
    {
        return $this->hasMany(UpstreamRouteGroupMembership::class, 'route_group_id', 'id');
    }
}
