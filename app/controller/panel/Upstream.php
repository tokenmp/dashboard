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
use app\service\UpstreamKeyService;
use app\support\Pagination;
use think\exception\HttpException;
use think\facade\Db;
use think\facade\Cache;

/**
 * 用户面：我持有的上游 Key 与模型目录（panel）
 *
 * 路由前缀 /api/v1/panel/upstream
 * - GET    /keys                       我自有的上游 Key 列表（脱敏）
 * - GET    /keys/create-options        新建可选供应商与模型（来自平台目录模板）
 * - POST   /keys                       新建自有 Key（自带 API key + 选模型 + 计费模式）
 * - GET    /keys/:id                   详情 + mappings + route_groups + 最近 verifications
 * - PUT    /keys/:id                   改名 / 切换计费模式 / 换 key
 * - POST   /keys/:id/status            启用/禁用
 * - DELETE /keys/:id                   软删除（连带 mappings）
 * - POST   /keys/:id/probe             连通性探测（30s 节流）
 * - POST   /keys/:id/models            增加模型映射（模板克隆）
 * - DELETE /keys/:id/models/:mid       移除模型映射
 * - GET    /models                     全平台可用模型目录
 *
 * 写路径全部强制 owner_user_id=self；自有 Key 挂在平台供应商目录上
 * （base_url 仍由管理员维护），模型映射以同供应商平台 key 的 active mapping 为模板克隆。
 * 脱敏：永不返回 encrypted_key / encryption_version。
 */
class Upstream extends BaseController
{
    /** 每用户自有上游 Key 上限 */
    private const MAX_OWN_KEYS = 10;

    /** 每个自有 Key 的模型映射上限 */
    private const MAX_MAPPINGS_PER_KEY = 50;

    /** 探测节流窗口（秒） */
    private const PROBE_THROTTLE_SECONDS = 30;

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

        // 调用概况（近 30 天，按 attempt 维度）：让用户看到自己的 key 被使用的情况
        $keyIds = $list->column('id');
        $usage = [];
        if (!empty($keyIds)) {
            $in = implode(',', array_fill(0, count($keyIds), '?'));
            $rows = Db::connect('pgsql')->query(
                "select upstream_key_id, count(*) as attempts_30d,"
                . " count(*) filter (where status_code >= 200 and status_code < 400) as ok_30d,"
                . " count(distinct request_log_id) as requests_30d,"
                . " max(created_at) as last_used_at"
                . " from request_attempts"
                . " where upstream_key_id in ($in) and created_at >= now() - interval '30 days'"
                . " group by upstream_key_id",
                $keyIds
            );
            foreach ($rows as $r) {
                $usage[$r['upstream_key_id']] = $r;
            }
        }
        $list = $list->each(function ($k) use ($usage) {
            $u = $usage[$k->id] ?? null;
            $k->usage_30d = $u ? [
                'attempts' => (int) $u['attempts_30d'],
                'ok' => (int) $u['ok_30d'],
                'requests' => (int) $u['requests_30d'],
            ] : ['attempts' => 0, 'ok' => 0, 'requests' => 0];
            $k->last_used_at = $u['last_used_at'] ?? null;
            return $k;
        });

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

        // 最近经此 key 出站的请求（用户自己的请求日志，便于看到 key 被调用的情况）
        $recentRequests = Db::connect('pgsql')->query(
            "select rl.id, rl.created_at, rl.model_name, rl.success, rl.final_status_code,"
            . " rl.total_tokens, rl.billing_plan, coalesce(rl.billing_source, '') as billing_source,"
            . " coalesce(rl.error_code, '') as error_code"
            . " from request_logs rl"
            . " where rl.user_id = ?"
            . " and exists (select 1 from request_attempts ra where ra.request_log_id = rl.id and ra.upstream_key_id = ?)"
            . " order by rl.created_at desc limit 10",
            [$ctx->userId(), $id]
        );

