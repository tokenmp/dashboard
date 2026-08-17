<?php
declare(strict_types=1);

namespace app\controller\dashboard;

use app\BaseController;
use app\model\AiModel;
use app\model\UpstreamModelMapping;
use app\support\Pagination;
use app\support\ThinkingConfig;
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
            $m['thinking'] = ThinkingConfig::parse($m['thinking_config'] ?? null);
            unset($m['thinking_config']);
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
                . " uk.name as upstream_key_name, p.id as provider_id, p.name as provider_name, p.display_name as provider_display_name,"
                . " p.logo_url, p.logo_svg"
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
                    'provider_id'             => $pr['provider_id'],
                    'provider_name'           => $pr['provider_name'],
                    'provider_logo_url'       => $pr['logo_url'],
                    'provider_logo_svg'       => $pr['logo_svg'],
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

        // /v1/models 可见性诊断：按 executor ListExecutorModels 相同的 JOIN 链
        // 批量检测每个模型为何（是否）会被 /v1/models 加载
        $visibility = $this->v1Visibility($modelIds);
        foreach ($data as &$m) {
            $m['v1_visible'] = $visibility[$m['id']]['visible'] ?? false;
            $m['v1_issues']  = $visibility[$m['id']]['issues'] ?? [];
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
            . "context_window_tokens, max_tokens, billing_mode, metadata, created_at, updated_at) "
            . "VALUES (?,?,?,?,?,?::text[],?,?,?,?::jsonb,NOW(),NOW())",
            [$id, $row['name'], $row['display_name'], $row['description'], $row['status'],
             $capsLiteral, $row['context_window_tokens'], $row['max_tokens'], $row['billing_mode'], '{}']
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
            . "context_window_tokens=?, max_tokens=?, billing_mode=?, updated_at=NOW() WHERE id=? AND status <> 'deleted'",
            [$row['name'], $row['display_name'], $row['description'], $row['status'],
             $capsLiteral, $row['context_window_tokens'], $row['max_tokens'], $row['billing_mode'], $id]
        );
        return success($this->findModel($id));
    }

    /** GET /api/v1/dashboard/models/:id —— 单模型详情（映射管理等页面取模型级兜底值用） */
    public function detail($id)
    {
        $model = AiModel::where('id', $id)->where('status', '<>', 'deleted')->find();
        if ($model === null) {
            throw new HttpException(404, '模型不存在');
        }
        $arr = $model->toArray();
        $arr['capabilities'] = self::parsePgArray($arr['capabilities'] ?? null);
        $arr['thinking'] = ThinkingConfig::parse($arr['thinking_config'] ?? null);
        unset($arr['thinking_config']);
        return success($arr);
    }

    /** PUT /api/v1/dashboard/models/:id/thinking-config —— 模型级思考配置 */
    public function updateThinkingConfig($id)
    {
        $model = AiModel::where('id', $id)->where('status', '<>', 'deleted')->find();
        if ($model === null) {
            throw new HttpException(404, '模型不存在');
        }
        $json = ThinkingConfig::fromRequest($this->request);
        Db::connect('pgsql')->execute(
            "UPDATE models SET thinking_config = ?::jsonb, updated_at = NOW() WHERE id = ?",
            [$json, $id]
        );
        return success(['id' => $id]);
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
             . " umm.context_window_tokens, umm.thinking_config::text as thinking_config, "
             . " m.thinking_config::text as model_thinking_config, p.thinking_config::text as provider_thinking_config, "
             . " umm.status, umm.provider_endpoint_id, umm.created_at, "
            . " uk.name as upstream_key_name, uk.status as upstream_key_status, "
            . " p.id as provider_id, p.name as provider_name, p.display_name as provider_display_name, "
            . " p.logo_url as provider_logo_url, p.logo_svg as provider_logo_svg, "
            . " pe.protocol, pe.path as endpoint_path, "
            . " coalesce((select jsonb_agg(urgm.route_group_id) from upstream_route_group_memberships urgm where urgm.upstream_model_mapping_id = umm.id and urgm.status <> 'deleted'), '[]'::jsonb) as route_group_ids "
            . " from upstream_model_mappings umm"
            . " join upstream_keys uk on uk.id = umm.upstream_key_id"
            . " join providers p on p.id = uk.provider_id"
            . " join models m on m.id = umm.model_id"
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
            $resolved = ThinkingConfig::resolve(
                ThinkingConfig::parse($r['thinking_config'] ?? null),
                ThinkingConfig::parse($r['model_thinking_config'] ?? null),
                ThinkingConfig::parse($r['provider_thinking_config'] ?? null)
            );
            $eff = $resolved['config'];
            $src = $resolved['source'];
            return [
                'id'                     => $r['id'],
                'upstream_key_id'        => $r['upstream_key_id'],
                'upstream_key_name'      => $r['upstream_key_name'],
                'upstream_key_status'    => $r['upstream_key_status'],
                'upstream_model_name'    => $r['upstream_model_name'],
                'input_price_per_token'  => $r['input_price_per_token'] !== null ? (float) $r['input_price_per_token'] : null,
                'output_price_per_token' => $r['output_price_per_token'] !== null ? (float) $r['output_price_per_token'] : null,
                'max_tokens'             => $r['max_tokens'] !== null ? (int) $r['max_tokens'] : null,
                'context_window_tokens'  => $r['context_window_tokens'] !== null ? (int) $r['context_window_tokens'] : null,
                'thinking'               => ThinkingConfig::parse($r['thinking_config'] ?? null),
                'thinking_effective'     => $eff,
                'thinking_source'        => $src,
                'status'                 => $r['status'],
                'provider_endpoint_id'   => $r['provider_endpoint_id'],
                'provider_name'          => $r['provider_name'],
                'provider_display_name'  => $r['provider_display_name'],
                'provider_id'            => $r['provider_id'],
                'provider_logo_url'      => $r['provider_logo_url'],
                'provider_logo_svg'      => $r['provider_logo_svg'],
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
            . " input_price_per_token, output_price_per_token, max_tokens, context_window_tokens, thinking_config, status, provider_endpoint_id, created_at, updated_at) "
            . " VALUES (?,?,?,?,?,?,?,?,?::jsonb,?::varchar,?,NOW(),NOW())",
            [$mid, $row['upstream_key_id'], $id, $row['upstream_model_name'],
             $row['input_price_per_token'], $row['output_price_per_token'], $row['max_tokens'],
             $row['context_window_tokens'], $row['thinking_config_json'],
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
            . " input_price_per_token=?, output_price_per_token=?, max_tokens=?, context_window_tokens=?, "
            . " thinking_config=?::jsonb, status=?, provider_endpoint_id=?, updated_at=NOW() WHERE id=? AND status <> 'deleted'",
            [$row['upstream_key_id'], $row['upstream_model_name'],
             $row['input_price_per_token'], $row['output_price_per_token'], $row['max_tokens'],
             $row['context_window_tokens'], $row['thinking_config_json'],
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

    // ─────────────────── 供应商模型模板（无 Key 映射定义） ───────────────────
    // 管理端只定义目录（供应商×模型×上游模型名/端点），不持有 Key；
    // 用户「自建上游」自带 Key 时按模板克隆映射。路由不读本表。

    /** GET /api/v1/dashboard/models/:id/templates —— 该模型的供应商模板列表 */
    public function templates($id)
    {
        $model = AiModel::where('id', $id)->where('status', '<>', 'deleted')->find();
        if ($model === null) {
            throw new HttpException(404, '模型不存在');
        }
        $rows = Db::connect('pgsql')->query(
            "select t.id, t.provider_id, t.model_id, t.upstream_model_name, t.provider_endpoint_id,"
            . " t.input_price_per_token, t.output_price_per_token, t.max_tokens, t.context_window_tokens,"
            . " t.thinking_config::text as thinking_config, t.status, t.created_at, t.updated_at,"
            . " p.name as provider_name, p.display_name as provider_display_name, p.logo_url as provider_logo_url, p.logo_svg as provider_logo_svg,"
            . " pe.protocol as endpoint_protocol, pe.path as endpoint_path"
            . " from provider_model_templates t"
            . " join providers p on p.id = t.provider_id"
            . " left join provider_endpoints pe on pe.id = t.provider_endpoint_id"
            . " where t.model_id = ? and t.status <> 'deleted'"
            . " order by p.name, t.created_at",
            [$id]
        );
        foreach ($rows as &$r) {
            $r['thinking'] = ThinkingConfig::parse($r['thinking_config'] ?? null);
            unset($r['thinking_config']);
        }
        unset($r);
        return success($rows);
    }

    /** POST /api/v1/dashboard/models/:id/templates —— body: provider_id, upstream_model_name, ... */
    public function createTemplate($id)
    {
        $model = AiModel::where('id', $id)->where('status', '<>', 'deleted')->find();
        if ($model === null) {
            throw new HttpException(404, '模型不存在');
        }
        $providerId = trim((string) $this->request->post('provider_id', ''));
        $upstreamName = trim((string) $this->request->post('upstream_model_name', ''));
        if ($providerId === '' || $upstreamName === '') {
            throw new HttpException(400, 'provider_id 与 upstream_model_name 必填');
        }
        $exists = Db::connect('pgsql')->query("select 1 from providers where id = ? and status <> 'deleted' limit 1", [$providerId]);
        if (empty($exists)) {
            throw new HttpException(404, '供应商不存在');
        }
        $dup = Db::connect('pgsql')->query(
            "select 1 from provider_model_templates where provider_id = ? and model_id = ? and status <> 'deleted' limit 1",
            [$providerId, $id]
        );
        if (!empty($dup)) {
            throw new HttpException(400, '该供应商对此模型已有模板');
        }
        [$endpointId, $maxTokens, $contextTokens, $inPrice, $outPrice, $thinkingJson] = $this->templateInput();
        $tid = $this->genUuid();
        Db::connect('pgsql')->execute(
            "INSERT INTO provider_model_templates (id, provider_id, model_id, upstream_model_name, provider_endpoint_id,"
            . " input_price_per_token, output_price_per_token, max_tokens, context_window_tokens, thinking_config, status, created_at, updated_at)"
            . " VALUES (?,?,?,?,?,?,?,?,?,?::jsonb,'active',NOW(),NOW())",
            [$tid, $providerId, $id, $upstreamName, $endpointId, $inPrice, $outPrice, $maxTokens, $contextTokens, $thinkingJson]
        );
        return success(['id' => $tid]);
    }

    /** PUT /api/v1/dashboard/upstream/templates/:tid —— 编辑模板（upstream_model_name/端点/限参等） */
    public function updateTemplate($tid)
    {
        $row = Db::connect('pgsql')->query(
            "select id, provider_id, model_id from provider_model_templates where id = ? and status <> 'deleted' limit 1",
            [$tid]
        );
        if (empty($row)) {
            throw new HttpException(404, '模板不存在');
        }
        [$endpointId, $maxTokens, $contextTokens, $inPrice, $outPrice, $thinkingJson] = $this->templateInput();
        $upstreamName = trim((string) $this->request->post('upstream_model_name', ''));
        if ($upstreamName === '') {
            throw new HttpException(400, 'upstream_model_name 必填');
        }
        $status = trim((string) $this->request->post('status', '')) ?: 'active';
        if (!in_array($status, ['active', 'disabled'], true)) {
            throw new HttpException(400, 'status 非法');
        }
        Db::connect('pgsql')->execute(
            "UPDATE provider_model_templates SET upstream_model_name = ?, provider_endpoint_id = ?,"
            . " input_price_per_token = ?, output_price_per_token = ?, max_tokens = ?, context_window_tokens = ?,"
            . " thinking_config = ?::jsonb, status = ?, updated_at = NOW() WHERE id = ?",
            [$upstreamName, $endpointId, $inPrice, $outPrice, $maxTokens, $contextTokens, $thinkingJson, $status, $tid]
        );
        return success(['id' => $tid]);
    }

    /** DELETE /api/v1/dashboard/upstream/templates/:tid —— 软删模板 */
    public function deleteTemplate($tid)
    {
        $n = Db::connect('pgsql')->execute(
            "UPDATE provider_model_templates SET status = 'deleted', updated_at = NOW() WHERE id = ? AND status <> 'deleted'",
            [$tid]
        );
        if ($n === 0) {
            throw new HttpException(404, '模板不存在');
        }
        return success(['id' => $tid]);
    }

    /** 读取模板可选字段（create/update 共用）：端点/限参/定价/思考配置 */
    private function templateInput(): array
    {
        $endpointId = trim((string) $this->request->post('provider_endpoint_id', ''));
        return [
            $endpointId !== '' ? $endpointId : null,
            $this->nullableInt('max_tokens'),
            $this->nullableInt('context_window_tokens'),
            $this->nullableFloat('input_price_per_token'),
            $this->nullableFloat('output_price_per_token'),
            ThinkingConfig::fromRequest($this->request),
        ];
    }

    /** GET /api/v1/dashboard/models/key-options —— 可挂映射的 active 上游 key */
    public function keyOptions()
    {
        $keyword = trim((string) $this->request->get('keyword', ''));
        $sql = "select uk.id, uk.name, uk.status, p.id as provider_id, p.name as provider_name, p.display_name as provider_display_name,"
            . " p.logo_url, p.logo_svg"
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

    /** executor /v1/models 认可的 provider_endpoints 协议白名单（与 ListExecutorModels 保持一致） */
    private const V1_ENDPOINT_PROTOCOLS = ['openai', 'anthropic', 'openai_chat', 'openai_responses',
        'anthropic_messages', 'image_generation', 'tokenmp_gateway', 'custom'];

    /**
     * /v1/models 可见性诊断
     *
     * 与 executor 的 ListExecutorModels 查询同构：模型需整条链路 active 才会被加载——
     * models(active) → upstream_model_mappings(active) → upstream_keys(active)
     * → providers(active) → provider_endpoints(active 且协议在白名单内，
     * mapping 未指定端点时任选该 provider 的活跃端点)。
     * 返回 [model_id => ['visible' => bool, 'issues' => string[]]]
     */
    private function v1Visibility(array $modelIds): array
    {
        if (empty($modelIds)) {
            return [];
        }
        $protocols = "'" . implode("','", self::V1_ENDPOINT_PROTOCOLS) . "'";
        $placeholders = implode(',', array_fill(0, count($modelIds), '?'));
        $rows = Db::connect('pgsql')->query(
            "select m.id, (m.status = 'active') as model_active,"
            . " count(distinct umm.id) as mapping_total,"
            . " count(distinct case when umm.status = 'active' then umm.id end) as mapping_active,"
            . " count(distinct case when umm.status = 'active' and uk.status = 'active' then umm.id end) as key_active,"
            . " count(distinct case when umm.status = 'active' and uk.status = 'active' and p.status = 'active' then umm.id end) as provider_active,"
            . " count(distinct case when umm.status = 'active' and uk.status = 'active' and p.status = 'active'"
            . "   and pe.id is not null then umm.id end) as chain_active"
            . " from models m"
            . " left join upstream_model_mappings umm on umm.model_id = m.id and umm.status <> 'deleted'"
            . " left join upstream_keys uk on uk.id = umm.upstream_key_id"
            . " left join providers p on p.id = uk.provider_id"
            . " left join provider_endpoints pe on pe.provider_id = p.id"
            . "   and (umm.provider_endpoint_id is null or pe.id = umm.provider_endpoint_id)"
            . "   and pe.status = 'active' and pe.protocol in ($protocols)"
            . " where m.id in ($placeholders)"
            . " group by m.id, m.status",
            $modelIds
        );

        $result = [];
        $endpointIssueIds = [];
        foreach ($rows as $r) {
            $issues = [];
            $modelActive  = self::pgBool($r['model_active'] ?? false);
            $mappingTotal = (int) ($r['mapping_total'] ?? 0);
            $mappingActive = (int) ($r['mapping_active'] ?? 0);
            $keyActive    = (int) ($r['key_active'] ?? 0);
            $providerActive = (int) ($r['provider_active'] ?? 0);
            $chainActive  = (int) ($r['chain_active'] ?? 0);

            if (!$modelActive) {
                $issues[] = '模型未启用（status 非 active）';
            } elseif ($mappingTotal === 0) {
                $issues[] = '尚未配置任何上游映射';
            } elseif ($mappingActive === 0) {
                $issues[] = '所有上游映射均被禁用';
            } elseif ($keyActive === 0) {
                $issues[] = '映射对应的上游 Key 均不可用（被禁用或删除）';
            } elseif ($providerActive === 0) {
                $issues[] = '上游供应商被禁用';
            } elseif ($chainActive === 0) {
                $issues[] = '__ENDPOINT__'; // 占位，稍后补充供应商名
                $endpointIssueIds[] = (string) $r['id'];
            }
            $result[(string) $r['id']] = ['visible' => empty($issues), 'issues' => $issues];
        }

        // 为缺端点的模型补充具体供应商名，提示更可操作
        if (!empty($endpointIssueIds)) {
            $epPlaceholders = implode(',', array_fill(0, count($endpointIssueIds), '?'));
            $nameRows = Db::connect('pgsql')->query(
                "select distinct m.id as model_id, p.name as provider_name"
                . " from models m"
                . " join upstream_model_mappings umm on umm.model_id = m.id and umm.status = 'active'"
                . " join upstream_keys uk on uk.id = umm.upstream_key_id and uk.status = 'active'"
                . " join providers p on p.id = uk.provider_id and p.status = 'active'"
                . " where m.id in ($epPlaceholders)"
                . " and not exists ("
                . "   select 1 from provider_endpoints pe"
                . "   where pe.provider_id = p.id"
                . "     and (umm.provider_endpoint_id is null or pe.id = umm.provider_endpoint_id)"
                . "     and pe.status = 'active' and pe.protocol in ($protocols)"
                . " )",
                $endpointIssueIds
            );
            $namesByModel = [];
            foreach ($nameRows as $nr) {
                $namesByModel[(string) $nr['model_id']][] = $nr['provider_name'];
            }
            foreach ($endpointIssueIds as $mid) {
                $names = $namesByModel[$mid] ?? [];
                $suffix = $names === [] ? '' : '（' . implode('、', $names) . '）';
                $result[$mid]['issues'] = [
                    '供应商缺少可用的活跃端点' . $suffix . '：请在「供应商 → 端点」为其添加 status=active 且协议兼容的 provider endpoint',
                ];
            }
        }
        return $result;
    }

    /** PG 布尔字段兼容解析（PDO 可能返回 t/f、true/false、1/0） */
    private static function pgBool($value): bool
    {
        return in_array($value, [true, 't', 'true', '1', 1], true);
    }

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
            // 模型级最大输出：NULL/0 = 未声明，/v1/models 回退取活跃映射 MAX(max_tokens)
            'max_tokens'            => $this->nullableInt('max_tokens'),
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
            // 映射级上下文窗口：仅配置展示，路由过滤逻辑后续实现；NULL = 未声明，沿用模型级值
            'context_window_tokens'  => $this->nullableInt('context_window_tokens'),
            'thinking_config_json'   => ThinkingConfig::build(
                $this->request->post('supported_efforts'),
                trim((string) $this->request->post('default_effort', ''))
            ),
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
