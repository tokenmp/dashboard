<?php
declare(strict_types=1);

namespace app\controller\dashboard;

use app\BaseController;
use app\model\AiModel;
use app\model\UpstreamModelMapping;
use app\support\Pagination;
use think\exception\HttpException;
use think\facade\Db;

/**
 * 管理面：平台模型（models）CRUD + 上游模型映射（upstream_model_mappings）CRUD
 *
 * 路由前缀 /api/v1/dashboard/models
 * - GET    /                  模型目录（分页+筛选 keyword/billingMode/series/status）
 * - POST   /                  新建模型
 * - PUT    /:id               编辑模型（含软删 status=deleted）
 * - GET    /:id/mappings      某模型的所有上游映射（含 disabled，方便管理）
 * - POST   /:id/mappings      为模型新增映射
 * - PUT    /mappings/:mid     编辑映射
 * - DELETE /mappings/:mid     软删映射（status=deleted）
 * - GET    /key-options       可用于挂映射的上游 key 列表（active key + 其 provider/endpoint）
 */
class Model extends BaseController
{
    private const STATUSES       = ['active', 'disabled', 'deleted'];
    private const BILLING_MODES  = ['billable', 'free_global'];
    private const CAPABILITIES   = ['text', 'thinking', 'vision', 'long_context'];

    /** GET /api/v1/dashboard/models */
    public function list()
    {
        [$page, $size] = Pagination::page($this->request);

        $query = AiModel::where('status', '<>', 'deleted');
        $keyword = trim((string) $this->request->get('keyword', ''));
        if ($keyword !== '') {
            $query->whereRaw('(name ILIKE ? OR display_name ILIKE ?)', ["%{$keyword}%", "%{$keyword}%"]);
        }
        $billingMode = trim((string) $this->request->get('billingMode', ''));
        if ($billingMode !== '') {
            $query->where('billing_mode', $billingMode);
        }
        $series = trim((string) $this->request->get('series', ''));
        if ($series !== '') {
            $lower = strtolower($series);
            $query->whereRaw('(name ILIKE ? OR name = ? OR name ILIKE ?)', ["{$lower}-%", $lower, "{$lower}%"]);
        }
        $status = trim((string) $this->request->get('status', ''));
        if ($status !== '') {
            $query->where('status', $status);
        }

        Pagination::applyTimeRange($query, $this->request, 'created_at');
        $total = $query->count();
        Pagination::applySort($query, $this->request, ['created_at', 'name'], 'created_at');
        $list = $query->page($page, $size)->select();

        $data = $list->toArray();
        foreach ($data as &$m) {
            $m['capabilities'] = self::parsePgArray($m['capabilities'] ?? null);
        }
        unset($m);

        // 批量取模型在各供应商下的映射（避免 N+1）
        $modelIds = array_column($data, 'id');
        $byModel = [];
        if (!empty($modelIds)) {
            $placeholders = implode(',', array_fill(0, count($modelIds), '?'));
            $providerRows = Db::connect('pgsql')->query(
                "select umm.id as mapping_id, umm.model_id, umm.upstream_key_id, umm.upstream_model_name,"
                . " umm.input_price_per_token, umm.output_price_per_token, umm.max_tokens, umm.status,"
                . " uk.name as upstream_key_name, p.name as provider_name, p.display_name as provider_display_name"
                . " from upstream_model_mappings umm"
                . " join upstream_keys uk on uk.id = umm.upstream_key_id"
                . " join providers p on p.id = uk.provider_id"
                . " where umm.model_id in ($placeholders) and umm.status <> 'deleted' and uk.status <> 'deleted'"
                . " order by p.name, uk.name",
                $modelIds
            );
            foreach ($providerRows as $pr) {
                $byModel[$pr['model_id']][] = [
                    'mapping_id'              => $pr['mapping_id'],
                    'provider_name'           => $pr['provider_name'],
                    'provider_display_name'   => $pr['provider_display_name'],
                    'upstream_key_name'       => $pr['upstream_key_name'],
                    'upstream_key_id'         => $pr['upstream_key_id'],
                    'upstream_model_name'     => $pr['upstream_model_name'],
                    'input_price_per_token'   => $pr['input_price_per_token'] !== null ? (float) $pr['input_price_per_token'] : null,
                    'output_price_per_token'  => $pr['output_price_per_token'] !== null ? (float) $pr['output_price_per_token'] : null,
                    'max_tokens'              => $pr['max_tokens'] !== null ? (int) $pr['max_tokens'] : null,
                    'status'                  => $pr['status'],
                ];
            }
        }
        foreach ($data as &$m) {
            $m['providers'] = $byModel[$m['id']] ?? [];
        }
        unset($m);

        return success(Pagination::wrap($data, $total, $page, $size));
    }