        return success([
            'key'           => $key,
            'mappings'      => $mappings,
            'routeGroups'   => $routeGroups,
            'verifications' => $verifications,
            'recentRequests' => $recentRequests,
        ]);
    }

    // ────────────────────────────── 自有 Key 写路径 ──────────────────────────────

    /** 平台 key + active mapping 的模板供应商选择（有模板才允许自建） */
    private const PLATFORM_TEMPLATE_JOIN =
        "join upstream_keys uk on uk.id = umm.upstream_key_id and uk.status = 'active' and COALESCE(uk.source_type, 'platform') = 'platform'";

    /**
     * GET /api/v1/panel/upstream/keys/create-options
     * 不带 provider_id：返回可选供应商列表（active 且有平台模板映射）。
     * 带 provider_id：返回该供应商下可选模型（去重，含模板 upstream_model_name）。
     */
    public function createOptions()
    {
        DataScope::forSelf(app('user'));
        $pg = Db::connect('pgsql');
        $providerId = trim((string) $this->request->get('provider_id', ''));

        if ($providerId === '') {
            $providers = $pg->query(
                "select p.id, p.name, p.display_name, p.base_url, p.logo_url, p.logo_svg,"
                . " (select count(distinct x.model_id) from ("
                . "   select t.model_id from provider_model_templates t"
                . "   where t.provider_id = p.id and t.status = 'active'"
                . "   union"
                . "   select umm.model_id from upstream_model_mappings umm"
                . "   " . self::PLATFORM_TEMPLATE_JOIN
                . "   where uk.provider_id = p.id and umm.status = 'active'"
                . " ) x) as model_count"
                . " from providers p"
                . " where p.status = 'active'"
                . " order by p.display_name nulls last, p.name"
            );
            return success(['providers' => array_values(array_filter($providers, fn ($p) => (int) $p['model_count'] > 0))]);
        }

        $provider = $pg->query("select id, name, display_name from providers where id = ? and status = 'active' limit 1", [$providerId]);
        if (empty($provider)) {
            throw new HttpException(404, '供应商不存在');
        }
        $models = $pg->query(
            "select distinct on (m.id) m.id, m.name, m.display_name, m.capabilities, m.billing_mode,"
            . " COALESCE(t.upstream_model_name, umm.upstream_model_name) as upstream_model_name,"
            . " COALESCE(t.max_tokens, umm.max_tokens) as max_tokens, m.context_window_tokens"
            . " from models m"
            . " left join provider_model_templates t on t.model_id = m.id and t.provider_id = ? and t.status = 'active'"
            . " left join upstream_model_mappings umm on umm.model_id = m.id and umm.status = 'active'"
            . "   and exists (select 1 from upstream_keys uk where uk.id = umm.upstream_key_id"
            . "     and uk.status = 'active' and COALESCE(uk.source_type, 'platform') = 'platform'"
            . "     and uk.provider_id = ?)"
            . " where m.status = 'active' and (t.id is not null or umm.id is not null)"
            . " order by m.id, umm.id",
            [$providerId, $providerId]
        );
        foreach ($models as &$m) {
            $m['capabilities'] = self::parsePgArray($m['capabilities'] ?? null);
        }
        unset($m);
        return success(['provider' => $provider[0], 'models' => $models]);
    }

    /**
     * POST /api/v1/panel/upstream/keys
     * body: provider_id, name, key, billing_mode('plan'|'free'), model_ids[]
     * 模型映射以同供应商平台 key 的 active mapping 为模板克隆（含端点/定价/思考配置/路由组）。
     */
    public function createKey()
    {
        $ctx = DataScope::forSelf(app('user'));
        $pg = Db::connect('pgsql');
        $userId = $ctx->userId();

        $providerId = trim((string) $this->request->post('provider_id', ''));
        $name = trim((string) $this->request->post('name', ''));
        $rawKey = trim((string) $this->request->post('key', ''));
        $billingMode = trim((string) $this->request->post('billing_mode', 'plan')) ?: 'plan';
        $modelIds = $this->request->post('model_ids', []);

        if ($providerId === '' || $name === '' || $rawKey === '') {
            throw new HttpException(400, 'provider_id、name、key 必填');
        }
        if (mb_strlen($name) > 64) {
            throw new HttpException(400, 'name 过长（≤64 字符）');
        }
        if (strlen($rawKey) < 8 || strlen($rawKey) > 512) {
            throw new HttpException(400, 'key 长度非法（8-512 字符）');
        }
        if (!in_array($billingMode, ['plan', 'free'], true)) {
            throw new HttpException(400, 'billing_mode 仅支持 plan / free');
        }
        if (!is_array($modelIds) || $modelIds === []) {
            throw new HttpException(400, 'model_ids 必填（至少选择一个模型）');
        }
        $modelIds = array_values(array_unique(array_map('strval', $modelIds)));
        if (count($modelIds) > self::MAX_MAPPINGS_PER_KEY) {
            throw new HttpException(400, '单次最多添加 ' . self::MAX_MAPPINGS_PER_KEY . ' 个模型');
        }

        $provider = $pg->query("select id from providers where id = ? and status = 'active' limit 1", [$providerId]);
        if (empty($provider)) {
            throw new HttpException(404, '供应商不存在');
        }

        $ownCount = (int) $pg->query(
            "select count(*) as c from upstream_keys where owner_user_id = ? and status <> 'deleted'",
            [$userId]
        )[0]['c'];
        if ($ownCount >= self::MAX_OWN_KEYS) {
            throw new HttpException(400, '自有上游 Key 数量已达上限（' . self::MAX_OWN_KEYS . ' 个）');
        }

        // 校验所选模型在该供应商下有模板（模板表 ∪ 平台 key 映射）
        $this->assertModelIdsHaveTemplate($pg, $providerId, $modelIds);

        $keyId = UpstreamKeyService::genUuid();
        $encrypted = UpstreamKeyService::encryptKey($rawKey);
        $upstreamNames = $this->upstreamNamesInput();

        $pg->transaction(function () use ($pg, $keyId, $providerId, $name, $rawKey, $encrypted, $billingMode, $userId, $modelIds, $upstreamNames) {
            $pg->execute(
                "INSERT INTO upstream_keys (id, provider_id, name, key_prefix, key_suffix, encrypted_key, encryption_version, "
                . "max_concurrency, priority, quota_type, status, source_type, owner_user_id, visibility, review_status, market_status, billing_mode, created_at, updated_at) "
                . "VALUES (?,?,?,?,?,?,1,10,0,'token_plan','active','user',?,'private','approved','offline',?, NOW(), NOW())",
                [$keyId, $providerId, $name, substr($rawKey, 0, 4), substr($rawKey, -4), $encrypted, $userId, $billingMode]
            );
            $this->cloneTemplateMappings($pg, $keyId, $providerId, $modelIds, $upstreamNames);
        });

        return success(['id' => $keyId]);
    }

    /**
     * PUT /api/v1/panel/upstream/keys/:id —— 改名 / 切换 billing_mode / 换 key / 换供应商。
     * 换供应商（provider_id ≠ 当前）：必须同时携带 model_ids（新供应商下要开通的模型），
     * 事务内软删旧映射 → 按新供应商平台模板重克隆；端点随之变化，verified_at 重置。
     */
    public function updateKey($id)
    {
        $ctx = DataScope::forSelf(app('user'));
        $pg = Db::connect('pgsql');
        $own = $this->requireOwnKey($pg, $id, $ctx->userId());

        $sets = [];
        $args = [];
        $name = trim((string) $this->request->post('name', ''));
        if ($name !== '') {
            if (mb_strlen($name) > 64) {
                throw new HttpException(400, 'name 过长（≤64 字符）');
            }
            $sets[] = 'name = ?';
            $args[] = $name;
        }
        $billingMode = trim((string) $this->request->post('billing_mode', ''));
        if ($billingMode !== '') {
            if (!in_array($billingMode, ['plan', 'free'], true)) {
                throw new HttpException(400, 'billing_mode 仅支持 plan / free');
            }
            $sets[] = 'billing_mode = ?';
            $args[] = $billingMode;
        }
        $rawKey = trim((string) $this->request->post('key', ''));
        if ($rawKey !== '') {
            if (strlen($rawKey) < 8 || strlen($rawKey) > 512) {
                throw new HttpException(400, 'key 长度非法（8-512 字符）');
            }
            $sets[] = 'encrypted_key = ?';
            $args[] = UpstreamKeyService::encryptKey($rawKey);
            $sets[] = 'key_prefix = ?';
            $args[] = substr($rawKey, 0, 4);
            $sets[] = 'key_suffix = ?';
            $args[] = substr($rawKey, -4);
        }

        // 换供应商：校验新供应商有模板 + 必须重选模型（映射按新模板整体重建）
        $providerId = trim((string) $this->request->post('provider_id', ''));
        $switchingProvider = $providerId !== '' && $providerId !== $own['provider_id'];
        $modelIds = [];
        if ($switchingProvider) {
            $provider = $pg->query("select id from providers where id = ? and status = 'active' limit 1", [$providerId]);
            if (empty($provider)) {
                throw new HttpException(404, '供应商不存在');
            }
            $modelIds = $this->request->post('model_ids', []);
            if (!is_array($modelIds) || $modelIds === []) {
                throw new HttpException(400, '更换供应商时必须重新选择模型');
            }
            $modelIds = array_values(array_unique(array_map('strval', $modelIds)));
            $this->assertModelIdsHaveTemplate($pg, $providerId, $modelIds);
            $sets[] = 'provider_id = ?';
            $args[] = $providerId;
        }

        if ($sets === []) {
            throw new HttpException(400, '没有可更新字段');
        }
        // 换 key 或换供应商都会使既有探测结论失效
        if ($rawKey !== '' || $switchingProvider) {
            $sets[] = 'verified_at = NULL';
            $sets[] = 'last_validation_error = NULL';
        }
        $sets[] = 'updated_at = NOW()';
        $args[] = $id;
        $upstreamNames = $switchingProvider ? $this->upstreamNamesInput() : [];
        $pg->transaction(function () use ($pg, $sets, $args, $id, $ctx, $switchingProvider, $providerId, $modelIds, $upstreamNames) {
            $pg->execute(
                "UPDATE upstream_keys SET " . implode(', ', $sets) . " WHERE id = ? AND owner_user_id = ? AND status <> 'deleted'",
                array_merge($args, [$ctx->userId()])
            );
            if ($switchingProvider) {
                $pg->execute(
                    "UPDATE upstream_model_mappings SET status = 'deleted', updated_at = NOW() WHERE upstream_key_id = ? AND status <> 'deleted'",
                    [$id]
                );
                $this->cloneTemplateMappings($pg, $id, $providerId, $modelIds, $upstreamNames);
            }
        });
        return success(['id' => $id, 'billing_mode' => $billingMode !== '' ? $billingMode : $own['billing_mode']]);
    }

    /** POST /api/v1/panel/upstream/keys/:id/status —— 启用/禁用 */
    public function updateKeyStatus($id)
    {
        $ctx = DataScope::forSelf(app('user'));
        $pg = Db::connect('pgsql');
        $this->requireOwnKey($pg, $id, $ctx->userId());

        $status = trim((string) $this->request->post('status', ''));
        if (!in_array($status, ['active', 'disabled'], true)) {
            throw new HttpException(400, 'status 非法');
        }
        $pg->execute(
            "UPDATE upstream_keys SET status = ?, updated_at = NOW() WHERE id = ? AND owner_user_id = ? AND status <> 'deleted'",
            [$status, $id, $ctx->userId()]
        );
        return success(['id' => $id]);
    }

    /** DELETE /api/v1/panel/upstream/keys/:id —— 软删 key + 连带 mappings */
    public function deleteKey($id)
    {
        $ctx = DataScope::forSelf(app('user'));
        $pg = Db::connect('pgsql');
        $this->requireOwnKey($pg, $id, $ctx->userId());

        $pg->transaction(function () use ($pg, $id) {
            $pg->execute(
                "UPDATE upstream_keys SET status = 'deleted', updated_at = NOW() WHERE id = ? AND status <> 'deleted'",
                [$id]
            );
            $pg->execute(
                "UPDATE upstream_model_mappings SET status = 'deleted', updated_at = NOW() WHERE upstream_key_id = ? AND status <> 'deleted'",
                [$id]
            );
        });
        return success(['id' => $id]);
    }

    /** POST /api/v1/panel/upstream/keys/:id/probe —— 连通性探测（30s 节流） */
    public function probeKey($id)
    {
        $ctx = DataScope::forSelf(app('user'));
        $pg = Db::connect('pgsql');

        $throttleKey = 'uprobe:' . $ctx->userId() . ':' . $id;
        if (Cache::get($throttleKey)) {
            throw new HttpException(429, '探测过于频繁，请 ' . self::PROBE_THROTTLE_SECONDS . ' 秒后再试');
        }
        Cache::set($throttleKey, 1, self::PROBE_THROTTLE_SECONDS);

        $row = $pg->query(
            "SELECT uk.encrypted_key, p.base_url, "
            . "COALESCE(pe.path, '') AS path, COALESCE(pe.protocol, '') AS protocol, COALESCE(pe.auth_type, 'bearer') AS auth_type, "
            . "COALESCE(umm.upstream_model_name, '') AS upstream_model_name "
            . "FROM upstream_keys uk "
            . "JOIN providers p ON p.id = uk.provider_id "
            . "LEFT JOIN LATERAL (SELECT path, protocol, auth_type FROM provider_endpoints WHERE provider_id = uk.provider_id AND status <> 'deleted' ORDER BY created_at LIMIT 1) pe ON true "
            . "LEFT JOIN LATERAL (SELECT upstream_model_name FROM upstream_model_mappings WHERE upstream_key_id = uk.id AND status <> 'deleted' LIMIT 1) umm ON true "
            . "WHERE uk.id = ? AND uk.owner_user_id = ? AND uk.status <> 'deleted' LIMIT 1",
            [$id, $ctx->userId()]
        );
        if (empty($row)) {
            throw new HttpException(404, '上游 Key 不存在');
        }
        $k = $row[0];
        if ($k['path'] === '' || $k['protocol'] === '') {
            throw new HttpException(400, '该账号未绑定端点/映射，无法探测');
        }
        $rawKey = UpstreamKeyService::decryptKey($k['encrypted_key']);
        $result = UpstreamKeyService::doProbe($k['base_url'], $k['path'], $k['protocol'], $k['auth_type'], $rawKey, $k['upstream_model_name']);
        UpstreamKeyService::recordVerification($id, $result);
        return success($result);
    }

    /** POST /api/v1/panel/upstream/keys/:id/models —— 增加模型映射（模板克隆） */
    public function addModels($id)
    {
        $ctx = DataScope::forSelf(app('user'));
        $pg = Db::connect('pgsql');
        $own = $this->requireOwnKey($pg, $id, $ctx->userId());

        $modelIds = $this->request->post('model_ids', []);
        if (!is_array($modelIds) || $modelIds === []) {
            throw new HttpException(400, 'model_ids 必填');
        }
        $modelIds = array_values(array_unique(array_map('strval', $modelIds)));

        $existing = (int) $pg->query(
            "select count(*) as c from upstream_model_mappings where upstream_key_id = ? and status <> 'deleted'",
            [$id]
        )[0]['c'];
        if ($existing + count($modelIds) > self::MAX_MAPPINGS_PER_KEY) {
            throw new HttpException(400, '模型映射数量已达上限（' . self::MAX_MAPPINGS_PER_KEY . ' 个）');
        }

        $upstreamNames = $this->upstreamNamesInput();
        $pg->transaction(function () use ($pg, $id, $own, $modelIds, $upstreamNames) {
            $this->cloneTemplateMappings($pg, $id, $own['provider_id'], $modelIds, $upstreamNames);
        });
        return success(['id' => $id]);
    }

    /**
     * PUT /api/v1/panel/upstream/keys/:id/models/:mid —— 修改单条映射的转发目标
     * body: { upstream_model_name }（必填；即上游侧真实模型名）
     */
    public function updateModel($id, $mid)
    {
        $ctx = DataScope::forSelf(app('user'));
        $pg = Db::connect('pgsql');
        $this->requireOwnKey($pg, $id, $ctx->userId());

        $upstreamName = self::sanitizeUpstreamModelName((string) $this->request->post('upstream_model_name', ''));
        if ($upstreamName === null) {
            throw new HttpException(400, 'upstream_model_name 必填');
        }
        $n = $pg->execute(
            "UPDATE upstream_model_mappings SET upstream_model_name = ?, updated_at = NOW()"
            . " WHERE id = ? AND upstream_key_id = ? AND status <> 'deleted'"
            . " AND EXISTS (SELECT 1 FROM upstream_keys uk WHERE uk.id = upstream_model_mappings.upstream_key_id AND uk.owner_user_id = ?)",
            [$upstreamName, $mid, $id, $ctx->userId()]
        );
        if ($n === 0) {
            throw new HttpException(404, '映射不存在');
        }
        return success(['id' => $mid, 'upstream_model_name' => $upstreamName]);
    }

    /** DELETE /api/v1/panel/upstream/keys/:id/models/:mid —— 移除模型映射 */
    public function removeModel($id, $mid)
    {
        $ctx = DataScope::forSelf(app('user'));
        $pg = Db::connect('pgsql');
        $this->requireOwnKey($pg, $id, $ctx->userId());

        $n = $pg->execute(
            "UPDATE upstream_model_mappings SET status = 'deleted', updated_at = NOW()"
            . " WHERE id = ? AND upstream_key_id = ? AND status <> 'deleted'"
            . " AND EXISTS (SELECT 1 FROM upstream_keys uk WHERE uk.id = upstream_model_mappings.upstream_key_id AND uk.owner_user_id = ?)",
            [$mid, $id, $ctx->userId()]
        );
        if ($n === 0) {
            throw new HttpException(404, '映射不存在');
        }
        return success(['id' => $mid]);
    }

    // ────────────────────────────── 内部辅助 ──────────────────────────────

    /** 取自己的 key（未删除），否则 404。返回 provider_id/billing_mode 等基础行。 */
    private function requireOwnKey($pg, string $id, string $userId): array
    {
        $row = $pg->query(
            "SELECT id, provider_id, billing_mode, status FROM upstream_keys"
            . " WHERE id = ? AND owner_user_id = ? AND status <> 'deleted' LIMIT 1",
            [$id, $userId]
        );
        if (empty($row)) {
            throw new HttpException(404, '上游 Key 不存在');
        }
        return $row[0];
    }

    /**
     * 校验/清洗用户指定的上游模型名（转发目标）：去空白与控制符，1-200 字符。
     * 空串返回 null（= 未指定，回落模板值）；非法长度抛 400。
     */
    private static function sanitizeUpstreamModelName(string $raw): ?string
    {
        $name = trim(preg_replace('/[\x00-\x1F\x7F]/u', '', $raw) ?? '');
        if ($name === '') {
            return null;
        }
        if (mb_strlen($name) > 200) {
            throw new HttpException(400, '上游模型名过长（≤200 字符）');
        }
        return $name;
    }

    /** 读取并校验 upstream_names（model_id → 上游模型名）映射；恒返回 string 键数组 */
    private function upstreamNamesInput(): array
    {
        $raw = $this->request->post('upstream_names', []);
        if (!is_array($raw)) {
            throw new HttpException(400, 'upstream_names 格式非法');
        }
        $out = [];
        foreach ($raw as $modelId => $name) {
            if (!is_string($name)) {
                continue;
            }
            $clean = self::sanitizeUpstreamModelName($name);
            if ($clean !== null) {
                $out[(string) $modelId] = $clean;
            }
        }
        return $out;
    }

    /**
     * 校验模型列表在该供应商下均有模板（provider_model_templates ∪ 平台 key 映射）。
     * 不满足时 400。
     */
    private function assertModelIdsHaveTemplate($pg, string $providerId, array $modelIds): void
    {
        $placeholders = implode(',', array_fill(0, count($modelIds), '?'));
        $rows = $pg->query(
            "select model_id from ("
            . " select model_id from provider_model_templates"
            . "   where provider_id = ? and status = 'active' and model_id in ($placeholders)"
            . " union"
            . " select umm.model_id from upstream_model_mappings umm"
            . " " . self::PLATFORM_TEMPLATE_JOIN
            . " where uk.provider_id = ? and umm.status = 'active' and umm.model_id in ($placeholders)"
            . ") x",
            array_merge([$providerId], $modelIds, [$providerId], $modelIds)
        );
        $validIdMap = array_flip(array_column($rows, 'model_id'));
        foreach ($modelIds as $mid) {
            if (!isset($validIdMap[$mid])) {
                throw new HttpException(400, '所选模型在该供应商下不可用（无模板）');
            }
        }
    }

    /**
     * 取某模型在该供应商下的模板行（模板表优先，回落平台 key 的 active mapping——
     * 优先级最高的平台 key 优先）。字段名与 provider_model_templates 对齐；
     * template_mapping_id 仅平台映射来源时有值（用于克隆其路由组归属）。
     */
    private function templateRowFor($pg, string $providerId, string $modelId): ?array
    {
        $tpl = $pg->query(
            "select id, upstream_model_name, input_price_per_token, output_price_per_token,"
            . " max_tokens, context_window_tokens, thinking_config::text as thinking_config, provider_endpoint_id"
            . " from provider_model_templates"
            . " where provider_id = ? and model_id = ? and status = 'active' limit 1",
            [$providerId, $modelId]
        );
        if (!empty($tpl)) {
            $row = $tpl[0];
            $row['template_mapping_id'] = null;
            return $row;
        }
        $platform = $pg->query(
            "select umm.id as template_mapping_id, umm.upstream_model_name, umm.input_price_per_token, umm.output_price_per_token, umm.max_tokens,"
            . " umm.context_window_tokens, umm.thinking_config::text as thinking_config, umm.provider_endpoint_id"
            . " from upstream_model_mappings umm"
            . " " . self::PLATFORM_TEMPLATE_JOIN
            . " where uk.provider_id = ? and umm.status = 'active' and umm.model_id = ?"
            . " order by uk.priority desc, umm.created_at asc limit 1",
            [$providerId, $modelId]
        );
        return $platform[0] ?? null;
    }

    /**
     * 按模板克隆映射到自有 key：模板来源 provider_model_templates（管理端无 Key 目录定义）
     * 或同供应商平台 key 的 active mapping。复制 upstream_model_name/端点/定价/上下文窗/
     * 思考配置；平台映射来源时克隆其路由组归属（无归属/无来源时兜底 default 组）。
     * 重复模型（该 key 已有未删映射）自动跳过。
     * $upstreamNames：model_id → 用户指定的上游模型名（覆盖模板值；空串=用模板）。
     */
    private function cloneTemplateMappings($pg, string $keyId, string $providerId, array $modelIds, array $upstreamNames = []): void
    {
        $defaultGroup = $pg->query("select id from route_groups where name = 'default' and status <> 'deleted' limit 1");
        $defaultGroupId = $defaultGroup[0]['id'] ?? null;

        foreach ($modelIds as $modelId) {
            $exists = $pg->query(
                "select 1 from upstream_model_mappings where upstream_key_id = ? and model_id = ? and status <> 'deleted' limit 1",
                [$keyId, $modelId]
            );
            if (!empty($exists)) {
                continue;
            }
            $t = $this->templateRowFor($pg, $providerId, $modelId);
            if ($t === null) {
                throw new HttpException(400, '所选模型在该供应商下无模板');
            }
            // 转发名：用户指定 > 模板值
            $upstreamName = self::sanitizeUpstreamModelName($upstreamNames[$modelId] ?? '') ?? $t['upstream_model_name'];
            $mappingId = UpstreamKeyService::genUuid();
            $pg->execute(
                "INSERT INTO upstream_model_mappings (id, upstream_key_id, model_id, upstream_model_name, "
                . "input_price_per_token, output_price_per_token, max_tokens, context_window_tokens, thinking_config, status, provider_endpoint_id, created_at, updated_at) "
                . "VALUES (?,?,?,?,?,?,?,?,?::jsonb,'active',?,NOW(),NOW())",
                [$mappingId, $keyId, $modelId, $upstreamName, $t['input_price_per_token'], $t['output_price_per_token'],
                    $t['max_tokens'], $t['context_window_tokens'], $t['thinking_config'] !== '' ? $t['thinking_config'] : null, $t['provider_endpoint_id']]
            );
            // 路由组：平台映射来源时克隆其组；模板表来源/无归属时兜底 default 组
            $groupIds = [];
            if (!empty($t['template_mapping_id'])) {
                $groups = $pg->query(
                    "select rg.id from upstream_route_group_memberships urgm"
                    . " join route_groups rg on rg.id = urgm.route_group_id and rg.status <> 'deleted'"
                    . " where urgm.upstream_model_mapping_id = ? and urgm.status <> 'deleted'",
                    [$t['template_mapping_id']]
                );
                $groupIds = array_column($groups, 'id');
            }
            if ($groupIds === [] && $defaultGroupId !== null) {
                $groupIds = [$defaultGroupId];
            }
            foreach ($groupIds as $gid) {
                $pg->execute(
                    "INSERT INTO upstream_route_group_memberships (id, upstream_model_mapping_id, route_group_id, status, created_at, updated_at) "
                    . "VALUES (?,?,?,'active',NOW(),NOW())",
                    [UpstreamKeyService::genUuid(), $mappingId, $gid]
                );
            }
        }
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
                . " uk.name as upstream_key_name, p.id as provider_id, p.name as provider_name, p.display_name as provider_display_name,"
                . " p.logo_url as provider_logo_url, p.logo_svg as provider_logo_svg"
                . " from upstream_model_mappings umm"
                . " join upstream_keys uk on uk.id = umm.upstream_key_id"
                . " join providers p on p.id = uk.provider_id"
                . " where umm.model_id in ($placeholders) and umm.status = 'active' and uk.status = 'active'"
                . " order by p.name, uk.name",
                $modelIds
            );
        }

        // 查用户侧倍率规则，算每 provider / provider+model 的 effective 倍率
        $ruleRows = Db::connect('pgsql')->query(
            "select provider_id, model_id, multiplier, priority from price_multiplier_rules where side = 'user' and status = 'active'"
        );
        $byPM = []; // provider|model => [multiplier, priority]
        $byP = [];  // provider => [multiplier, priority]
        foreach ($ruleRows as $r) {
            $pid = $r['provider_id'] ?? '';
            if ($pid === '') {
                continue;
            }
            if ($r['model_id'] !== null) {
                $k = $pid . '|' . $r['model_id'];
                if (!isset($byPM[$k]) || $r['priority'] > $byPM[$k][1]) {
                    $byPM[$k] = [(float) $r['multiplier'], (int) $r['priority']];
                }
            } else {
                if (!isset($byP[$pid]) || $r['priority'] > $byP[$pid][1]) {
                    $byP[$pid] = [(float) $r['multiplier'], (int) $r['priority']];
                }
            }
        }

        $byModel = [];
        foreach ($providerRows as $providerRow) {
            $pid = $providerRow['provider_id'];
            $eff = $byP[$pid][0] ?? 1.0;
            $pmKey = $pid . '|' . $providerRow['model_id'];
            if (isset($byPM[$pmKey])) {
                $eff = $byPM[$pmKey][0];
            }
            $byModel[$providerRow['model_id']][] = [
                'effective_multiplier'  => $eff,
                'mapping_id'             => $providerRow['mapping_id'],
                'provider_id'            => $providerRow['provider_id'],
                'provider_name'          => $providerRow['provider_name'],
                'provider_display_name'  => $providerRow['provider_display_name'],
                'provider_logo_url'      => $providerRow['provider_logo_url'],
                'provider_logo_svg'      => $providerRow['provider_logo_svg'],
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
        $countByName = [];
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
                $countByName[$r['base_name']] = $total;
                $rateByName[$r['base_name']] = $total > 0 ? round((int) $r['success'] * 100 / $total, 1) : null;
            }
        }

        foreach ($data as &$model) {
            $model['capabilities'] = self::parsePgArray($model['capabilities'] ?? null);
            $model['providers'] = $byModel[$model['id']] ?? [];
            $model['success_rate'] = $rateByName[$model['name']] ?? null;
            $model['request_count_24h'] = $countByName[$model['name']] ?? 0;
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
