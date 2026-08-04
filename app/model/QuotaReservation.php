<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * quota_reservations —— 配额预留（请求开始时预扣、结束时结算或释放的暂存）
 *
 * 用户请求进入执行器后，系统会先按预估用量预扣一笔配额，写一行状态为 reserved 的记录，存放预扣的请求数或 token 数，并设一个过期保护时间。
 * 请求正常完成后结算并写入最终用量、置为 finalized；
 * 中途取消则置为 released，随后会补一条退还账本；
 * 到了保护时间仍未结算，则被后台批量标记为 expired。
 * 可用额度查询会先扣除当前仍处于 reserved 的行，防止并发超卖。
 *
 * @property string      $id                 预留主键，全局唯一标识
 * @property string      $user_id            这笔预留归属的用户
 * @property string|null $request_log_id     触发本次预留的请求日志
 * @property string      $billing_plan       计费套餐类型，与 usage_ledger 一致：coding、token 或 image
 * @property string      $status             预留的生命周期状态：reserved 表示预扣中，finalized 表示已结算，released 表示已释放（随后会退还账本），expired 表示超时未结算
 * @property int         $reserved_requests  预扣的请求次数，供 coding 套餐使用
 * @property string      $reserved_tokens    预扣的 token 数，供 token 与 image 套餐使用
 * @property int|null    $final_requests     结算时确定的最终请求次数；扣费时会据此回填账本
 * @property int|null    $final_tokens       结算时确定的最终 token 数
 * @property string      $expires_at         过期保护时间，超过此时间仍处于 reserved 的记录会被标记为 expired
 * @property string      $created_at         创建时间；存在多个套餐时，会按它落在套餐激活期内的先后判定归因
 * @property string|null $finalized_at       结算、释放或过期的时间，三种终态共用此列
 *
 * @mixin \think\Model
 */
class QuotaReservation extends Model
{
    // 数据表（表名为复数，与默认蛇形命名不同，需显式指定）
    protected $table = 'quota_reservations';

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
        'reserved_requests' => 'integer',
        'final_requests' => 'integer',
        'final_tokens' => 'integer',
        'expires_at' => 'datetime',
        'created_at' => 'datetime',
        'finalized_at' => 'datetime',
    ];

    // ==================== 关联关系 ====================

    /** 所属 User（外键 quota_reservations.user_id） @return \think\model\relation\BelongsTo */
    public function user(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id', 'id');
    }
}
