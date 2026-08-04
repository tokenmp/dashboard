<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * UpstreamRouteGroupMembership —— 对应数据表 upstream_route_group_memberships
 *
 * @property string $id
 * @property string $upstream_model_mapping_id
 * @property string $route_group_id
 * @property string $status
 * @property string $created_at
 * @property string $updated_at
 *
 * @mixin \think\Model
 */
class UpstreamRouteGroupMembership extends Model
{
    // 数据表（表名为复数，与默认蛇形命名不同，需显式指定）
    protected $table = 'upstream_route_group_memberships';

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
        'upstream_model_mapping_id' => 'string',
        'route_group_id' => 'string',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    // ==================== 关联关系 ====================

    /** 所属 RouteGroup（外键 upstream_route_group_memberships.route_group_id） @return \think\model\relation\BelongsTo */
    public function routeGroup(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(RouteGroup::class, 'route_group_id', 'id');
    }

    /** 所属 UpstreamModelMapping（外键 upstream_route_group_memberships.upstream_model_mapping_id） @return \think\model\relation\BelongsTo */
    public function upstreamModelMapping(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(UpstreamModelMapping::class, 'upstream_model_mapping_id', 'id');
    }
}
