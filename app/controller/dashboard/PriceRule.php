<?php
declare (strict_types = 1);

namespace app\controller\dashboard;

use app\BaseController;
use app\model\PriceMultiplierRule;
use app\support\Pagination;
use think\db\Raw;
use think\exception\HttpException;
use think\facade\Db;

/**
 * 价格倍率规则（price_multiplier_rules）后台管理。
 *
 * 区分上游侧（upstream 成本核算）与用户侧（user 扣费倍率）。
 * 配置粒度：provider 级（model_id 空）或 provider+model 级。
 *
 * 时间窗时区口径（显示与执行一致的契约）：
 * - start_time/end_time/days_of_week 按「规则自带 timezone」的墙上时间求值
 *   （executor ResolveMultiplier 用 NOW() AT TIME ZONE r.timezone），本控制器
 *   纯字符串透传，不做任何时区换算；
 * - timezone 必须存在于 pg_timezone_names——executor SQL 对非法时区名会静默
 *   回退 UTC，导致显示与执行漂移，故在写入入口校验；
 * - effective_from/effective_until 是 TIMESTAMPTZ 绝对时刻，统一归一化为
 *   UTC 后落库，避免依赖 PHP 会话时区解释本地时间字符串。
 */
class PriceRule extends BaseController
{
    /** GET /api/v1/dashboard/price/rules */
    public function list()
    {
        [$page, $size] = Pagination::page($this->request);

        // 用 Db 查询而非模型：think-orm 按 schema 把 integer[] 推断成 integer，
        // 模型 hydrate 会把 days_of_week 强转成 0，这里投影成 text 绕开。
        $query = Db::connect('pgsql')->table('price_multiplier_rules')->where('status', '<>', 'deleted');

        $side = trim((string) $this->request->get('side', ''));
        if ($side !== '') {
            $query->where('side', $side);
        }
        $providerId = trim((string) $this->request->get('providerId', ''));
        if ($providerId !== '') {
            $query->where('provider_id', $providerId);
        }
        $modelId = trim((string) $this->request->get('modelId', ''));
        if ($modelId !== '') {
            $query->where('model_id', $modelId);
        }

        Pagination::applyTimeRange($query, $this->request, 'created_at');
        $total = $query->count();
        Pagination::applySort($query, $this->request, ['priority', 'created_at'], '-priority');
        $list = $query->fieldRaw('*, days_of_week::text AS days_of_week')
            ->page($page, $size)->select()->toArray();

        foreach ($list as &$r) {
            $r['days_of_week'] = $this->parseIntArray($r['days_of_week'] ?? null);
            // 生效区间统一以 UTC ISO（带 +00:00 偏移）返回：原生查询读 timestamptz
            // 会按会话时区渲染成朴素字符串，直接透出对前端有歧义。
            $r['effective_from'] = $this->formatUtcIso($r['effective_from'] ?? null);
            $r['effective_until'] = $this->formatUtcIso($r['effective_until'] ?? null);
        }
        unset($r);
        return success(Pagination::wrap($list, $total, $page, $size));
    }

    /** POST /api/v1/dashboard/price/rules */
    public function create()
    {
        $rule = PriceMultiplierRule::create($this->readRuleInput());
        return success($rule);
    }

    /** PUT /api/v1/dashboard/price/rules/:id */
    public function update($id)
    {
        $rule = PriceMultiplierRule::where('id', $id)->where('status', '<>', 'deleted')->find();
        if ($rule === null) {
            throw new HttpException(404, '规则不存在');
        }
        $rule->save($this->readRuleInput());
        return success($rule);
    }

    /** POST /api/v1/dashboard/price/rules/:id/status */
    public function updateStatus($id)
    {
        $status = trim((string) $this->request->post('status', ''));
        if (!in_array($status, ['active', 'disabled'], true)) {
            throw new HttpException(400, 'status 非法');
        }
        $rule = PriceMultiplierRule::where('id', $id)->where('status', '<>', 'deleted')->find();
        if ($rule === null) {
            throw new HttpException(404, '规则不存在');
        }
        $rule->save(['status' => $status]);
        return success([]);
    }

    /** POST /api/v1/dashboard/price/rules/:id/delete */
    public function delete($id)
    {
        $rule = PriceMultiplierRule::where('id', $id)->where('status', '<>', 'deleted')->find();
        if ($rule === null) {
            throw new HttpException(404, '规则不存在');
        }
        $rule->save(['status' => 'deleted']);
        return success([]);
    }