    /** POST /api/v1/dashboard/models */
    public function create()
    {
        $row = $this->modelInput(true);
        $id = $this->genUuid();
        $caps = $row['capabilities'];
        $capsLiteral = '{' . implode(',', $caps) . '}';
        Db::connect('pgsql')->execute(
            "INSERT INTO models (id, name, display_name, description, status, capabilities, "
            . "context_window_tokens, billing_mode, metadata, created_at, updated_at) "
            . "VALUES (?,?,?,?,?,?::text[],?,?,?::jsonb,NOW(),NOW())",
            [$id, $row['name'], $row['display_name'], $row['description'], $row['status'],
             $capsLiteral, $row['context_window_tokens'], $row['billing_mode'], '{}']
        );
        return success($this->findModel($id));
    }

    /** PUT /api/v1/dashboard/models/:id */
    public function update($id)
    {
        $model = AiModel::where('id', $id)->where('status', '<>', 'deleted')->find();
        if ($model === null) {
            throw new HttpException(404, '模型不存在');
        }
        $row = $this->modelInput(false);
        $capsLiteral = '{' . implode(',', $row['capabilities']) . '}';
        Db::connect('pgsql')->execute(
            "UPDATE models SET name=?, display_name=?, description=?, status=?, capabilities=?::text[], "
            . "context_window_tokens=?, billing_mode=?, updated_at=NOW() WHERE id=? AND status <> 'deleted'",
            [$row['name'], $row['display_name'], $row['description'], $row['status'],
             $capsLiteral, $row['context_window_tokens'], $row['billing_mode'], $id]
        );
        return success($this->findModel($id));
    }

    /** GET /api/v1/dashboard/models/:id/mappings —— 含 disabled，管理用 */
    public function mappings($id)
    {
        $model = AiModel::where('id', $id)->find();
        if ($model === null) {
            throw new HttpException(404, '模型不存在');
        }
        $keyword = trim((string) $this->request->get('keyword', ''));
        $status = trim((string) $this->request->get('status', ''));
        $sql = "select umm.id, umm.upstream_key_id, umm.upstream_model_name, "
            . " umm.input_price_per_token, umm.output_price_per_token, umm.max_tokens, "
            . " umm.status, umm.provider_endpoint_id, umm.created_at, "
            . " uk.name as upstream_key_name, uk.status as upstream_key_status, "
            . " p.name as provider_name, p.display_name as provider_display_name, "
            . " pe.protocol, pe.path as endpoint_path, "
            . " coalesce((select jsonb_agg(urgm.route_group_id) from upstream_route_group_memberships urgm where urgm.upstream_model_mapping_id = umm.id and urgm.status <> 'deleted'), '[]'::jsonb) as route_group_ids "
            . " from upstream_model_mappings umm"
            . " join upstream_keys uk on uk.id = umm.upstream_key_id"
            . " join providers p on p.id = uk.provider_id"
            . " left join provider_endpoints pe on pe.id = umm.provider_endpoint_id"
            . " where umm.model_id = ? and umm.status <> 'deleted'";
        $params = [$id];
        if ($status !== '' && in_array($status, ['active', 'disabled'], true)) {
            $sql .= " and umm.status = ?";
            $params[] = $status;
        }
        if ($keyword !== '') {
            $sql .= " and (uk.name ILIKE ? or p.name ILIKE ? or p.display_name ILIKE ? or umm.upstream_model_name ILIKE ?)";
            $kw = "%{$keyword}%";
            array_push($params, $kw, $kw, $kw, $kw);
        }
        $sql .= " order by p.name, uk.name";
        $rows = Db::connect('pgsql')->query($sql, $params);
        $data = array_map(function ($r) {
            return [
                'id'                     => $r['id'],
                'upstream_key_id'        => $r['upstream_key_id'],
                'upstream_key_name'      => $r['upstream_key_name'],
                'upstream_key_status'    => $r['upstream_key_status'],
                'upstream_model_name'    => $r['upstream_model_name'],
                'input_price_per_token'  => $r['input_price_per_token'] !== null ? (float) $r['input_price_per_token'] : null,
                'output_price_per_token' => $r['output_price_per_token'] !== null ? (float) $r['output_price_per_token'] : null,
                'max_tokens'             => $r['max_tokens'] !== null ? (int) $r['max_tokens'] : null,
                'status'                 => $r['status'],
                'provider_endpoint_id'   => $r['provider_endpoint_id'],
                'provider_name'          => $r['provider_name'],
                'provider_display_name'  => $r['provider_display_name'],
                'protocol'               => $r['protocol'],
                'endpoint_path'          => $r['endpoint_path'],
                'route_group_ids'        => isset($r['route_group_ids']) ? json_decode((string) $r['route_group_ids'], true) ?: [] : [],
                'created_at'             => $r['created_at'],
            ];
        }, $rows);
        return success($data);
    }

