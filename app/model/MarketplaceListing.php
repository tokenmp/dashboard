<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * 市场挂单
 *
 * P2P 转售市场的「商品上架」表。
 * 卖家把自己名下一个上游「Key＋模型」映射挂出来转卖：标好向买家收取的单价、留给自己的奖励单价，以及平台抽成比例，提交审核后即可上架。
 * 买家经此挂单消费时按 token 计费——买家付款、卖家拿奖励、平台抽佣。
 * 在挂单→结算→账本流水的整条分账链路里，它是第一环。
 * 挂单走完整审核生命周期：草稿、待审、通过或驳回、上线、暂停、封禁。
 * 同一卖家对同一映射只能挂一单。
 *
 * @property string      $id                           挂单唯一主键。
 * @property string      $seller_user_id               卖家，即被挂卖的上游 Key 归属人。
 * @property string      $upstream_model_mapping_id    挂卖的上游映射，即「Key＋模型」的组合。
 * @property float       $input_sale_price_per_token   向买家收取的输入 token 单价，为非负数。
 * @property float       $output_sale_price_per_token  向买家收取的输出 token 单价，为非负数。
 * @property float       $input_reward_per_token       给卖家的输入 token 奖励单价，不得超过对应的买家单价。
 * @property float       $output_reward_per_token      给卖家的输出 token 奖励单价，不得超过对应的买家单价。
 * @property float       $platform_fee_rate            平台抽成比例，占成交额的份额，默认为零，介于 0 到 1 之间。
 * @property string      $currency                     币种，默认人民币。
 * @property int|null    $daily_token_limit            卖家自设的每日 token 消费上限，留空则不限。
 * @property int|null    $monthly_token_limit          卖家自设的每月 token 消费上限，留空则不限。
 * @property string      $status                       挂单状态，默认为草稿（draft），还可为待审（pending）、通过（approved）、驳回（rejected）、上线（online）、暂停（paused）或封禁（suspended）。
 * @property string|null $reviewed_by                  审核人。
 * @property string|null $reviewed_at                  审核时间。
 * @property string|null $published_at                 转入上线状态的时间。
 * @property string      $created_at                   创建时间。
 * @property string      $updated_at                   更新时间。
 *
 * @mixin \think\Model
 */
class MarketplaceListing extends Model
{
    // 数据表（表名为复数，与默认蛇形命名不同，需显式指定）
    protected $table = 'marketplace_listings';

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
        'seller_user_id' => 'string',
        'upstream_model_mapping_id' => 'string',
        'input_sale_price_per_token' => 'float',
        'output_sale_price_per_token' => 'float',
        'input_reward_per_token' => 'float',
        'output_reward_per_token' => 'float',
        'platform_fee_rate' => 'float',
        'daily_token_limit' => 'integer',
        'monthly_token_limit' => 'integer',
        'reviewed_by' => 'string',
        'reviewed_at' => 'datetime',
        'published_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    // ==================== 关联关系 ====================

    /** 所属 User（外键 marketplace_listings.reviewed_by） @return \think\model\relation\BelongsTo */
    public function reviewedBy(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by', 'id');
    }

    /** 所属 User（外键 marketplace_listings.seller_user_id） @return \think\model\relation\BelongsTo */
    public function sellerUser(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(User::class, 'seller_user_id', 'id');
    }

    /** 所属 UpstreamModelMapping（外键 marketplace_listings.upstream_model_mapping_id） @return \think\model\relation\BelongsTo */
    public function upstreamModelMapping(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(UpstreamModelMapping::class, 'upstream_model_mapping_id', 'id');
    }

    /** 拥有多条 MarketplaceLedger（外键 listing_id） @return \think\model\relation\HasMany */
    public function marketplaceLedger(): \think\model\relation\HasMany
    {
        return $this->hasMany(MarketplaceLedger::class, 'listing_id', 'id');
    }

    /** 拥有多条 MarketplaceRequestSettlement（外键 listing_id） @return \think\model\relation\HasMany */
    public function marketplaceRequestSettlements(): \think\model\relation\HasMany
    {
        return $this->hasMany(MarketplaceRequestSettlement::class, 'listing_id', 'id');
    }
}
