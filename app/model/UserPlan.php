<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * 用户套餐绑定（user_plans）—— 用户实际持有的套餐实例
 *
 * 把某个套餐发放给用户后产生的一条绑定记录，代表用户持有的一个套餐实例，记录其生效状态与起止时间。
 * Token 类套餐对同一用户互斥（分配新套餐会先停用旧的同类绑定），编程类与图像类可叠加持有多个有效实例；
 * 过期时间为空表示永久有效。
 *
 * @property string      $id            绑定记录唯一标识
 * @property string      $user_id       持有该套餐的用户
 * @property string      $plan_id       关联的套餐模板
 * @property string      $plan_type     冗余存储的套餐类型：coding / token / image，便于按类型筛选与替换
 * @property string      $status        绑定状态：active（默认，当前生效）/ disabled（已取消或被替换）/ expired（已过期）
 * @property string      $activated_at  生效起始时间，续期或批量改期时可重设
 * @property string|null $expires_at    过期时间，为空表示永久有效
 * @property string      $created_at    绑定创建时间
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
