<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * 用户风险重置（user_risk_resets）—— 风控赦免审计记录
 *
 * 管理员对某用户某类派生风险执行重置时留下的审计标记，作用是一个时间分界点：风控判定时只统计该时间点之后的同类风险日志，相当于赦免其历史风险。
 * 当前已知风险类型为 client_cancel（客户端频繁取消）。
 *
 * @property string      $id             记录唯一标识
 * @property string      $user_id        被重置风险的用户
 * @property string      $risk_type      风险类型，已知取值为 client_cancel（客户端取消风险）
 * @property string      $reset_at       重置生效时间点，早于此点的同类风险日志不再计入风控
 * @property string|null $admin_user_id  执行重置的管理员，可为空
 * @property string      $reason         重置原因或备注，默认为「manual admin unblock」
 * @property string      $created_at     记录创建时间
 *
 * @mixin \think\Model
 */
class UserRiskReset extends Model
{
    // 数据表（表名为复数，与默认蛇形命名不同，需显式指定）
    protected $table = 'user_risk_resets';

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
        'user_id' => 'string',
        'reset_at' => 'datetime',
        'admin_user_id' => 'string',
        'created_at' => 'datetime',
    ];

    // ==================== 关联关系 ====================

    /** 所属 User（外键 user_risk_resets.admin_user_id） @return \think\model\relation\BelongsTo */
    public function adminUser(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(User::class, 'admin_user_id', 'id');
    }

    /** 所属 User（外键 user_risk_resets.user_id） @return \think\model\relation\BelongsTo */
    public function user(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id', 'id');
    }
}
