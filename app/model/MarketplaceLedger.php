<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * MarketplaceLedger —— 对应数据表 marketplace_ledger
 *
 * @property string $id
 * @property string $user_id
 * @property string|null $request_log_id
 * @property string|null $request_attempt_id
 * @property string|null $listing_id
 * @property string|null $settlement_id
 * @property string $entry_type
 * @property float $amount
 * @property string $currency
 * @property string $status
 * @property string|null $available_at
 * @property string $idempotency_key
 * @property array $metadata
 * @property string $created_at
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
