<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * usage_ledger —— 用户用量与余额流水账本
 *
 * 这是平台唯一的「余额变动流水」表，按用户和计费套餐类型两个维度记账。
 * 凡是 token 充值、请求扣费、配额预留与退还、套餐发放／升级／续期／替换，都会写入一行带正负号的增减量。
 * 统计与用量概览通过对这些增量求和，就能还原出用户「已用／已充／剩余」。
 * 约定上扣费写负数，充值、退还与各类套餐操作写正数。
 *
 * @property string      $id              流水主键，全局唯一标识这笔变动
 * @property string      $user_id         这笔流水归属的用户，是记账的第一个维度
 * @property string|null $request_log_id  关联的请求日志；充值、套餐类等非请求场景为空
 * @property string      $ledger_type     流水类型，说明本次变动的方向与原因：reserve 为预扣预留，charge 为实际扣费，refund 为退还，recharge 为 token 充值，adjustment 为人工调整，plan_grant 为套餐到账，plan_upgrade 为套餐升级，plan_renew 为套餐续期，plan_replace 为套餐替换
 * @property string      $billing_plan    计费套餐类型，是记账的第二个维度：coding 为按请求次数计费的编码套餐，token 为按 token 量计费，image 为图像生成类（同样按 token 计费）
 * @property string      $token_delta     本次流水的 token 增减量，带符号，负数表示扣减
 * @property int         $request_delta   本次流水的请求次数增减量，主要由 coding 套餐使用，带符号，负数表示扣减
 * @property string|null $reason          人类可读的变动说明，例如「quota charge」「quota release」「quota reservation expired」或兑换码赠送套餐的到账备注
 * @property string      $created_at      流水产生时间；5 小时滚动窗口、日、周、月、总量等用量窗口都以此列划定
 *
 * @mixin \think\Model
 */
class UsageLedger extends Model
{
    // 数据表（表名为复数，与默认蛇形命名不同，需显式指定）
    protected $table = 'usage_ledger';

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
        'request_log_id' => 'string',
        'request_delta' => 'integer',
        'created_at' => 'datetime',
    ];

    // ==================== 关联关系 ====================

    /** 所属 User（外键 usage_ledger.user_id） @return \think\model\relation\BelongsTo */
    public function user(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id', 'id');
    }

    /** 拥有多条 RedeemCodeRedemption（外键 ledger_id） @return \think\model\relation\HasMany */
    public function redeemCodeRedemptions(): \think\model\relation\HasMany
    {
        return $this->hasMany(RedeemCodeRedemption::class, 'ledger_id', 'id');
    }
}