    /** POST /api/v1/dashboard/models/:id/mappings */
    public function createMapping($id)
    {
        $model = AiModel::where('id', $id)->where('status', '<>', 'deleted')->find();
        if ($model === null) {
            throw new HttpException(404, '模型不存在');
        }
        $row = $this->mappingInput();
        $mid = $this->genUuid();
        // 唯一约束：(upstream_key_id, model_id, coalesce(provider_endpoint_id, zero)) where status<>'deleted'
        $exists = Db::connect('pgsql')->query(
            "select 1 from upstream_model_mappings"
            . " where upstream_key_id=? and model_id=?"
            . " and coalesce(provider_endpoint_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(?::uuid, '00000000-0000-0000-0000-000000000000'::uuid)"
            . " and status <> 'deleted' limit 1",
            [$row['upstream_key_id'], $id, $row['provider_endpoint_id']]
        );
        if (!empty($exists)) {
            throw new HttpException(400, '该上游 Key 与端点的映射已存在');
        }
        Db::connect('pgsql')->execute(
            "INSERT INTO upstream_model_mappings (id, upstream_key_id, model_id, upstream_model_name, "
            . " input_price_per_token, output_price_per_token, max_tokens, status, provider_endpoint_id, created_at, updated_at) "
            . " VALUES (?,?,?,?,?,?,?,?::varchar,?,NOW(),NOW())",
            [$mid, $row['upstream_key_id'], $id, $row['upstream_model_name'],
             $row['input_price_per_token'], $row['output_price_per_token'], $row['max_tokens'],
             $row['status'], $row['provider_endpoint_id']]
        );
        // 默认加入 default 路由组（调用方未显式传 route_group_ids 时）
        $routeGroupIds = $this->request->post('route_group_ids');
        if (!is_array($routeGroupIds)) {
            $defaultGroup = Db::connect('pgsql')->query("select id from route_groups where name = 'default' and status <> 'deleted' limit 1");
            $routeGroupIds = !empty($defaultGroup) ? [$defaultGroup[0]['id']] : [];
        }
        $this->syncRouteGroups($mid, $routeGroupIds);
        return success(['id' => $mid]);
    }

    /** PUT /api/v1/dashboard/models/mappings/:mid */
    public function updateMapping($mid)
    {
        $mapping = UpstreamModelMapping::where('id', $mid)->where('status', '<>', 'deleted')->find();
        if ($mapping === null) {
            throw new HttpException(404, '映射不存在');
        }
        $row = $this->mappingInput();
        Db::connect('pgsql')->execute(
            "UPDATE upstream_model_mappings SET upstream_key_id=?, upstream_model_name=?, "
            . " input_price_per_token=?, output_price_per_token=?, max_tokens=?, status=?, "
            . " provider_endpoint_id=?, updated_at=NOW() WHERE id=? AND status <> 'deleted'",
            [$row['upstream_key_id'], $row['upstream_model_name'],
             $row['input_price_per_token'], $row['output_price_per_token'], $row['max_tokens'],
             $row['status'], $row['provider_endpoint_id'], $mid]
        );
        $routeGroupIds = $this->request->post('route_group_ids');
        if (is_array($routeGroupIds)) {
            $this->syncRouteGroups($mid, $routeGroupIds);
        }
        return success(['id' => $mid]);
    }

