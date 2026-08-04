<?php
declare(strict_types=1);

namespace app\controller\api;

use app\BaseController;
use app\model\AiModel;
use app\model\Provider;
use app\model\RouteGroup;
use app\model\UpstreamKey;
use app\model\UpstreamKeyVerification;
use app\model\UpstreamModelMapping;
use app\service\DataScope;
use app\support\Pagination;
use think\exception\HttpException;
use think\facade\Db;

/**
 * 上游与模型
 *
 * 路由前缀 /api/upstream、/api/models
 *
 * - GET /api/upstream/providers   供应商（含 endpoint 计数）
 * - GET /api/upstream/keys        上游 Key 列表（脱敏；provider 名、用量比、market/review 状态）
 * - GET /api/upstream/keys/:id    详情 + mappings + route_groups + 最近 verifications
 * - GET /api/upstream/routes      路由组 + 成员映射数
 * - GET /api/models               平台模型目录
 *
 * 角色：admin 看全部（含 owner_user_id 平台/用户）；user 看 owner_user_id=self 的私有 Key + 所有 status=active 的平台模型。
 * 脱敏：永不返回 encrypted_key / key_hash；只给 key_prefix/key_suffix。
 */
class Upstream extends BaseController
{
    /**
     * GET /api/upstream/providers
     */
    public function providers()
    {
        $ctx = DataScope::forUser(app('user'));
        [$page, $size] = Pagination::page($this->request);

        $query = Provider::where('status', '<>', 'deleted');
        $keyword = trim((string) $this->request->get('keyword', ''));
        if ($keyword !== '') {
            $query->where(function ($q) use ($keyword) {
                $q->whereLike('name', "%{$keyword}%")->whereOr('display_name', 'like', "%{$keyword}%");
            });
        }
        $status = trim((string) $this->request->get('status', ''));
        if ($status !== '') {
            $query->where('status', $status);
        }
        Pagination::applyTimeRange($query, $this->request, 'created_at');
        $total = $query->count();
        Pagination::applySort($query, $this->request, ['created_at', 'updated_at'], '-created_at');
        $providers = $query->page($page, $size)->select();

        // 注入 endpoint 与 upstream_key 计数
        $ids = $providers->column('id');
        $counts = [];
        if (!empty($ids)) {
            $rows = Db::connect('pgsql')->query(
                "select p.id as provider_id,"
                . " count(distinct pe.id) as endpoint_count,"
                . " count(distinct uk.id) as key_count"
                . " from providers p"
                . " left join provider_endpoints pe on pe.provider_id = p.id and pe.status <> 'deleted'"
                . " left join upstream_keys uk on uk.provider_id = p.id and uk.status <> 'deleted'"
                . " where p.id in (" . implode(',', array_map(fn($i) => "'{$i}'", $ids)) . ")"
                . " group by p.id"
            );
            foreach ($rows as $r) {
                $counts[$r['provider_id']] = ['endpoints' => (int) $r['endpoint_count'], 'keys' => (int) $r['key_count']];
            }
        }

        $list = $providers->each(function ($p) use ($counts) {
            $c = $counts[$p->id] ?? ['endpoints' => 0, 'keys' => 0];
            $p->endpoint_count = $c['endpoints'];
            $p->key_count = $c['keys'];
            return $p;
        })->visible([
            'id', 'name', 'display_name', 'base_url', 'status', 'endpoint_count', 'key_count', 'created_at', 'updated_at',
        ])->toArray();
        return success(Pagination::wrap($list, $total, $page, $size));
    }

