<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * notifications —— 用户站内通知（投递给具体用户、带可操作按钮、可去重）
 *
 * 面向单个用户的通知消息，区别于 announcements 的全站广播。
 * 支持按类型分类，可附带一个文案加跳转链接的行动按钮，可标记已读，可设过期，并可用幂等键防止同一通知被重复投递。
 * 查询通常按用户维度进行：未读、按类型、按时间。
 *
 * @property string      $id               通知主键，全局唯一标识
 * @property string      $user_id          收件用户
 * @property string      $type             通知类型分类，由应用层定义
 * @property string      $title            通知标题
 * @property string|null $body             通知正文
 * @property string      $severity         严重级别，例如 info、warning
 * @property string|null $action_label     行动按钮的文案；留空则不展示按钮
 * @property string|null $action_url       行动按钮的跳转地址
 * @property array       $metadata         扩展的结构化数据
 * @property string|null $read_at          已读时间，留空表示未读
 * @property string|null $expires_at       过期时间，过期后可隐藏
 * @property string      $created_at       创建时间
 * @property string|null $idempotency_key  幂等键，防止同一通知被重复投递
 *
 * @mixin \think\Model
 */
class Notification extends Model
{
    // 数据表（表名为复数，与默认蛇形命名不同，需显式指定）
    protected $table = 'notifications';

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
        'metadata' => 'json',
        'read_at' => 'datetime',
        'expires_at' => 'datetime',
        'created_at' => 'datetime',
    ];
}
