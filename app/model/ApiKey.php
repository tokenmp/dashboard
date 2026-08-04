<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * API 密钥遗留表（api_keys）—— 早期 API 密钥存储（现役已弃用）
 *
 * 这张遗留表在现役 Go 代码与迁移文件中均无任何引用，是平台早期的 API 密钥存储结构，DDL 残留在生产库中。
 * 当前真正在用的用户 API 密钥表是 user_api_keys，本表可视为待清理的历史结构。
 *
 * @property string      $id            密钥记录 ID（UUID 主键）
 * @property string      $user_id       所属用户 ID
 * @property string      $name          密钥显示名称，便于区分多个 key
 * @property string      $key_prefix    明文密钥前缀，脱敏展示用
 * @property string      $key_suffix    明文密钥后缀，脱敏展示用
 * @property string      $key_hash      密钥哈希，鉴权按哈希查表，明文不落库
 * @property string      $status        密钥状态，默认 active
 * @property array|null  $permissions   密钥级权限配置（旧设计遗留）
 * @property string|null $last_used_at  最近一次使用该密钥的时间
 * @property string|null $expires_at    密钥过期时间（旧设计支持密钥级有效期）
 * @property string      $created_at    创建时间
 * @property string      $updated_at    更新时间
 *
 * @mixin \think\Model
 */
class ApiKey extends Model
{
    // 数据表（表名为复数，与默认蛇形命名不同，需显式指定）
    protected $table = 'api_keys';

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
        'permissions' => 'json',
        'last_used_at' => 'datetime',
        'expires_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];
}
