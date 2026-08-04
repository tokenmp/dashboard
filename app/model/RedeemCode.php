<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * RedeemCode —— 对应数据表 redeem_codes
 *
 * @property string $id
 * @property string $name
 * @property string $code_hash
 * @property string|null $code_prefix
 * @property string|null $code_suffix
 * @property int $token_amount
 * @property int $max_redemptions
 * @property int $redeemed_count
 * @property string $status
 * @property string|null $expires_at
 * @property string|null $created_by
 * @property string $created_at
 * @property string $updated_at
 * @property string|null $coding_plan_id
 * @property string|null $token_plan_id
 * @property string|null $starts_at
 * @property string $override_mode
 * @property string|null $image_plan_id
 * @property string|null $code_plaintext
 * @property int|null $duration_days
 *
 * @mixin \think\Model
 */
class RedeemCode extends Model
{
    // 数据表（表名为复数，与默认蛇形命名不同，需显式指定）
    protected $table = 'redeem_codes';

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
        'token_amount' => 'integer',
        'max_redemptions' => 'integer',
        'redeemed_count' => 'integer',
        'expires_at' => 'datetime',
        'created_by' => 'string',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
        'coding_plan_id' => 'string',
        'token_plan_id' => 'string',
        'starts_at' => 'datetime',
        'image_plan_id' => 'string',
        'duration_days' => 'integer',
    ];

    // ==================== 关联关系 ====================

    /** 所属 Plan（外键 redeem_codes.coding_plan_id） @return \think\model\relation\BelongsTo */
    public function codingPlan(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(Plan::class, 'coding_plan_id', 'id');
    }

    /** 所属 User（外键 redeem_codes.created_by） @return \think\model\relation\BelongsTo */
    public function createdBy(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by', 'id');
    }

    /** 所属 Plan（外键 redeem_codes.image_plan_id） @return \think\model\relation\BelongsTo */
    public function imagePlan(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(Plan::class, 'image_plan_id', 'id');
    }

    /** 所属 Plan（外键 redeem_codes.token_plan_id） @return \think\model\relation\BelongsTo */
    public function tokenPlan(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(Plan::class, 'token_plan_id', 'id');
    }

    /** 拥有多条 RedeemCodeRedemption（外键 redeem_code_id） @return \think\model\relation\HasMany */
    public function redeemCodeRedemptions(): \think\model\relation\HasMany
    {
        return $this->hasMany(RedeemCodeRedemption::class, 'redeem_code_id', 'id');
    }
}