    /** DELETE /api/v1/dashboard/models/mappings/:mid —— 软删 */
    public function deleteMapping($mid)
    {
        $mapping = UpstreamModelMapping::where('id', $mid)->find();
        if ($mapping === null) {
            throw new HttpException(404, '映射不存在');
        }
        Db::connect('pgsql')->execute(
            "UPDATE upstream_model_mappings SET status='deleted', updated_at=NOW() WHERE id=?",
            [$mid]
        );
        return success(['id' => $mid]);
    }

    /** POST /api/v1/dashboard/models/mappings/:mid/status —— 启用/禁用映射 */
    public function updateMappingStatus($mid)
    {
        $status = trim((string) $this->request->post('status', ''));
        if (!in_array($status, ['active', 'disabled'], true)) {
            throw new HttpException(400, 'status 非法');
        }
        Db::connect('pgsql')->execute(
            "UPDATE upstream_model_mappings SET status = ?, updated_at = NOW() WHERE id = ? AND status <> 'deleted'",
            [$status, $mid]
        );
        return success(['id' => $mid]);
    }

    /** 同步映射的路由组成员（差异更新） */
    private function syncRouteGroups(string $mid, array $groupIds): void
    {
        $groupIds = array_values(array_unique(array_filter($groupIds, fn ($x) => is_string($x) && $x !== '')));
        $current = Db::connect('pgsql')->query(
            "select id, route_group_id from upstream_route_group_memberships where upstream_model_mapping_id = ? and status <> 'deleted'",
            [$mid]
        );
        $currentMap = [];
        foreach ($current as $c) {
            $currentMap[$c['route_group_id']] = $c['id'];
        }
        $keep = array_flip($groupIds);
        foreach ($currentMap as $gid => $memId) {
            if (!isset($keep[$gid])) {
                Db::connect('pgsql')->execute(
                    "UPDATE upstream_route_group_memberships SET status = 'deleted', updated_at = NOW() WHERE id = ?",
                    [$memId]
                );
            }
        }
        foreach ($groupIds as $gid) {
            if (!isset($currentMap[$gid])) {
                Db::connect('pgsql')->execute(
                    "INSERT INTO upstream_route_group_memberships (id, upstream_model_mapping_id, route_group_id, status) VALUES (?,?,?,'active')",
                    [$this->genUuid(), $mid, $gid]
                );
            }
        }
    }

    /** GET /api/v1/dashboard/models/route-groups —— 所有路由组（映射编辑用） */
    public function routeGroups()
    {
        $rows = Db::connect('pgsql')->query(
            "select id, name, display_name, is_system from route_groups where status <> 'deleted' order by is_system desc, name"
        );
        return success($rows);
    }

    /** GET /api/v1/dashboard/models/key-options —— 可挂映射的 active 上游 key */
    public function keyOptions()
    {
        $keyword = trim((string) $this->request->get('keyword', ''));
        $sql = "select uk.id, uk.name, uk.status, p.name as provider_name, p.display_name as provider_display_name"
            . " from upstream_keys uk join providers p on p.id = uk.provider_id"
            . " where uk.status <> 'deleted'";
        $params = [];
        if ($keyword !== '') {
            $sql .= " and (uk.name ILIKE ? or p.name ILIKE ?)";
            $params[] = "%{$keyword}%";
            $params[] = "%{$keyword}%";
        }
        $sql .= " order by p.name, uk.name limit 200";
        $rows = Db::connect('pgsql')->query($sql, $params);
        return success($rows);
    }

    // ─────────────────────────── 内部 ───────────────────────────