    /**
     * GET /api/upstream/keys
     */
    public function keys()
    {
        $ctx = DataScope::forUser(app('user'));
        [$page, $size] = Pagination::page($this->request);

        $query = UpstreamKey::with(['provider', 'ownerUser'])
            ->where('status', '<>', 'deleted');

        // user：仅看 owner_user_id=self 的私有 Key；admin 看全部（可选 source_type 筛选）
        if (!$ctx->isAdmin()) {
            $query->where('owner_user_id', $ctx->userId());
        } else {
            $sourceType = trim((string) $this->request->get('sourceType', ''));
            if ($sourceType !== '') {
                $query->where('source_type', $sourceType);
            }
        }

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

    /**
     * GET /api/upstream/keys/:id
     */
    public function keyDetail($id)
    {
        $ctx = DataScope::forUser(app('user'));

        $query = UpstreamKey::with(['provider', 'ownerUser'])
            ->where('id', $id)
            ->where('status', '<>', 'deleted');
        if (!$ctx->isAdmin()) {
            $query->where('owner_user_id', $ctx->userId());
        }
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
            'key'          => $key,
            'mappings'     => $mappings,
            'routeGroups'  => $routeGroups,
            'verifications'=> $verifications,
        ]);
    }

    /**
     * GET /api/upstream/routes
     */
    public function routes()
    {
        $ctx = DataScope::forUser(app('user'));
        [$page, $size] = Pagination::page($this->request);

        $query = RouteGroup::where('status', '<>', 'deleted');
        $keyword = trim((string) $this->request->get('keyword', ''));
        if ($keyword !== '') {
            $query->where(function ($q) use ($keyword) {
                $q->whereLike('name', "%{$keyword}%")->whereOr('display_name', 'like', "%{$keyword}%");
            });
        }
        Pagination::applyTimeRange($query, $this->request, 'created_at');
        $total = $query->count();
        Pagination::applySort($query, $this->request, ['created_at'], 'created_at');
        $groups = $query->page($page, $size)->select();

        $ids = $groups->column('id');
        $memberCounts = [];
        if (!empty($ids)) {
            $rows = Db::connect('pgsql')->query(
                "select route_group_id, count(*) as cnt from upstream_route_group_memberships"
                . " where status <> 'deleted' and route_group_id in ("
                . implode(',', array_map(fn($i) => "'{$i}'", $ids)) . ") group by route_group_id"
            );
            foreach ($rows as $r) {
                $memberCounts[$r['route_group_id']] = (int) $r['cnt'];
            }
        }
        $list = $groups->each(function ($g) use ($memberCounts) {
            $g->member_count = $memberCounts[$g->id] ?? 0;
            return $g;
        })->visible([
            'id', 'name', 'display_name', 'description', 'is_system', 'status', 'member_count', 'created_at', 'updated_at',
        ])->toArray();
        return success(Pagination::wrap($list, $total, $page, $size));
    }

    /**
     * GET /api/models
     */
    public function models()
    {
        $ctx = DataScope::forUser(app('user'));
        [$page, $size] = Pagination::page($this->request);

        $query = AiModel::where('status', '<>', 'deleted');
        $keyword = trim((string) $this->request->get('keyword', ''));
        if ($keyword !== '') {
            $query->where(function ($q) use ($keyword) {
                $q->whereLike('name', "%{$keyword}%")->whereOr('display_name', 'like', "%{$keyword}%");
            });
        }
        $billingMode = trim((string) $this->request->get('billingMode', ''));
        if ($billingMode !== '') {
            $query->where('billing_mode', $billingMode);
        }
        Pagination::applyTimeRange($query, $this->request, 'created_at');
        $total = $query->count();
        Pagination::applySort($query, $this->request, ['created_at', 'name'], 'created_at');
        $list = $query->page($page, $size)->select();

        // PostgreSQL text[] 经 PDO 返回为 "{a,b}" 字符串，转为真数组
        $data = $list->toArray();
        foreach ($data as &$m) {
            $m['capabilities'] = self::parsePgArray($m['capabilities'] ?? null);
        }
        unset($m);

        return success(Pagination::wrap($data, $total, $page, $size));
    }

    /**
     * 解析 PostgreSQL text[] 字面量（如 "{a,b}"）为 PHP 数组
     *
     * @param mixed $value
     */
    private static function parsePgArray($value): array
    {
        if (is_array($value)) {
            return $value;
        }
        if (!is_string($value) || $value === '') {
            return [];
        }
        $s = trim($value);
        if ($s === '{}' || ($s === '')) {
            return [];
        }
        if (str_starts_with($s, '{') && str_ends_with($s, '}')) {
            $inner = substr($s, 1, -1);
            return $inner === '' ? [] : array_map('trim', explode(',', $inner));
        }
        return [$s];
    }
}
