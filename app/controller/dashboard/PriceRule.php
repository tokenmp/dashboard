<?php
declare (strict_types = 1);

namespace app\controller\dashboard;

use app\BaseController;
use app\model\PriceMultiplierRule;
use app\support\Pagination;
use think\exception\HttpException;

/**
 * 价格倍率规则（price_multiplier_rules）后台管理。
 *
 * 区分上游侧（upstream 成本核算）与用户侧（user 扣费倍率）。
 * 配置粒度：provider 级（model_id 空）或 provider+model 级。
 */
class PriceRule extends BaseController
{
    /** GET /api/v1/dashboard/price/rules */
    public function list()
    {
        [$page, $size] = Pagination::page($this->request);

        $query = PriceMultiplierRule::where('status', '<>', 'deleted');

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
        $list = $query->page($page, $size)->select();

        $data = $list->toArray();
        foreach ($data as &$r) {
            $r['days_of_week'] = $this->parseIntArray($r['days_of_week'] ?? null);
        }
        unset($r);
        return success(Pagination::wrap($data, $total, $page, $size));
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

    /** 读取并校验规则输入（provider 级 / provider+model 级） */
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

        return [
            'side'          => $side,
            'provider_id'   => $providerId !== '' ? $providerId : null,
            'model_id'      => $modelId !== '' ? $modelId : null,
            'upstream_key_id' => null,
            'protocol'      => null,
            'timezone'      => 'UTC',
            'start_time'    => '00:00',
            'end_time'      => '23:59',
            'multiplier'    => $multiplier,
            'priority'      => (int) $this->request->post('priority', 0),
            'compose_mode'  => 'set',
            'status'        => 'active',
        ];
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
