<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * 套餐目录（plans）—— 管理员维护的可售卖套餐模板
 *
 * 由管理员在后台维护的套餐目录，每条记录定义一个套餐的计费类型、各类配额上限、价格、默认有效期，以及编程类套餐可调用的模型白名单。
 * 共分 coding、token、image 三类，计费口径与生效的配额字段各不相同。
 * 用户实际持有的是 user_plans 绑定，兑换码奖励也会指向这里的套餐。
 *
 * @property string      $id                     套餐唯一标识
 * @property string      $name                   套餐显示名，如「Coding Pro」
 * @property string      $plan_type              套餐计费类型，决定哪些配额字段生效：coding / token / image
 * @property int|null    $hourly_5h_limit        编程类套餐在 5 小时滚动窗口内的最大请求数，为空表示不限
 * @property int|null    $weekly_limit           编程类套餐每周最大请求数，为空表示不限
 * @property int|null    $monthly_limit          原「月限」，现已弃用，仅作总限的兼容别名
 * @property int|null    $token_limit            Token 类套餐的 token 额度上限
 * @property float       $price                  套餐价格，默认为 0
 * @property string      $status                 上下架状态：active（默认，可分配）/ disabled（下架）/ deleted（软删除）
 * @property string      $created_at             套餐创建时间
 * @property string      $updated_at             套餐最近更新时间
 * @property int|null    $default_duration_days  默认有效天数，用于计算用户绑定的过期时间，为空表示永久
 * @property array       $allowed_model_names    编程类套餐允许调用的模型名数组（白名单），其它类型为空数组
 * @property string|null $category               分类标签，历史遗留字段，当前业务未使用
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
