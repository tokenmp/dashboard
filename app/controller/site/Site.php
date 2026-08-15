<?php
declare(strict_types = 1);

namespace app\controller\site;

use app\BaseController;
use app\model\Plan;
use think\facade\Db;

/**
 * 站点公开接口（site）—— landing 页游客数据，无需登录
 *
 * 提供 landing 五页所需的三类只读数据：
 *   - GET /api/v1/site/models   模型广场（模型目录 + 各自当前时刻的用户侧计费倍率）
 *   - GET /api/v1/site/plans    套餐目录（上架中的套餐模板）
 *   - GET /api/v1/site/overview 站点统计（模型数 / 供应商数 / 最低倍率）
 *
 * 口径说明（与 executor 保持一致，确保展示与扣费不漂移）：
 *   - 模型目录复刻 executor /v1/models 的可见性 JOIN 链
 *     （models × active 映射 × active 上游密钥 × active 供应商 × active 端点）；
 *   - 倍率使用与 executor ResolveMultiplier 相同的 SQL（side 维度由调用方传入，
 *     此处固定 side='user'），按「当前时刻」求值；同一模型挂多个供应商时取各
 *     供应商倍率的最小值展示（实际计费以请求命中的上游为准）。
 */
class Site extends BaseController
{
    /**
     * 用户侧计费倍率（与 executor internal/postgres/multiplier.go resolveMultiplierSQL 逐句一致）
     *
     * 参数：?1 provider_id、?2 upstream_key_id、?3 model_id、?4 protocol。
     * 公开目录场景 upstream_key_id / protocol 恒为 NULL（即只匹配通配规则）。
     */
    private const MULTIPLIER_SQL = "WITH matching_rules AS (
    SELECT
      r.id AS rule_id,
      r.multiplier,
      COALESCE(r.compose_mode, 'set') AS compose_mode,
      r.priority,
      r.created_at AS rule_created_at,
      COALESCE(r.exclusive_group, '') AS exclusive_group
    FROM price_multiplier_rules r
    CROSS JOIN LATERAL (
      SELECT
        (NOW() AT TIME ZONE COALESCE((SELECT name FROM pg_timezone_names WHERE name = NULLIF(r.timezone, '') LIMIT 1), 'UTC')) AS local_ts,
        ((SUBSTRING(r.start_time FROM 1 FOR 2)::INT * 60) + SUBSTRING(r.start_time FROM 4 FOR 2)::INT) AS start_minute,
        ((SUBSTRING(r.end_time FROM 1 FOR 2)::INT * 60) + SUBSTRING(r.end_time FROM 4 FOR 2)::INT) AS end_minute
    ) rt
    CROSS JOIN LATERAL (
      SELECT ((EXTRACT(HOUR FROM rt.local_ts)::INT * 60) + EXTRACT(MINUTE FROM rt.local_ts)::INT) AS local_minute
    ) lm
    WHERE r.status = 'active'
      AND r.side = 'user'
      AND (r.provider_id IS NULL OR r.provider_id::text = ?)
      AND (r.upstream_key_id IS NULL OR r.upstream_key_id::text = ?)
      AND (r.model_id IS NULL OR r.model_id::text = ?)
      AND (r.protocol IS NULL OR r.protocol = ?)
      AND (r.effective_from IS NULL OR NOW() >= r.effective_from)
      AND (r.effective_until IS NULL OR NOW() < r.effective_until)
      AND (COALESCE(array_length(r.days_of_week, 1), 0) = 0 OR EXTRACT(ISODOW FROM rt.local_ts)::INT = ANY(r.days_of_week))
      AND (
        (r.start_time = '00:00' AND r.end_time IN ('23:59', '24:00'))
        OR (rt.end_minute > rt.start_minute AND lm.local_minute >= rt.start_minute AND lm.local_minute < rt.end_minute)
        OR (rt.end_minute < rt.start_minute AND (lm.local_minute >= rt.start_minute OR lm.local_minute < rt.end_minute))
      )
  ), set_rules AS (
    SELECT multiplier
    FROM matching_rules
    WHERE compose_mode = 'set'
    ORDER BY priority DESC, rule_created_at DESC, rule_id ASC
    LIMIT 1
  ), multiply_rules AS (
    SELECT multiplier
    FROM matching_rules
    WHERE compose_mode = 'multiply' AND exclusive_group = ''
    UNION ALL
    SELECT multiplier
    FROM (
      SELECT DISTINCT ON (exclusive_group) multiplier
      FROM matching_rules
      WHERE compose_mode = 'multiply' AND exclusive_group <> ''
      ORDER BY exclusive_group, priority DESC, rule_created_at DESC, rule_id ASC
    ) grouped_multiply_rules
  )
