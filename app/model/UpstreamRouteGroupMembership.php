<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * 上游映射归属路由组（upstream_route_group_memberships）—— 多对多归属
 *
 * 描述「某条上游模型映射属于哪些路由组」的多对多归属关系。
 * 路由只有同时命中活跃的映射与活跃的路由组才会被选中——即一个映射若不归属任何活跃路由组则永远不可达；
 * 同一（映射、路由组）在未软删记录内唯一，重复加入会自动重新启用。
 *
 * @property string $id                         归属关系 ID（UUID 主键）
 * @property string $upstream_model_mapping_id  归属的上游模型映射 ID
 * @property string $route_group_id             归属的路由组 ID
 * @property string $status                     状态：active（默认）/ disabled / deleted（软删）
 * @property string $created_at                 创建时间
 * @property string $updated_at                 更新时间
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
