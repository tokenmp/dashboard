<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * RedeemCodeRedemption —— 对应数据表 redeem_code_redemptions
 *
 * @property string $id
 * @property string $redeem_code_id
 * @property string $user_id
 * @property int $token_amount
 * @property string|null $ledger_id
 * @property string $created_at
 * @property string|null $coding_plan_id
 * @property string|null $token_plan_id
 * @property string|null $coding_user_plan_id
 * @property string|null $token_user_plan_id
 * @property string|null $image_plan_id
 * @property string|null $image_user_plan_id
 *
 * @mixin \think\Model
 */
class RedeemCodeRedemption extends Model
{
    // 数据表（表名为复数，与默认蛇形命名不同，需显式指定）
    protected $table = 'redeem_code_redemptions';

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
        'redeem_code_id' => 'string',
        'user_id' => 'string',
        'token_amount' => 'integer',
        'ledger_id' => 'string',
        'created_at' => 'datetime',
        'coding_plan_id' => 'string',
        'token_plan_id' => 'string',
        'coding_user_plan_id' => 'string',
        'token_user_plan_id' => 'string',
        'image_plan_id' => 'string',
        'image_user_plan_id' => 'string',
    ];

    // ==================== 关联关系 ====================

    /** 所属 Plan（外键 redeem_code_redemptions.coding_plan_id） @return \think\model\relation\BelongsTo */
    public function codingPlan(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(Plan::class, 'coding_plan_id', 'id');
    }

    /** 所属 UserPlan（外键 redeem_code_redemptions.coding_user_plan_id） @return \think\model\relation\BelongsTo */
    public function codingUserPlan(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(UserPlan::class, 'coding_user_plan_id', 'id');
    }

    /** 所属 Plan（外键 redeem_code_redemptions.image_plan_id） @return \think\model\relation\BelongsTo */
    public function imagePlan(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(Plan::class, 'image_plan_id', 'id');
    }

    /** 所属 UserPlan（外键 redeem_code_redemptions.image_user_plan_id） @return \think\model\relation\BelongsTo */
    public function imageUserPlan(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(UserPlan::class, 'image_user_plan_id', 'id');
    }

    /** 所属 UsageLedger（外键 redeem_code_redemptions.ledger_id） @return \think\model\relation\BelongsTo */
    public function ledger(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(UsageLedger::class, 'ledger_id', 'id');
    }

    /** 所属 RedeemCode（外键 redeem_code_redemptions.redeem_code_id） @return \think\model\relation\BelongsTo */
    public function redeemCode(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(RedeemCode::class, 'redeem_code_id', 'id');
    }

    /** 所属 Plan（外键 redeem_code_redemptions.token_plan_id） @return \think\model\relation\BelongsTo */
    public function tokenPlan(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(Plan::class, 'token_plan_id', 'id');
    }

    /** 所属 UserPlan（外键 redeem_code_redemptions.token_user_plan_id） @return \think\model\relation\BelongsTo */
    public function tokenUserPlan(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(UserPlan::class, 'token_user_plan_id', 'id');
    }

    /** 所属 User（外键 redeem_code_redemptions.user_id） @return \think\model\relation\BelongsTo */
    public function user(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id', 'id');
    }
}
