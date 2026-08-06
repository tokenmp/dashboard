<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * 兑换记录
 *
 * 用户成功兑换兑换码后落一条记录，记录本次实发奖励的快照。
 * 同一用户对同一码只能兑一次。
 * 它既快照码上配置的套餐，又指向本次实际新建、续期或替换后的用户套餐行，便于追溯到底改了哪条套餐。
 * 它是兑换码充值与发套餐链路的末端审计凭证；
 * 本表无状态字段，一次成功兑换即一条不可变记录，撤销或冲正走用量流水的反向记录，不在此标记。
 *
 * @property string      $id                   兑换记录唯一主键。
 * @property string      $redeem_code_id       被兑换的码。
 * @property string      $user_id              兑换人。
 * @property int         $token_amount         本次实充的 token 数，快照自码上的配置，默认为零。
 * @property string|null $ledger_id            本次兑换在用量流水中的代表流水，优先取 token 充值流水，无充值则取首条套餐入账流水。
 * @property string      $created_at           兑换时间。
 * @property string|null $coding_plan_id       快照下来的码上 coding 套餐。
 * @property string|null $token_plan_id        快照下来的码上 token 套餐。
 * @property string|null $coding_user_plan_id  本次实际生效的 coding 用户套餐行。
 * @property string|null $token_user_plan_id   本次实际生效的 token 用户套餐行。
 * @property string|null $image_plan_id        快照下来的码上 image 套餐。
 * @property string|null $image_user_plan_id   本次实际生效的 image 用户套餐行。
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
        'code' => 'string',
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
