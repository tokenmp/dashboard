<?php
declare (strict_types = 1);

namespace app\model;

use think\Model;

/**
 * 上游密钥校验记录（upstream_key_verifications）—— 健康探测结果
 *
 * 对上游密钥做连通性/模型可用性探测的一次结果记录，与上游密钥的 verified_at、last_validation_error 配套；
 * 删除上游密钥时会级联清除其校验记录。
 *
 * @property string      $id               校验记录 ID（UUID 主键）
 * @property string      $upstream_key_id  被校验的上游密钥 ID
 * @property string      $status           校验结果状态：pending / success / failed
 * @property int|null    $http_status      探测请求返回的 HTTP 状态码；可空
 * @property int|null    $latency_ms       探测请求耗时（毫秒）；可空
 * @property string|null $error_code       失败时的错误码；可空
 * @property string|null $error_message    失败时的错误描述；可空
 * @property array       $verified_models  本次确认可用的模型清单（JSON 数组，如 gpt-4o、claude-3-5-sonnet），默认为空数组
 * @property string      $created_at       校验时间
 *
 * @mixin \think\Model
 */
class UpstreamKeyVerification extends Model
{
    // 数据表（表名为复数，与默认蛇形命名不同，需显式指定）
    protected $table = 'upstream_key_verifications';

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
        'upstream_key_id' => 'string',
        'http_status' => 'integer',
        'latency_ms' => 'integer',
        'verified_models' => 'json',
        'created_at' => 'datetime',
    ];

    // ==================== 关联关系 ====================

    /** 所属 UpstreamKey（外键 upstream_key_verifications.upstream_key_id） @return \think\model\relation\BelongsTo */
    public function upstreamKey(): \think\model\relation\BelongsTo
    {
        return $this->belongsTo(UpstreamKey::class, 'upstream_key_id', 'id');
    }
}
