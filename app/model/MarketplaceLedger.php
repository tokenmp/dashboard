<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * 市场账户流水
 *
 * 市场模块的账户流水账本，按用户逐笔记账，复式记账。
 * 每条记录是某用户的一次资金进出——买家扣费、卖家奖励入账、平台抽成、提现、人工调账等，由业务类型区分，由状态表达资金是否生效、解冻或可提。
 * 它是 P2P 分账链路的末端，一笔结算通常会派生出买家扣费、卖家奖励、平台费等多条流水。
 * 靠预计解冻时间实现奖励的延迟到账（如 T+1 解冻），并用幂等键杜绝重复入账。
 *
 * @property string      $id                  流水唯一主键。
 * @property string      $user_id             该笔流水归属的用户。
 * @property string|null $request_log_id      关联的请求日志，人工调账或提现等无请求场景留空。
 * @property string|null $request_attempt_id  关联的请求尝试。
 * @property string|null $listing_id          关联的挂单。
 * @property string|null $settlement_id       关联的结算单，凡由结算派生的流水都必填。
 * @property string      $entry_type          业务类型，如买家扣费、卖家奖励入账或解冻、卖家奖励冲回、平台抽成、人工调账、提现等。
 * @property float       $amount              金额，正负含义随业务类型而定，例如扣费为支出、奖励为收入。
 * @property string      $currency            币种，默认人民币。
 * @property string      $status              流水状态，默认为待生效（pending），还可为已解冻（available）、已完结（completed）、已撤销（reversed）或冻结（frozen）。
 * @property string|null $available_at        预计或实际的解冻时间，是待生效转为已解冻的触发点。
 * @property string      $idempotency_key     幂等键，全局唯一，防止同一结算事件重复入账。
 * @property array       $metadata            扩展信息，如 token 明细、原因备注等，默认为空对象。
 * @property string      $created_at          创建时间。
 *
 * @mixin \think\Model
 */
class MarketplaceLedger extends Model
{
    // 数据表（表名为复数，与默认蛇形命名不同，需显式指定）
    protected $table = 'marketplace_ledger';

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
        'request_attempt_id' => 'string',
        'listing_id' => 'string',
        'settlement_id' => 'string',
        'amount' => 'float',
        'available_at' => 'datetime',
        'metadata' => 'json',
        'created_at' => 'datetime',
    ];

    // ==================== 关联关系 ====================

    /** 所属 MarketplaceListing（外键 marketplace_ledger.listing_id） @return \think\model\relation\BelongsTo */
    public function listing(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(MarketplaceListing::class, 'listing_id', 'id');
    }

    /** 所属 MarketplaceRequestSettlement（外键 marketplace_ledger.settlement_id） @return \think\model\relation\BelongsTo */
    public function settlement(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(MarketplaceRequestSettlement::class, 'settlement_id', 'id');
    }

    /** 所属 User（外键 marketplace_ledger.user_id） @return \think\model\relation\BelongsTo */
    public function user(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id', 'id');
    }
}
