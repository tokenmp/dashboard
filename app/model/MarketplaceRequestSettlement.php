<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * 单次请求结算
 *
 * 买家每经一个上线挂单发起一次请求，结算后落一条结算单，记录本次 token 消费与三方分账金额。
 * 结算时会快照挂单的单价、奖励和费率，以防日后改价篡改历史，再乘以本次实际 token 数，算出买家实付、卖家奖励、平台抽成。
 * 它在 P2P 分账链路中承接挂单、派生账本流水，是承上启下的一环。
 * 状态从待结算（pending）走到已解冻（available），异常路径为已撤销（reversed）或争议中（disputed）。
 * 一个请求最多一笔结算。
 *
 * @property string      $id                           结算单唯一主键。
 * @property string      $request_log_id               关联的请求日志，一个请求至多对应一笔结算。
 * @property string|null $request_attempt_id           关联的具体请求尝试，一次请求可能多次尝试。
 * @property string      $listing_id                   本次消费的挂单，按结算时刻快照引用。
 * @property string      $consumer_user_id             买家，即消费方。
 * @property string      $supplier_user_id             卖家，即供应方、Key 归属人。
 * @property string      $upstream_key_id              实际承载本次请求的上游 Key。
 * @property string      $input_tokens                 本次输入 token 数，默认为零。
 * @property string      $output_tokens                本次输出 token 数，默认为零。
 * @property string      $cache_tokens                 本次缓存命中的 token 数，默认为零。
 * @property float       $input_sale_price_per_token   快照下来的买家输入 token 单价。
 * @property float       $output_sale_price_per_token  快照下来的买家输出 token 单价。
 * @property float       $input_reward_per_token       快照下来的卖家输入 token 奖励单价。
 * @property float       $output_reward_per_token      快照下来的卖家输出 token 奖励单价。
 * @property float       $consumer_amount              买家本次实付金额。
 * @property float       $supplier_reward              卖家本次应收奖励。
 * @property float       $platform_fee                 平台本次抽成金额。
 * @property string      $currency                     币种，默认人民币。
 * @property string      $usage_source                 token 数的来源，可为上游返回（upstream）、平台分词器（platform_tokenizer）、估算（estimated）或人工（manual）。
 * @property string      $status                       结算状态，默认为待结算（pending），还可为已解冻（available）、已撤销（reversed）或争议中（disputed）。
 * @property string|null $settled_at                   结算完成（转入解冻）的时间。
 * @property string      $created_at                   创建时间。
 *
 * @mixin \think\Model
 */
class MarketplaceRequestSettlement extends Model
{
    // 数据表（表名为复数，与默认蛇形命名不同，需显式指定）
    protected $table = 'marketplace_request_settlements';

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
        'request_log_id' => 'string',
        'request_attempt_id' => 'string',
        'listing_id' => 'string',
        'consumer_user_id' => 'string',
        'supplier_user_id' => 'string',
        'upstream_key_id' => 'string',
        'input_sale_price_per_token' => 'float',
        'output_sale_price_per_token' => 'float',
        'input_reward_per_token' => 'float',
        'output_reward_per_token' => 'float',
        'consumer_amount' => 'float',
        'supplier_reward' => 'float',
        'platform_fee' => 'float',
        'settled_at' => 'datetime',
        'created_at' => 'datetime',
    ];

    // ==================== 关联关系 ====================

    /** 所属 User（外键 marketplace_request_settlements.consumer_user_id） @return \think\model\relation\BelongsTo */
    public function consumerUser(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(User::class, 'consumer_user_id', 'id');
    }

    /** 所属 MarketplaceListing（外键 marketplace_request_settlements.listing_id） @return \think\model\relation\BelongsTo */
    public function listing(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(MarketplaceListing::class, 'listing_id', 'id');
    }

    /** 所属 User（外键 marketplace_request_settlements.supplier_user_id） @return \think\model\relation\BelongsTo */
    public function supplierUser(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(User::class, 'supplier_user_id', 'id');
    }

    /** 所属 UpstreamKey（外键 marketplace_request_settlements.upstream_key_id） @return \think\model\relation\BelongsTo */
    public function upstreamKey(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(UpstreamKey::class, 'upstream_key_id', 'id');
    }

    /** 拥有多条 MarketplaceLedger（外键 settlement_id） @return \think\model\relation\HasMany */
    public function marketplaceLedger(): \think\model\relation\HasMany
    {
        return $this->hasMany(MarketplaceLedger::class, 'settlement_id', 'id');
    }
}
