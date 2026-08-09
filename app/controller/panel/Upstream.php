<?php
declare(strict_types=1);

namespace app\controller\panel;

use app\BaseController;
use app\model\AiModel;
use app\model\UpstreamKey;
use app\model\UpstreamKeyVerification;
use app\model\UpstreamModelMapping;
use app\service\DataScope;
use app\service\ModelKeyHealthService;
use app\support\Pagination;
use think\exception\HttpException;
use think\facade\Db;
use think\facade\Cache;

/**
 * 用户面：我持有的上游 Key 与模型目录（panel）
 *
 * 路由前缀 /api/v1/panel/upstream
 * - GET /keys       我自有的上游 Key 列表（脱敏）
 * - GET /keys/:id   详情 + mappings + route_groups + 最近 verifications
 * - GET /models     全平台可用模型目录
 *
 * Key 仅看 owner_user_id=self 的私有数据。模型目录不受 DataScope 限制。
 * 脱敏：永不返回 encrypted_key / encryption_version。
 */
class Upstream extends BaseController
{
    /** GET /api/v1/panel/upstream/keys */
    public function keys()
    {
        $ctx = DataScope::forSelf(app('user'));
        [$page, $size] = Pagination::page($this->request);

        $query = UpstreamKey::with(['provider', 'ownerUser'])
            ->where('status', '<>', 'deleted')
            ->where('owner_user_id', $ctx->userId());

        $keyword = trim((string) $this->request->get('keyword', ''));
        if ($keyword !== '') {
            $query->whereLike('name', "%{$keyword}%");
        }
        $status = trim((string) $this->request->get('status', ''));
        if ($status !== '') {
            $query->where('status', $status);
        }
        $marketStatus = trim((string) $this->request->get('marketStatus', ''));
        if ($marketStatus !== '') {
            $query->where('market_status', $marketStatus);
        }

        Pagination::applyTimeRange($query, $this->request, 'created_at');
        $total = $query->count();
        Pagination::applySort($query, $this->request, ['created_at', 'priority'], '-created_at');
        $list = $query->page($page, $size)->select();

        // 脱敏：去掉 encrypted_key / encryption_version；保留 key_prefix/key_suffix
        $list->hidden(['encrypted_key', 'encryption_version']);

        return success(Pagination::wrap($list, $total, $page, $size));
    }

    /** GET /api/v1/panel/upstream/keys/:id */
    public function keyDetail($id)
    {
        $ctx   = DataScope::forSelf(app('user'));
        $query = UpstreamKey::with(['provider', 'ownerUser'])
            ->where('id', $id)
            ->where('status', '<>', 'deleted')
            ->where('owner_user_id', $ctx->userId());
        $key = $query->find();
        if ($key === null) {
            throw new HttpException(404, '上游 Key 不存在');
        }
        $key->hidden(['encrypted_key', 'encryption_version']);

        // 映射（含 model 名、endpoint、单价）
        $mappings = UpstreamModelMapping::where('upstream_key_id', $id)
            ->where('status', '<>', 'deleted')
            ->with(['model', 'providerEndpoint'])
            ->order('created_at', 'desc')
            ->select();

        // 所属路由组
        $routeGroups = Db::connect('pgsql')->query(
            "select rg.id, rg.name, rg.display_name, rg.is_system, rg.status"
            . " from upstream_route_group_memberships urgm"
            . " join route_groups rg on rg.id = urgm.route_group_id"
            . " where urgm.upstream_model_mapping_id in (select id from upstream_model_mappings where upstream_key_id = ?)"
            . " and urgm.status <> 'deleted' and rg.status <> 'deleted'",
            [$id]
        );

        // 最近校验记录
        $verifications = UpstreamKeyVerification::where('upstream_key_id', $id)
            ->order('created_at', 'desc')
            ->limit(10)
            ->select();

        return success([
            'key'           => $key,
            'mappings'      => $mappings,
            'routeGroups'   => $routeGroups,
            'verifications' => $verifications,
        ]);
    }

