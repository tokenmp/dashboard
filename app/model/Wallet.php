<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * wallets —— 用户钱包的物化余额（按量轨）
 *
 * 按量轨以人民币元计量，余额直接存物化列而非实时 SUM 账本。
 * `balance_cny` 是可用余额，`frozen_cny` 是预扣冻结，总额 = 两者之和（见设计文档 §3.2）。
 * 每次余额变动都必须同时写一行 `wallet_ledger` 供对账；`version` 供乐观锁使用。
 *
 * @property string $user_id    用户 ID，同时是主键
 * @property string $balance_cny 可用余额（元）
 * @property string $frozen_cny  预扣冻结金额（元）
 * @property int    $version     乐观锁版本号，每次变动 +1
 * @property string $currency    币种，默认 CNY
 * @property string $created_at  创建时间
 * @property string $updated_at  更新时间
 *
 * @mixin \think\Model
 */
class Wallet extends Model
{
    // 数据表（表名为复数，与默认蛇形命名不同，需显式指定）
    protected $table = 'wallets';

    // 主键为 user_id（一人一行，无独立 id 列）
    protected $pk = 'user_id';

    // 使用 pgsql 连接（见 config/database.php 中 'pgsql' 配置）
    protected $connection = 'pgsql';

    // 自动时间戳（created_at / updated_at，非默认 create_time/update_time）
    protected $autoWriteTimestamp = 'datetime';
    protected $createTime = 'created_at';
    protected $updateTime = 'updated_at';

    // 字段类型转换（NUMERIC 保留字符串避免精度丢失）
    protected $type = [
        'user_id' => 'string',
        'version' => 'integer',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    // ==================== 关联关系 ====================

    /** 所属 User（外键 wallets.user_id） @return \think\model\relation\BelongsTo */
    public function user(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id', 'id');
    }
}