    /** 读取并校验规则输入（provider 级 / provider+model 级 + 时间窗） */
    private function readRuleInput(): array
    {
        $side = trim((string) $this->request->post('side', 'user'));
        if (!in_array($side, ['upstream', 'user'], true)) {
            throw new HttpException(400, 'side 非法，仅支持 upstream / user');
        }
        $providerId = trim((string) $this->request->post('provider_id', ''));
        $modelId = trim((string) $this->request->post('model_id', ''));
        $multiplier = (float) $this->request->post('multiplier', 0);
        if ($multiplier <= 0) {
            throw new HttpException(400, '倍率须大于 0');
        }

        // 时区：墙上时间窗按它求值；默认北京时区（后台管理员语境）。
        $timezone = trim((string) $this->request->post('timezone', ''));
        if ($timezone === '') {
            $timezone = 'Asia/Shanghai';
        }
        if (!$this->isValidTimezone($timezone)) {
            throw new HttpException(400, "timezone 非法（{$timezone}），须为 PostgreSQL 认可的时区名，如 Asia/Shanghai / UTC");
        }

        // 生效星期：1=周一至 7=周日，空数组表示每天。
        $days = $this->request->post('days_of_week', []);
        if (!is_array($days)) {
            throw new HttpException(400, 'days_of_week 非法，须为数组');
        }
        $days = array_values(array_unique(array_map('intval', $days)));
        foreach ($days as $d) {
            if ($d < 1 || $d > 7) {
                throw new HttpException(400, 'days_of_week 取值须为 1（周一）至 7（周日）');
            }
        }
        sort($days);

        // 每日时间窗：HH:MM；end 额外允许 24:00（当日结束）。start==end 视为非法
        //（执行 SQL 的区间分支以 start≠end 为前提，相等窗口永不命中）。
        $startTime = trim((string) $this->request->post('start_time', '')) ?: '00:00';
        $endTime = trim((string) $this->request->post('end_time', '')) ?: '24:00';
        if (!preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $startTime)) {
            throw new HttpException(400, 'start_time 格式非法，须为 HH:MM');
        }
        if ($endTime !== '24:00' && !preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $endTime)) {
            throw new HttpException(400, 'end_time 格式非法，须为 HH:MM 或 24:00');
        }
        if ($startTime === $endTime) {
            throw new HttpException(400, 'start_time 与 end_time 不能相等（全天请用 00:00–24:00）');
        }

        // 生效区间：TIMESTAMPTZ 绝对时刻，统一归一化为 UTC 落库。
        $effectiveFrom = $this->readEffectiveTime('effective_from');
        $effectiveUntil = $this->readEffectiveTime('effective_until');
        if ($effectiveFrom !== null && $effectiveUntil !== null && $effectiveFrom >= $effectiveUntil) {
            throw new HttpException(400, 'effective_from 须早于 effective_until');
        }

        return [
            'side'          => $side,
            'provider_id'   => $providerId !== '' ? $providerId : null,
            'model_id'      => $modelId !== '' ? $modelId : null,
            'upstream_key_id' => null,
            'protocol'      => null,
            'timezone'      => $timezone,
            // think-orm 按 schema 把 integer[] 推断成 integer 绑定（'{}' 会被强转 0），
            // 须用 Raw 内联显式 cast。字面量由上方校验过的 1-7 整数拼出，无注入面。
            'days_of_week'  => new Raw(sprintf("'%s'::int[]", $days === [] ? '{}' : '{' . implode(',', $days) . '}')),
            'start_time'    => $startTime,
            'end_time'      => $endTime,
            'multiplier'    => $multiplier,
            'priority'      => (int) $this->request->post('priority', 0),
            'compose_mode'  => 'set',
            // timestamptz 同理走 Raw 显式 cast：模型的 datetime cast 会把已归一化的
            // '+00' 偏移格式化丢掉，按会话时区（Asia/Shanghai）错位 8 小时落库。
            'effective_from' => $effectiveFrom === null ? null : new Raw("'{$effectiveFrom}'::timestamptz"),
            'effective_until' => $effectiveUntil === null ? null : new Raw("'{$effectiveUntil}'::timestamptz"),
            'status'        => 'active',
        ];
    }

    /** pg_timezone_names 缓存（进程内），非法时区写入会让 executor 静默回退 UTC */
    private static ?array $pgTimezoneNames = null;

    /** 校验时区名存在于 pg_timezone_names（executor 求值只认这套名字） */
    private function isValidTimezone(string $timezone): bool
    {
        if (self::$pgTimezoneNames === null) {
            $rows = Db::connect('pgsql')->query('SELECT name FROM pg_timezone_names');
            self::$pgTimezoneNames = array_column($rows, 'name');
        }
        return in_array($timezone, self::$pgTimezoneNames, true);
    }

    /** 读取生效时刻入参并归一化为 UTC（格式 'Y-m-d H:i:s+00'，PG 无歧义解析） */
    private function readEffectiveTime(string $field): ?string
    {
        $value = trim((string) $this->request->post($field, ''));
        if ($value === '') {
            return null;
        }
        $ts = strtotime($value);
        if ($ts === false) {
            throw new HttpException(400, "{$field} 格式非法，须为可解析的时间（推荐 ISO 8601）");
        }
        return gmdate('Y-m-d H:i:s+00', $ts);
    }

    /** 生效区间出参归一化为 UTC ISO（strtotime 按字符串自带偏移解析，朴素字符串按 PHP 时区=会话时区） */
    private function formatUtcIso($value): ?string
    {
        if ($value === null || (string) $value === '') {
            return null;
        }
        $ts = strtotime((string) $value);
        return $ts === false ? null : gmdate('Y-m-d\TH:i:s+00:00', $ts);
    }

    /** 解析 PostgreSQL integer[] 字面量为 int 数组 */
    private function parseIntArray($value): array
    {
        if (is_array($value)) {
            return array_map('intval', $value);
        }
        if (!is_string($value) || $value === '') {
            return [];
        }
        $s = trim($value);
        if ($s === '{}') {
            return [];
        }
        $inner = trim($s, '{}');
        if ($inner === '') {
            return [];
        }
        return array_map('intval', explode(',', $inner));
    }
}