    /** 读取并校验模型字段 */
    private function modelInput(bool $isCreate): array
    {
        $name = trim((string) $this->request->post('name', ''));
        if ($name === '') {
            throw new HttpException(400, '模型名不能为空');
        }
        $billingMode = (string) $this->request->post('billing_mode', 'billable');
        if (!in_array($billingMode, self::BILLING_MODES, true)) {
            throw new HttpException(400, 'billing_mode 取值非法（billable/free_global）');
        }
        $status = (string) $this->request->post('status', 'active');
        if (!in_array($status, self::STATUSES, true)) {
            throw new HttpException(400, 'status 取值非法（active/disabled/deleted）');
        }
        $caps = $this->request->post('capabilities');
        $capsArr = is_array($caps)
            ? array_values(array_filter(array_map('strval', $caps), fn ($v) => in_array($v, self::CAPABILITIES, true)))
            : [];
        if (empty($capsArr)) {
            $capsArr = ['text'];
        }
        // 大小写不敏感唯一约束（idx_models_name_unique_active）
        if ($isCreate) {
            $dup = AiModel::whereRaw('lower(name) = lower(?)', [$name])->where('status', '<>', 'deleted')->find();
            if ($dup !== null) {
                throw new HttpException(400, '模型名已存在（大小写不敏感）');
            }
        } else {
            $dup = AiModel::whereRaw('lower(name) = lower(?)', [$name])
                ->where('status', '<>', 'deleted')
                ->where('id', '<>', $this->request->route('id') ?? '')
                ->find();
            if ($dup !== null) {
                throw new HttpException(400, '模型名已存在（大小写不敏感）');
            }
        }
        return [
            'name'                  => $name,
            'display_name'          => ($d = trim((string) $this->request->post('display_name', ''))) === '' ? null : $d,
            'description'           => ($d = trim((string) $this->request->post('description', ''))) === '' ? null : $d,
            'status'                => $status,
            'capabilities'          => $capsArr,
            'context_window_tokens' => $this->nullableInt('context_window_tokens'),
            'billing_mode'          => $billingMode,
        ];
    }

    /** 读取并校验映射字段 */
    private function mappingInput(): array
    {
        $upstreamKeyId = trim((string) $this->request->post('upstream_key_id', ''));
        if ($upstreamKeyId === '') {
            throw new HttpException(400, '必须选择上游 Key');
        }
        $status = (string) $this->request->post('status', 'active');
        if (!in_array($status, ['active', 'disabled'], true)) {
            throw new HttpException(400, '映射 status 取值非法（active/disabled）');
        }
        $endpointId = trim((string) $this->request->post('provider_endpoint_id', ''));
        return [
            'upstream_key_id'        => $upstreamKeyId,
            'upstream_model_name'    => ($v = trim((string) $this->request->post('upstream_model_name', ''))) === '' ? null : $v,
            'input_price_per_token'  => $this->nullableFloat('input_price_per_token'),
            'output_price_per_token' => $this->nullableFloat('output_price_per_token'),
            'max_tokens'             => $this->nullableInt('max_tokens'),
            'status'                 => $status,
            'provider_endpoint_id'   => $endpointId === '' ? null : $endpointId,
        ];
    }

    private function nullableInt(string $key): ?int
    {
        $v = $this->request->post($key);
        if ($v === null || $v === '') {
            return null;
        }
        return (int) $v;
    }

    private function nullableFloat(string $key): ?float
    {
        $v = $this->request->post($key);
        if ($v === null || $v === '') {
            return null;
        }
        return (float) $v;
    }

    private function genUuid(): string
    {
        return Db::connect('pgsql')->query('select gen_random_uuid() as id')[0]['id'];
    }

    private function findModel(string $id): ?array
    {
        $m = AiModel::where('id', $id)->find();
        if ($m === null) {
            return null;
        }
        $arr = $m->toArray();
        $arr['capabilities'] = self::parsePgArray($arr['capabilities'] ?? null);
        return $arr;
    }

    /** 解析 PostgreSQL text[] 字面量 */
    public static function parsePgArray($value): array
    {
        if (is_array($value)) {
            return $value;
        }
        if (!is_string($value) || $value === '') {
            return [];
        }
        $s = trim($value);
        if ($s === '{}') {
            return [];
        }
        if (str_starts_with($s, '{') && str_ends_with($s, '}')) {
            $inner = substr($s, 1, -1);
            return $inner === '' ? [] : array_map('trim', explode(',', $inner));
        }
        return [$s];
    }
}
