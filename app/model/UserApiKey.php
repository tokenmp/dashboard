<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * 用户 API 密钥表（user_api_keys）—— 调用执行面接口的标准鉴权密钥
 *
 * 用户在管理端创建、以 OpenAI 兼容协议调用 executor 的密钥表。
 * 创建时仅存密钥哈希（加 pepper），明文只在创建或重置那一次回显；
 * 鉴权时按哈希反查活跃密钥定位用户。
 * 状态支持软删除。
 *
 * @property string      $id            API 密钥 ID（UUID 主键）
 * @property string      $user_id       所属用户 ID
 * @property string      $name          密钥显示名称（用户自命名）
 * @property string      $key_prefix    明文密钥前缀，脱敏展示用
 * @property string      $key_suffix    明文密钥后缀，脱敏展示用
 * @property string      $key_hash      密钥哈希，鉴权按哈希查表，明文不落库
 * @property string      $status        状态：active（默认）/ disabled / deleted
 * @property string|null $last_used_at  最近使用时间，由关联请求日志聚合得出
 * @property string      $created_at    创建时间
 *
 * @mixin \think\Model
 */
class UserApiKey extends Model
{
    // 数据表（表名为复数，与默认蛇形命名不同，需显式指定）
    protected $table = 'user_api_keys';

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
        'last_used_at' => 'datetime',
        'created_at' => 'datetime',
    ];

    // ==================== 关联关系 ====================

    /** 所属 User（外键 user_api_keys.user_id） @return \think\model\relation\BelongsTo */
    public function user(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id', 'id');
    }

    /** 拥有多条 RequestLog（外键 user_api_key_id） @return \think\model\relation\HasMany */
    public function requestLogs(): \think\model\relation\HasMany
    {
        return $this->hasMany(RequestLog::class, 'user_api_key_id', 'id');
    }
}
