<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * 兑换码
 *
 * 管理员发放的兑换码，可给用户充值 token 余额，也可发放 coding、token、image 三类套餐奖励，一个码可同时携带多种奖励。
 * 兑换在单事务内原子完成：先校验未过期、未兑完、未重复兑换，再按覆盖模式（替换或仅升级）处理新旧套餐以防降级，随后升级或续期、替换用户套餐，写入 token 充值与套餐入账流水，落兑换记录并把已兑次数加一。
 * 码本体以哈希存储用于查找，另留可选明文便于后台展示与检索。
 *
 * @property string      $id               兑换码唯一主键。
 * @property string      $name             兑换码名称，供管理后台使用。
 * @property string      $code_hash        码的哈希值，兑换时据此查找，全局唯一。
 * @property string|null $code_prefix      码前缀，用于脱敏展示。
 * @property string|null $code_suffix      码后缀，用于脱敏展示。
 * @property int         $token_amount     兑换后充入用户 token 余额的数量，需大于零或至少配一个套餐奖励。
 * @property int         $max_redemptions  最大兑换次数，默认为 1。
 * @property int         $redeemed_count   已兑换次数，不会超过上限。
 * @property string      $status           状态，默认为有效（active），还可为停用（disabled）或删除（deleted）。
 * @property string|null $expires_at       过期时间，兑换时需尚未过期。
 * @property string|null $created_by       创建该码的管理员。
 * @property string      $created_at       创建时间。
 * @property string      $updated_at       更新时间。
 * @property string|null $coding_plan_id   奖励的 coding 套餐。
 * @property string|null $token_plan_id    奖励的 token 套餐。
 * @property string|null $starts_at        生效开始时间，兑换时需已到生效时间。
 * @property string      $override_mode    token 套餐的覆盖模式，默认为替换（replace，替换现有 token 套餐），还可为仅升级（upgrade_only，仅在无现有套餐时新建）。
 * @property string|null $image_plan_id    奖励的 image 套餐。
 * @property string|null $code_plaintext   码的明文，便于后台检索与展示。
 * @property int|null    $duration_days    自定义套餐有效天数，留空则沿用套餐的默认天数。
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