SELECT
  (COALESCE((SELECT multiplier FROM set_rules), 1.0)
   * COALESCE((SELECT EXP(SUM(LN(multiplier))) FROM multiply_rules), 1.0))::float8 AS multiplier";

    /** 模型目录（可见性口径 = executor /v1/models） */
    private const CATALOG_SQL = "SELECT
  m.id, m.name, m.display_name,
  COALESCE(MIN(p.name), 'tokenmp') AS owned_by,
  COALESCE(m.capabilities, ARRAY['text']::TEXT[]) AS capabilities,
  COALESCE(MAX(COALESCE(NULLIF(umm.context_window_tokens, 0), NULLIF(m.context_window_tokens, 0))), 0) AS context_window,
  COALESCE(MAX(COALESCE(NULLIF(umm.max_tokens, 0), NULLIF(m.max_tokens, 0))), 0) AS max_tokens,
  COALESCE(m.billing_mode, 'billable') AS billing_mode
FROM models m
JOIN upstream_model_mappings umm ON umm.model_id = m.id AND umm.status = 'active'
JOIN upstream_keys uk ON uk.id = umm.upstream_key_id AND uk.status = 'active'
JOIN providers p ON p.id = uk.provider_id AND p.status = 'active'
JOIN provider_endpoints pe ON pe.provider_id = p.id
  AND (umm.provider_endpoint_id IS NULL OR pe.id = umm.provider_endpoint_id)
  AND pe.protocol IN ('openai', 'anthropic', 'openai_chat', 'openai_responses', 'anthropic_messages', 'image_generation', 'tokenmp_gateway', 'custom')
  AND pe.status = 'active'
WHERE m.status = 'active'
GROUP BY m.id, m.name, m.display_name, m.capabilities, m.context_window_tokens, m.max_tokens, m.billing_mode
ORDER BY m.name";

    /** 每个模型挂载的可用供应商（与目录同一 JOIN 链，仅取供应商维度去重） */
    private const PROVIDERS_SQL = "SELECT
  umm.model_id, p.id AS provider_id, p.name AS provider_name, p.logo_url, p.logo_svg
FROM upstream_model_mappings umm
JOIN upstream_keys uk ON uk.id = umm.upstream_key_id AND uk.status = 'active'
JOIN providers p ON p.id = uk.provider_id AND p.status = 'active'
JOIN provider_endpoints pe ON pe.provider_id = p.id
  AND (umm.provider_endpoint_id IS NULL OR pe.id = umm.provider_endpoint_id)
  AND pe.protocol IN ('openai', 'anthropic', 'openai_chat', 'openai_responses', 'anthropic_messages', 'image_generation', 'tokenmp_gateway', 'custom')
  AND pe.status = 'active'
