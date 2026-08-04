<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * Plan —— 对应数据表 plans
 *
 * @property string $id
 * @property string $name
 * @property string $plan_type
 * @property int|null $hourly_5h_limit
 * @property int|null $weekly_limit
 * @property int|null $monthly_limit
 * @property int|null $token_limit
 * @property float $price
 * @property string $status
 * @property string $created_at
 * @property string $updated_at
 * @property int|null $default_duration_days
 * @property array $allowed_model_names
 * @property string|null $category
 *
 * @mixin \think\Model
 */
class Plan extends Model
{
    // 数据表（表名为复数，与默认蛇形命名不同，需显式指定）
    protected $table = 'plans';

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
        'hourly_5h_limit' => 'integer',
        'weekly_limit' => 'integer',
        'monthly_limit' => 'integer',
        'token_limit' => 'integer',
        'price' => 'float',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
        'default_duration_days' => 'integer',
        'allowed_model_names' => 'json',
    ];

    // ==================== 关联关系 ====================

    /** 拥有多条 RedeemCode（外键 coding_plan_id） @return \think\model\relation\HasMany */
    public function codingRedeemCodes(): \think\model\relation\HasMany
    {
        return $this->hasMany(RedeemCode::class, 'coding_plan_id', 'id');
    }

    /** 拥有多条 RedeemCodeRedemption（外键 coding_plan_id） @return \think\model\relation\HasMany */
    public function codingRedemptions(): \think\model\relation\HasMany
    {
        return $this->hasMany(RedeemCodeRedemption::class, 'coding_plan_id', 'id');
    }

    /** 拥有多条 RedeemCode（外键 image_plan_id） @return \think\model\relation\HasMany */
    public function imageRedeemCodes(): \think\model\relation\HasMany
    {
        return $this->hasMany(RedeemCode::class, 'image_plan_id', 'id');
    }

    /** 拥有多条 RedeemCodeRedemption（外键 image_plan_id） @return \think\model\relation\HasMany */
    public function imageRedemptions(): \think\model\relation\HasMany
    {
        return $this->hasMany(RedeemCodeRedemption::class, 'image_plan_id', 'id');
    }

    /** 拥有多条 RequestLog（外键 billing_plan_id） @return \think\model\relation\HasMany */
    public function requestLogs(): \think\model\relation\HasMany
    {
        return $this->hasMany(RequestLog::class, 'billing_plan_id', 'id');
    }

    /** 拥有多条 RedeemCode（外键 token_plan_id） @return \think\model\relation\HasMany */
    public function tokenRedeemCodes(): \think\model\relation\HasMany
    {
        return $this->hasMany(RedeemCode::class, 'token_plan_id', 'id');
    }

    /** 拥有多条 RedeemCodeRedemption（外键 token_plan_id） @return \think\model\relation\HasMany */
    public function tokenRedemptions(): \think\model\relation\HasMany
    {
        return $this->hasMany(RedeemCodeRedemption::class, 'token_plan_id', 'id');
    }

    /** 拥有多条 UserPlan（外键 plan_id） @return \think\model\relation\HasMany */
    public function userPlans(): \think\model\relation\HasMany
    {
        return $this->hasMany(UserPlan::class, 'plan_id', 'id');
    }
}
