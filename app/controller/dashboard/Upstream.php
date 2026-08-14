<?php
declare(strict_types=1);

namespace app\controller\dashboard;

use app\BaseController;
use app\model\AiModel;
use app\model\Provider;
use app\model\RouteGroup;
use app\model\UpstreamKey;
use app\model\UpstreamKeyVerification;
use app\model\UpstreamModelMapping;
use app\service\ModelKeyHealthService;
use app\support\Pagination;
use app\support\ThinkingConfig;
use think\exception\HttpException;
use think\facade\Db;
use think\facade\Env;

/**
 * 管理面：上游与模型（dashboard，admin）
 *
 * 路由前缀 /api/v1/dashboard
 * - GET /upstream/providers   供应商（含 endpoint/key 计数）
 * - GET /upstream/keys        上游 Key 列表（脱敏；全部，可选 sourceType）
 * - GET /upstream/keys/:id    详情 + mappings + route_groups + 最近 verifications（任意）
 * - GET /upstream/routes      路由组 + 成员映射数
 * - GET /models               平台模型目录
 *
 * Admin 中间件已保证角色。脱敏：永不返回 encrypted_key / encryption_version。
 */
class Upstream extends BaseController
{
    /** GET /api/v1/dashboard/upstream/providers */
    public function providers()
    {
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
            'id', 'name', 'display_name', 'base_url', 'status', 'endpoint_count', 'key_count', 'thinking_config', 'created_at', 'updated_at',
        ])->toArray();
        foreach ($list as &$pv) {
            $pv['thinking'] = ThinkingConfig::parse($pv['thinking_config'] ?? null);
            unset($pv['thinking_config']);
        }
        unset($pv);
        return success(Pagination::wrap($list, $total, $page, $size));
    }

    /** GET /api/v1/dashboard/upstream/keys */
    public function keys()
    {
        [$page, $size] = Pagination::page($this->request);

        $query = UpstreamKey::with(['provider', 'ownerUser'])
            ->where('status', '<>', 'deleted');

        $sourceType = trim((string) $this->request->get('sourceType', ''));
        if ($sourceType !== '') {
            $query->where('source_type', $sourceType);
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

        $providerId = trim((string) $this->request->get('providerId', ''));
        if ($providerId !== '') {
            $query->where('provider_id', $providerId);
        }

        Pagination::applyTimeRange($query, $this->request, 'created_at');
        $total = $query->count();
        Pagination::applySort($query, $this->request, ['created_at', 'priority'], '-created_at');
        $list = $query->page($page, $size)->select();

        $list->hidden(['encrypted_key', 'encryption_version']);

        return success(Pagination::wrap($list, $total, $page, $size));
    }

    /** GET /api/v1/dashboard/upstream/keys/:id */
    public function keyDetail($id)
    {
        $key = UpstreamKey::with(['provider', 'ownerUser'])
            ->where('id', $id)
            ->where('status', '<>', 'deleted')
            ->find();
        if ($key === null) {
            throw new HttpException(404, '上游 Key 不存在');
        }
        $key->hidden(['encrypted_key', 'encryption_version']);

        $mappings = UpstreamModelMapping::where('upstream_key_id', $id)
            ->where('status', '<>', 'deleted')
            ->with(['model', 'providerEndpoint'])
            ->order('created_at', 'desc')
            ->select();

        $routeGroups = Db::connect('pgsql')->query(
            "select rg.id, rg.name, rg.display_name, rg.is_system, rg.status"
            . " from upstream_route_group_memberships urgm"
            . " join route_groups rg on rg.id = urgm.route_group_id"
            . " where urgm.upstream_model_mapping_id in (select id from upstream_model_mappings where upstream_key_id = ?)"
            . " and urgm.status <> 'deleted' and rg.status <> 'deleted'",
            [$id]
        );

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

    /** GET /api/v1/dashboard/upstream/routes */
    public function routes()
    {
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

    /** GET /api/v1/dashboard/models */
    public function models()
    {
        [$page, $size] = Pagination::page($this->request);

        $query = AiModel::where('status', '<>', 'deleted');
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

        // PostgreSQL text[] 经 PDO 返回为 "{a,b}" 字符串，转为真数组
        $data = $list->toArray();

        // 批量取模型在各供应商下的映射（避免 N+1）
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

        foreach ($data as &$m) {
            $m['capabilities'] = self::parsePgArray($m['capabilities'] ?? null);
            $m['providers'] = $byModel[$m['id']] ?? [];
        }
        unset($m);

        return success(Pagination::wrap($data, $total, $page, $size));
    }

    /** GET /api/v1/dashboard/upstream/model-key-health?model_id=xxx */
    public function modelKeyHealth()
    {
        $modelId = trim((string) $this->request->get('model_id', ''));
        return success(ModelKeyHealthService::getModelKeyHealth($modelId));
    }

    /** 解析 PostgreSQL text[] 字面量（如 "{a,b}"）为 PHP 数组 */
    private static function parsePgArray($value): array
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

    /** POST /api/v1/dashboard/upstream/providers */
    public function createProvider()
    {
        $name = trim((string) $this->request->post('name', ''));
        if ($name === '') {
            throw new HttpException(400, 'name 必填');
        }
        $displayName = trim((string) $this->request->post('display_name', ''));
        $baseUrl = trim((string) $this->request->post('base_url', ''));
        $id = $this->genUuid();
        Db::connect('pgsql')->execute(
            "INSERT INTO providers (id, name, display_name, base_url, status, created_at, updated_at) VALUES (?,?,?,?, 'active', NOW(), NOW())",
            [$id, $name, $displayName !== '' ? $displayName : null, $baseUrl]
        );
        return success(['id' => $id]);
    }

    /** PUT /api/v1/dashboard/upstream/providers/:id/thinking-config —— 供应商级思考配置 */
    public function updateProviderThinkingConfig($id)
    {
        $exists = Provider::where('id', $id)->where('status', '<>', 'deleted')->find();
        if ($exists === null) {
            throw new HttpException(404, '供应商不存在');
        }
        $json = ThinkingConfig::fromRequest($this->request);
        Db::connect('pgsql')->execute(
            "UPDATE providers SET thinking_config = ?::jsonb, updated_at = NOW() WHERE id = ?",
            [$json, $id]
        );
        return success(['id' => $id]);
    }

    /** GET /api/v1/dashboard/upstream/providers/:id/endpoints */
    public function endpoints($id)
    {
        $rows = Db::connect('pgsql')->query(
            "SELECT id, provider_id, protocol, path, status, kind, adapter, method, auth_type, request_mode FROM provider_endpoints WHERE provider_id = ? AND status <> 'deleted' ORDER BY created_at",
            [$id]
        );
        return success($rows);
    }

    /** POST /api/v1/dashboard/upstream/providers/:id/endpoints */
    public function createEndpoint($id)
    {
        $exists = Db::connect('pgsql')->query("SELECT 1 FROM providers WHERE id = ? LIMIT 1", [$id]);
        if (empty($exists)) {
            throw new HttpException(404, '供应商不存在');
        }
        $row = $this->endpointInput();
        $eid = $this->genUuid();
        Db::connect('pgsql')->execute(
            "INSERT INTO provider_endpoints (id, provider_id, protocol, path, status, kind, adapter, method, auth_type, request_mode, headers, created_at, updated_at) "
            . "VALUES (?,?,?,?,?,?,?,?,?,?,'{}'::jsonb,NOW(),NOW())",
            [$eid, $id, $row['protocol'], $row['path'], $row['status'], $row['kind'], $row['adapter'], $row['method'], $row['auth_type'], $row['request_mode']]
        );
        return success(['id' => $eid]);
    }

    /** PUT /api/v1/dashboard/upstream/endpoints/:id */
    public function updateEndpoint($id)
    {
        $row = $this->endpointInput();
        Db::connect('pgsql')->execute(
            "UPDATE provider_endpoints SET protocol=?, path=?, status=?, kind=?, adapter=?, method=?, auth_type=?, request_mode=?, updated_at=NOW() WHERE id=? AND status <> 'deleted'",
            [$row['protocol'], $row['path'], $row['status'], $row['kind'], $row['adapter'], $row['method'], $row['auth_type'], $row['request_mode'], $id]
        );
        return success(['id' => $id]);
    }

    /** DELETE /api/v1/dashboard/upstream/endpoints/:id */
    public function deleteEndpoint($id)
    {
        Db::connect('pgsql')->execute(
            "UPDATE provider_endpoints SET status='deleted', updated_at=NOW() WHERE id=?",
            [$id]
        );
        return success(['id' => $id]);
    }

    private function endpointInput(): array
    {
        $protocol = trim((string) $this->request->post('protocol', ''));
        $path = trim((string) $this->request->post('path', ''));
        if ($protocol === '' || $path === '') {
            throw new HttpException(400, 'protocol 与 path 必填');
        }
        return [
            'protocol'     => $protocol,
            'path'         => $path,
            'status'       => trim((string) $this->request->post('status', 'active')) ?: 'active',
            'kind'         => trim((string) $this->request->post('kind', '')) ?: null,
            'adapter'      => trim((string) $this->request->post('adapter', '')) ?: null,
            'method'       => trim((string) $this->request->post('method', 'POST')) ?: 'POST',
            'auth_type'    => trim((string) $this->request->post('auth_type', 'bearer')) ?: 'bearer',
            'request_mode' => trim((string) $this->request->post('request_mode', '')) ?: null,
        ];
    }

    private function genUuid(): string
    {
        return Db::connect('pgsql')->query('select gen_random_uuid() as id')[0]['id'];
    }

    /** POST /api/v1/dashboard/upstream/providers/:id/keys */
    public function createKey($id)
    {
        $exists = Db::connect('pgsql')->query("SELECT 1 FROM providers WHERE id = ? LIMIT 1", [$id]);
        if (empty($exists)) {
            throw new HttpException(404, '供应商不存在');
        }
        $name = trim((string) $this->request->post('name', ''));
        $rawKey = trim((string) $this->request->post('key', ''));
        if ($name === '' || $rawKey === '') {
            throw new HttpException(400, 'name 与 key 必填');
        }
        $encrypted = $this->encryptKey($rawKey);
        $keyId = $this->genUuid();
        $quotaType = trim((string) $this->request->post('quota_type', 'token_plan')) ?: 'token_plan';
        $maxConcurrency = (int) ($this->request->post('max_concurrency', 10) ?: 10);
        $priority = (int) ($this->request->post('priority', 0) ?: 0);
        $expiresRaw = trim((string) $this->request->post('expires_at', ''));
        Db::connect('pgsql')->execute(
            "INSERT INTO upstream_keys (id, provider_id, name, key_prefix, key_suffix, encrypted_key, encryption_version, "
            . "max_concurrency, priority, quota_type, expires_at, status, source_type, visibility, review_status, market_status, created_at, updated_at) "
            . "VALUES (?,?,?,?,?,?,1,?,?,?,NULLIF(?, '')::timestamptz, 'active','platform','private','approved','online', NOW(), NOW())",
            [$keyId, $id, $name, substr($rawKey, 0, 4), substr($rawKey, -4), $encrypted, $maxConcurrency, $priority, $quotaType, $expiresRaw]
        );
        return success(['id' => $keyId]);
    }

    /** AES-256-GCM 加密（与执行器 crypto 对齐：key=sha256(master), 输出 v1:+base64url(nonce+ciphertext+tag)） */
    private function encryptKey(string $plaintext): string
    {
        $masterKey = (string) Env::get('MASTER_ENCRYPTION_KEY', '');
        if ($masterKey === '') {
            throw new HttpException(500, '未配置 MASTER_ENCRYPTION_KEY');
        }
        $key = hash('sha256', $masterKey, true);
        $nonce = random_bytes(12);
        $tag = '';
        $ct = openssl_encrypt($plaintext, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $nonce, $tag);
        if ($ct === false) {
            throw new HttpException(500, '加密失败');
        }
        return 'v1:' . rtrim(strtr(base64_encode($nonce . $ct . $tag), '+/', '-_'), '=');
    }

    /** POST /api/v1/dashboard/upstream/keys/:id/probe — 探测上游账号连通性/可用性 */
    public function probeKey($id)
    {
        $row = Db::connect('pgsql')->query(
            "SELECT uk.encrypted_key, p.base_url, "
            . "COALESCE(pe.path, '') AS path, COALESCE(pe.protocol, '') AS protocol, COALESCE(pe.auth_type, 'bearer') AS auth_type, "
            . "COALESCE(umm.upstream_model_name, '') AS upstream_model_name "
            . "FROM upstream_keys uk "
            . "JOIN providers p ON p.id = uk.provider_id "
            . "LEFT JOIN LATERAL (SELECT path, protocol, auth_type FROM provider_endpoints WHERE provider_id = uk.provider_id AND status <> 'deleted' ORDER BY created_at LIMIT 1) pe ON true "
            . "LEFT JOIN LATERAL (SELECT upstream_model_name FROM upstream_model_mappings WHERE upstream_key_id = uk.id AND status <> 'deleted' LIMIT 1) umm ON true "
            . "WHERE uk.id = ? AND uk.status <> 'deleted' LIMIT 1",
            [$id]
        );
        if (empty($row)) {
            throw new HttpException(404, '账号不存在');
        }
        $k = $row[0];
        if ($k['path'] === '' || $k['protocol'] === '') {
            throw new HttpException(400, '该账号未绑定端点/映射，无法探测');
        }
        $rawKey = $this->decryptKey($k['encrypted_key']);
        $result = $this->doProbe($k['base_url'], $k['path'], $k['protocol'], $k['auth_type'], $rawKey, $k['upstream_model_name']);

        $vid = $this->genUuid();
        Db::connect('pgsql')->execute(
            "INSERT INTO upstream_key_verifications (id, upstream_key_id, status, http_status, latency_ms, error_code, error_message, verified_models, created_at) "
            . "VALUES (?,?,?,?, ?, ?, ?, ?::jsonb, NOW())",
            [$vid, $id, $result['status'], $result['http_status'], $result['latency_ms'], $result['error_code'] ?: null, $result['error_message'] ?: null, json_encode($result['verified_models'])]
        );
        Db::connect('pgsql')->execute(
            "UPDATE upstream_keys SET verified_at = NOW(), last_validation_error = ?, updated_at = NOW() WHERE id = ?",
            [$result['status'] === 'success' ? null : $result['error_message'], $id]
        );
        return success($result);
    }

    /** POST /api/v1/dashboard/upstream/keys/:id/status — 启用/禁用上游账号 */
    public function updateKeyStatus($id)
    {
        $status = trim((string) $this->request->post('status', ''));
        if (!in_array($status, ['active', 'disabled'], true)) {
            throw new HttpException(400, 'status 非法');
        }
        Db::connect('pgsql')->execute(
            "UPDATE upstream_keys SET status = ?, updated_at = NOW() WHERE id = ? AND status <> 'deleted'",
            [$status, $id]
        );
        return success(['id' => $id]);
    }

    /** POST /api/v1/dashboard/upstream/keys/:id/delete — 删除上游账号（软删除） */
    public function deleteKey($id)
    {
        Db::connect('pgsql')->execute(
            "UPDATE upstream_keys SET status = 'deleted', updated_at = NOW() WHERE id = ? AND status <> 'deleted'",
            [$id]
        );
        return success(['id' => $id]);
    }

    /** 用 cURL 发最小探测请求，按协议构造 auth 与 body */
    private function doProbe(string $baseUrl, string $path, string $protocol, string $authType, string $rawKey, string $model): array
    {
        $url = rtrim((string) $baseUrl, '/') . $path;
        $headers = ['Content-Type: application/json', 'Accept: application/json'];
        $authType = $authType !== '' ? $authType : 'bearer';
        if ($authType === 'x-api-key') {
            $headers[] = 'x-api-key: ' . $rawKey;
            $headers[] = 'anthropic-version: 2023-06-01';
        } else {
            $headers[] = 'Authorization: Bearer ' . $rawKey;
        }
        $protocol = $protocol !== '' ? $protocol : 'openai_chat';
        if ($protocol === 'openai_responses') {
            $body = json_encode(['model' => $model, 'input' => 'hi', 'max_output_tokens' => 1]);
        } else {
            $body = json_encode(['model' => $model, 'messages' => [['role' => 'user', 'content' => 'hi']], 'max_tokens' => 1]);
        }

        $start = microtime(true);
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 15);
        $resp = (string) curl_exec($ch);
        $http = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = (string) curl_error($ch);
        curl_close($ch);
        $latency = (int) round((microtime(true) - $start) * 1000);

        if ($err !== '' || $http === 0) {
            return ['status' => 'failed', 'http_status' => null, 'latency_ms' => $latency, 'error_code' => 'NETWORK', 'error_message' => $err !== '' ? $err : '请求失败', 'verified_models' => []];
        }
        $status = ($http >= 200 && $http < 300) ? 'success' : 'failed';
        $errMsg = '';
        $errCode = '';
        $data = json_decode($resp, true);
        if (is_array($data)) {
            $errMsg = (string) ($data['error']['message'] ?? $data['message'] ?? '');
            $errCode = (string) ($data['error']['code'] ?? $data['error']['type'] ?? '');
        }
        $verified = ($status === 'success' && $model !== '') ? [$model] : [];
        return ['status' => $status, 'http_status' => $http, 'latency_ms' => $latency, 'error_code' => $errCode, 'error_message' => $errMsg, 'verified_models' => $verified];
    }

    /** AES-256-GCM 解密（与执行器 crypto 对齐） */
    private function decryptKey(string $ciphertext): string
    {
        $masterKey = (string) Env::get('MASTER_ENCRYPTION_KEY', '');
        if ($masterKey === '' || !str_starts_with($ciphertext, 'v1:')) {
            throw new HttpException(500, '解密失败');
        }
        $s = strtr(substr($ciphertext, 3), '-_', '+/');
        $pad = strlen($s) % 4;
        if ($pad) {
            $s .= str_repeat('=', 4 - $pad);
        }
        $payload = base64_decode($s, true);
        if ($payload === false || strlen($payload) < 28) {
            throw new HttpException(500, '解密失败');
        }
        $key = hash('sha256', $masterKey, true);
        $nonce = substr($payload, 0, 12);
        $tag = substr($payload, -16);
        $ct = substr($payload, 12, -16);
        $pt = openssl_decrypt($ct, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $nonce, $tag);
        if ($pt === false) {
            throw new HttpException(500, '解密失败');
        }
        return $pt;
    }
}
