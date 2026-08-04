<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * Bot 专用密钥表（bot_keys）—— 为第三方 Bot 签发的接入鉴权密钥
 *
 * 第三方 Bot 无法用浏览器登录，用户可为每个 Bot 单独签发一把密钥，Bot 持其以 Bearer 方式调用执行面。
 * 带权限范围与使用心跳，配合不活跃 TTL（约 7 天）做生命周期管理；
 * 状态支持软删除。
 *
 * @property string $id            Bot 密钥 ID（UUID 主键）
 * @property string $user_id       所属用户 ID（密钥主人）
 * @property string $name          密钥显示名称，区分多个 Bot
 * @property string $scope         权限范围：user（默认）/ admin
 * @property string $key_prefix    明文密钥前缀，脱敏展示用
 * @property string $key_suffix    明文密钥后缀，脱敏展示用
 * @property string $key_hash      密钥哈希，鉴权按哈希查表，明文不落库
 * @property string $status        状态：active（默认）/ disabled / deleted
 * @property string $last_used_at  最近一次使用时间，用作鉴权心跳
 * @property string $created_at    创建时间
 * @property string $updated_at    更新时间（改状态/刷新心跳时更新）
 *
 * @mixin \think\Model
 */
class BotKey extends Model
{
    // 数据表（表名为复数，与默认蛇形命名不同，需显式指定）
    protected $table = 'bot_keys';

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
        'user_id' => 'string',
        'last_used_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    // ==================== 关联关系 ====================

    /** 所属 User（外键 bot_keys.user_id） @return \think\model\relation\BelongsTo */
    public function user(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id', 'id');
    }
}