WHERE umm.status = 'active'
GROUP BY umm.model_id, p.id, p.name
ORDER BY p.name";

    /**
     * GET /api/v1/site/models —— 模型广场
     *
     * 返回 list：[{id, name, display_name, owned_by, capabilities[], context_window,
     * max_tokens, billing_mode, multiplier, providers:[{id, name}]}]
     */
    public function models()
    {
        return success(['list' => $this->modelCatalog()]);
    }

    /**
     * GET /api/v1/site/providers/:id/logo —— 输出供应商上传的 Logo SVG
     */
    public function providerLogo($id)
    {
        $row = Db::connect('pgsql')->query(
            "SELECT logo_svg FROM providers WHERE id = ? AND status = 'active'",
            [$id]
        );
        $svg = $row[0]['logo_svg'] ?? null;
        if (!is_string($svg) || $svg === '') {
            return fail('Logo 不存在', 1, 404);
        }

        return response($svg, 200, [
            'Content-Type'  => 'image/svg+xml; charset=utf-8',
            'Cache-Control' => 'public, max-age=300',
        ]);
    }

    /**
     * GET /api/v1/site/plans —— 套餐目录（上架中）
     */
    public function plans()
    {
        $list = Plan::field(
            'id, name, plan_type, price, rolling_5h_limit, weekly_limit, '
            . 'cycle_limit, total_limit, token_limit, default_duration_days, category'
        )
            ->where('status', 'active')
            ->where('public_visible', true)
            ->order('price', 'asc')
            ->order('created_at', 'asc')
            ->select()
            ->toArray();

        return success(['list' => $list]);
    }

    /**
     * GET /api/v1/site/overview —— 站点统计（首页数据条）
     */
    public function overview()
    {
        $catalog = $this->modelCatalog();

        $providerIds = [];
        $minMultiplier = null;
        foreach ($catalog as $item) {
            foreach ($item['providers'] as $p) {
                $providerIds[$p['id']] = true;
            }
            if ($item['billing_mode'] === 'billable'
                && ($minMultiplier === null || $item['multiplier'] < $minMultiplier)) {
                $minMultiplier = $item['multiplier'];
            }
        }

        return success([
            'models'         => count($catalog),
            'providers'      => count($providerIds),
            'min_multiplier' => $minMultiplier,
        ]);
    }

    // ==================== 内部实现 ====================

    /**
     * 模型目录 + 各模型当前时刻的用户侧倍率（多供应商取最小值）
     *
     * @return array<int, array<string, mixed>>
     */
    private function modelCatalog(): array
    {
        $rows = Db::connect('pgsql')->query(self::CATALOG_SQL);

        // 供应商映射表：model_id => [{id, name}, ...]
        $providersByModel = [];
        foreach (Db::connect('pgsql')->query(self::PROVIDERS_SQL) as $pr) {
            $providersByModel[$pr['model_id']][] = [
                'id'   => (string) $pr['provider_id'],
                'name' => (string) $pr['provider_name'],
                // 有效 Logo：外链优先，其次 SVG 源码走公开输出端点；都没有则 null（前端回退内置图标）
                'logo' => self::effectiveLogo((string) $pr['provider_id'], $pr['logo_url'] ?? null, $pr['logo_svg'] ?? null),
            ];
        }

        $list = [];
        foreach ($rows as $row) {
            $modelId = (string) $row['id'];
            $providers = $providersByModel[$modelId] ?? [];

            // 每个供应商各算一次，展示最优（最小）值；实际计费以请求命中的上游为准
            $values = array_map(
                fn (array $p): float => $this->resolveMultiplier($p['id'], $modelId),
                $providers
            );
            $multiplier = $values ? min($values) : $this->resolveMultiplier(null, $modelId);

            $list[] = [
                'id'             => $modelId,
                'name'           => (string) $row['name'],
                'display_name'   => $row['display_name'],
                'owned_by'       => (string) $row['owned_by'],
                'capabilities'   => self::parsePgArray($row['capabilities'] ?? null),
                'context_window' => (int) $row['context_window'],
                'max_tokens'     => (int) $row['max_tokens'],
                'billing_mode'   => (string) $row['billing_mode'],
                'multiplier'     => round((float) $multiplier, 4),
                'providers'      => $providers,
            ];
        }

        return $list;
    }

    /**
     * 给定供应商/模型在当前时刻的用户侧组合倍率（无匹配 → 1.0）
     *
     * MULTIPLIER_SQL 把 set/multiply 两个 CTE 定义在内层 WITH 中、外层取值，
     * 与 executor 版逐句等价（仅参数占位符由 $N 改为 ?）。
     */
    private function resolveMultiplier(?string $providerId, string $modelId): float
    {
        $rows = Db::connect('pgsql')->query(self::MULTIPLIER_SQL, [$providerId, null, $modelId, null]);
        $multiplier = isset($rows[0]['multiplier']) ? (float) $rows[0]['multiplier'] : 1.0;

        return $multiplier > 0 ? $multiplier : 1.0;
    }

    /** 供应商有效 Logo 地址：外链优先，其次 SVG 端点 */
    private static function effectiveLogo(string $id, ?string $logoUrl, ?string $logoSvg): ?string
    {
        if (is_string($logoUrl) && $logoUrl !== '') {
            return $logoUrl;
        }
        if (is_string($logoSvg) && $logoSvg !== '') {
            return '/api/v1/site/providers/' . $id . '/logo';
        }

        return null;
    }

    /**
     * 解析 pg text[] 字段（PDO 返回形如 "{text,thinking}" 的字符串）
     *
     * 语义与 dashboard/Model::parsePgArray 一致，为避免 controller 间静态调用而内联。
     *
     * @return string[]
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
        if (str_starts_with($s, '{') && str_ends_with($s, '}')) {
            $inner = substr($s, 1, -1);

            return $inner === '' ? [] : array_map('trim', explode(',', $inner));
        }

        return [$s];
    }
}
