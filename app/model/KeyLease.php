<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * 上游密钥租约表（key_leases）—— 控制单把上游密钥的在途并发数
 *
 * 执行面转发请求到上游前，向目标上游密钥申请租约：活跃且未过期的租约数达到并发上限则拒绝，否则写入一条带 TTL 的新租约。
 * 请求完成置 released，超时由后台批量置 expired。
 * 本质是上游并发节流的运行时账本。
 *
 * @property string      $id               租约 ID（UUID 主键）
 * @property string      $upstream_key_id  占用的上游渠道密钥 ID
 * @property string|null $request_log_id   触发该租约的请求日志 ID（软关联）
 * @property string      $status           状态：active（在用）/ released / expired
 * @property string      $expires_at       租约自动过期时间（创建时按 TTL 设定）
 * @property string      $created_at       租约创建时间
 * @property string|null $released_at      实际释放或过期清理时回写的时间
 *
 * @mixin \think\Model
 */
class KeyLease extends Model
{
    // 数据表（表名为复数，与默认蛇形命名不同，需显式指定）
    protected $table = 'key_leases';

    // 主键（uuid DEFAULT gen_random_uuid）
    protected $pk = 'id';

    // 使用 pgsql 连接（见 config/database.php 中 'pgsql' 配置）
    protected $connection = 'pgsql';

    // 自动时间戳（created_at / updated_at，非默认 create_time/update_time）
    protected $autoWriteTimestamp = 'datetime';
    protected $createTime = 'created_at';
    protected $updateTime = false;

    // 字段类型转换
    protected $type = [
        'id' => 'string',
        'upstream_key_id' => 'string',
        'request_log_id' => 'string',
        'expires_at' => 'datetime',
        'created_at' => 'datetime',
        'released_at' => 'datetime',
    ];

    // ==================== 关联关系 ====================

    /** 所属 UpstreamKey（外键 key_leases.upstream_key_id） @return \think\model\relation\BelongsTo */
    public function upstreamKey(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(UpstreamKey::class, 'upstream_key_id', 'id');
    }
}