    /** GET /api/v1/panel/upstream/models */
    public function models()
    {
        [$page, $size] = Pagination::page($this->request);

        $query = AiModel::where('status', 'active')
            ->whereRaw("exists (select 1 from upstream_model_mappings umm join upstream_keys uk on uk.id = umm.upstream_key_id where umm.model_id = models.id and umm.status = 'active' and uk.status = 'active')");
        $keyword = trim((string) $this->request->get('keyword', ''));
        if ($keyword !== '') {
            $query->whereRaw(
                '(name ILIKE ? OR display_name ILIKE ?)',
                ["%{$keyword}%", "%{$keyword}%"]
            );
        }
        $billingMode = trim((string) $this->request->get('billingMode', ''));
        if ($billingMode !== '') {
            $query->where('billing_mode', $billingMode);
        }
        $series = trim((string) $this->request->get('series', ''));
        if ($series !== '') {
            // 支持多前缀（如 qwen 匹配 qwen- 和 qwen3-），大小写不敏感
            $lower = strtolower($series);
            $query->whereRaw(
                '(name ILIKE ? OR name = ? OR name ILIKE ?)',
                ["{$lower}-%", $lower, "{$lower}%"]
            );
        }
        Pagination::applyTimeRange($query, $this->request, 'created_at');
        $total = $query->count();
        Pagination::applySort($query, $this->request, ['created_at', 'name'], 'created_at');
        $list = $query->page($page, $size)->select();
        $data = $list->toArray();

        // 批量查询当前页模型的可用供应商映射，避免 N+1。
        $modelIds = array_column($data, 'id');
        $providerRows = [];
        if (!empty($modelIds)) {
            $placeholders = implode(',', array_fill(0, count($modelIds), '?'));
            $providerRows = Db::connect('pgsql')->query(
                "select umm.id as mapping_id, umm.model_id, umm.upstream_key_id, umm.upstream_model_name,"
                . " umm.input_price_per_token, umm.output_price_per_token, umm.max_tokens, umm.status,"
                . " uk.name as upstream_key_name, p.name as provider_name, p.display_name as provider_display_name"
                . " from upstream_model_mappings umm"
                . " join upstream_keys uk on uk.id = umm.upstream_key_id"
                . " join providers p on p.id = uk.provider_id"
                . " where umm.model_id in ($placeholders) and umm.status = 'active' and uk.status = 'active'"
                . " order by p.name, uk.name",
                $modelIds
            );
        }

        $byModel = [];
        foreach ($providerRows as $providerRow) {
            $byModel[$providerRow['model_id']][] = [
                'mapping_id'             => $providerRow['mapping_id'],
                'provider_name'          => $providerRow['provider_name'],
                'provider_display_name'  => $providerRow['provider_display_name'],
                'upstream_key_name'      => $providerRow['upstream_key_name'],
                'upstream_key_id'        => $providerRow['upstream_key_id'],
                'upstream_model_name'    => $providerRow['upstream_model_name'],
                'input_price_per_token'  => $providerRow['input_price_per_token'] !== null ? (float) $providerRow['input_price_per_token'] : null,
                'output_price_per_token' => $providerRow['output_price_per_token'] !== null ? (float) $providerRow['output_price_per_token'] : null,
                'max_tokens'             => $providerRow['max_tokens'] !== null ? (int) $providerRow['max_tokens'] : null,
                'status'                 => $providerRow['status'],
            ];
        }

        // 近 24h 各模型的请求级成功率（最终成功，含重试后成功；走 model_name+created_at 索引）
        // 精确匹配 model_name=name 或 name@provider，避免前缀冲突（deepseek-v4-flash vs -0731）
        $rateByName = [];
        $modelNames = array_values(array_filter(array_unique(array_column($data, 'name'))));
        if (!empty($modelNames)) {
            $ors = [];
            $matchParams = [];
            foreach ($modelNames as $n) {
                $ors[] = '(model_name = ? OR model_name LIKE ?)';
                $matchParams[] = $n;
                $matchParams[] = $n . '@%';
            }
            $since = gmdate('Y-m-d\\TH:i:s\\Z', time() - 86400);
            $statRows = Db::connect('pgsql')->query(
                "select split_part(model_name, '@', 1) as base_name, count(*) as total,"
                . " count(*) filter (where success) as success"
                . " from request_logs"
                . " where created_at >= ? and (" . implode(' OR ', $ors) . ")"
                . " group by split_part(model_name, '@', 1)",
                array_merge([$since], $matchParams)
            );
            foreach ($statRows as $r) {
                $total = (int) $r['total'];
                $rateByName[$r['base_name']] = $total > 0 ? round((int) $r['success'] * 100 / $total, 1) : null;
            }
        }

        foreach ($data as &$model) {
            $model['capabilities'] = self::parsePgArray($model['capabilities'] ?? null);
            $model['providers'] = $byModel[$model['id']] ?? [];
            $model['success_rate'] = $rateByName[$model['name']] ?? null;
        }
        unset($model);

        return success(Pagination::wrap($data, $total, $page, $size));
    }

