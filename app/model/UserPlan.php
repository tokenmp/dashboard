<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * UserPlan —— 对应数据表 user_plans
 *
 * @property string $id
 * @property string $user_id
 * @property string $plan_id
 * @property string $plan_type
 * @property string $status
 * @property string $activated_at
 * @property string|null $expires_at
 * @property string $created_at
 *
 * @mixin \think\Model
 */
class UserPlan extends Model
{
    // 数据表（表名为复数，与默认蛇形命名不同，需显式指定）
    protected $table = 'user_plans';

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
        'plan_id' => 'string',
        'activated_at' => 'datetime',
        'expires_at' => 'datetime',
        'created_at' => 'datetime',
    ];

    // ==================== 关联关系 ====================

    /** 所属 Plan（外键 user_plans.plan_id） @return \think\model\relation\BelongsTo */
    public function plan(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(Plan::class, 'plan_id', 'id');
    }

    /** 所属 User（外键 user_plans.user_id） @return \think\model\relation\BelongsTo */
    public function user(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id', 'id');
    }

    /** 拥有多条 RedeemCodeRedemption（外键 coding_user_plan_id） @return \think\model\relation\HasMany */
    public function codingRedemptions(): \think\model\relation\HasMany
    {
        return $this->hasMany(RedeemCodeRedemption::class, 'coding_user_plan_id', 'id');
    }

    /** 拥有多条 RedeemCodeRedemption（外键 image_user_plan_id） @return \think\model\relation\HasMany */
    public function imageRedemptions(): \think\model\relation\HasMany
    {
        return $this->hasMany(RedeemCodeRedemption::class, 'image_user_plan_id', 'id');
    }

    /** 拥有多条 RequestLog（外键 billing_user_plan_id） @return \think\model\relation\HasMany */
    public function requestLogs(): \think\model\relation\HasMany
    {
        return $this->hasMany(RequestLog::class, 'billing_user_plan_id', 'id');
    }

    /** 拥有多条 RedeemCodeRedemption（外键 token_user_plan_id） @return \think\model\relation\HasMany */
    public function tokenRedemptions(): \think\model\relation\HasMany
    {
        return $this->hasMany(RedeemCodeRedemption::class, 'token_user_plan_id', 'id');
    }
}