    /** GET /api/v1/panel/upstream/models/:id/success-buckets?range=24h|1h|15m */
    public function successBuckets($id)
    {
        $range = trim((string) $this->request->get('range', '24h'));
        $ranges = ['24h' => 86400, '1h' => 3600, '15m' => 900];
        $rangeSec = $ranges[$range] ?? 86400;
        $buckets = 12;
        $intervalSec = max(1, intdiv($rangeSec, $buckets));

        $model = AiModel::where('id', $id)->where('status', 'active')->find();
        if (!$model) {
            throw new HttpException(404, '模型不存在');
        }

        // 桶边界（epoch 对齐）：bucketStarts[0]=最早，[buckets-1]=当前进行中
        $now = time();
        $current = (int) (floor($now / $intervalSec) * $intervalSec);
        $bucketStarts = [];
        for ($i = $buckets - 1; $i >= 0; $i--) {
            $bucketStarts[] = $current - $i * $intervalSec;
        }

        // 历史 11 桶（已结束、数据固定）按桶缓存；当前桶（进行中）每次实时查
        $result = [];
        $missing = [];
        for ($i = 0; $i < $buckets - 1; $i++) {
            $cached = Cache::get('msb:' . $id . ':' . $range . ':' . $bucketStarts[$i]);
            if ($cached !== null) {
                $result[$i] = $cached;
            } else {
                $missing[] = $i;
            }
        }

        // 查缺失的历史桶 + 当前桶（范围从最早缺失桶或当前桶起）
        $earliest = !empty($missing) ? $bucketStarts[$missing[0]] : $bucketStarts[$buckets - 1];
        $since = gmdate('Y-m-d\\TH:i:s\\Z', $earliest);
        $rows = Db::connect('pgsql')->query(
            "select (date_bin(?::interval, created_at, timestamp 'epoch') AT TIME ZONE 'UTC') as bucket,"
            . " count(*) as total, count(*) filter (where success) as success"
            . " from request_logs"
            . " where created_at >= ? and (model_name = ? OR model_name LIKE ?)"
            . " group by bucket order by bucket",
            [$intervalSec . ' seconds', $since, $model->name, $model->name . '@%']
        );
        $byBucket = [];
        foreach ($rows as $r) {
            $byBucket[$r['bucket']] = [(int) $r['total'], (int) $r['success']];
        }

        for ($i = 0; $i < $buckets; $i++) {
            if (isset($result[$i])) {
                continue;
            }
            $bs = $bucketStarts[$i];
            $bk = gmdate('Y-m-d H:i:s', $bs);
            $st = $byBucket[$bk] ?? [0, 0];
            $item = [
                'bucket' => gmdate('c', $bs),
                'total' => $st[0],
                'success' => $st[1],
                'rate' => $st[0] > 0 ? round($st[1] * 100 / $st[0], 1) : null,
            ];
            $result[$i] = $item;
            if ($i < $buckets - 1) {
                // 历史桶数据已固定，长缓存（跨多个桶周期仍有效）
                Cache::set('msb:' . $id . ':' . $range . ':' . $bs, $item, max(3600, $intervalSec * 4));
            }
            // 当前桶（$i = $buckets-1）不缓存，保持实时
        }

        ksort($result);
        return success(array_values($result));
    }

    /** GET /api/v1/panel/upstream/model-names —— 有可用供应商映射的模型名（供前端推断系列） */
    public function modelNames()
    {
        $rows = Db::connect('pgsql')->query(
            "select distinct m.name from models m"
            . " where m.status = 'active'"
            . " and exists (select 1 from upstream_model_mappings umm join upstream_keys uk on uk.id = umm.upstream_key_id where umm.model_id = m.id and umm.status = 'active' and uk.status = 'active')"
            . " order by m.name"
        );
        return success(array_map(fn ($r) => ['name' => $r['name']], $rows));
    }

    /** GET /api/v1/panel/upstream/model-key-health?model_id=xxx */
    public function modelKeyHealth()
    {
        $modelId = trim((string) $this->request->get('model_id', ''));
        return success(ModelKeyHealthService::getModelKeyHealth($modelId));
    }

    /** 解析 PostgreSQL text[] 字面量（如 "{text,vision}"）为 PHP 数组 */
    private static function parsePgArray($value): array
    {
        if (is_array($value)) {
            return $value;
        }
        if (!is_string($value) || $value === '') {
            return [];
        }

        $value = trim($value);
        if ($value === '' || $value === '{}') {
            return [];
        }
        if (str_starts_with($value, '{') && str_ends_with($value, '}')) {
            $inner = substr($value, 1, -1);
            if ($inner === '') {
                return [];
            }
            return array_map(
                static fn(string $item): string => trim($item, " \t\n\r\0\x0B\""),
                explode(',', $inner)
            );
        }
        return [];
    }
}
