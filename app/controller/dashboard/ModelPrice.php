<?php
declare(strict_types=1);

namespace app\controller\dashboard;

use app\BaseController;
use app\model\ModelPrice as ModelPriceModel;
use app\support\Pagination;
use think\exception\HttpException;
use think\facade\Db;

/**
 * 管理面：定价矩阵（model_prices）CRUD（dashboard，admin）
 *
 * 路由前缀 /api/v1/dashboard/model-prices
 * - GET  /            列表（筛选 plan_id / model_id / status）
 * - POST /            新建一行定价（plan_id 为空 = 平台默认价 L2）
 * - PUT  /:id         编辑（权重 / 单价 / 归属）
 * - POST /:id/status  上下架（status ∈ active|disabled）
 * - POST /:id/delete  软删（status=deleted）
 *
 * 语义（设计文档 §4）：plan_id 非空 = 套餐专属价（L1），为空 = 平台默认价（L2）。
 * 同一行按套餐类型解释：coding/image 用 request_weight；token/wallet 用 *_price_per_token。
 * 唯一性：同一 (plan_id, model_id) 仅允许一条未删除行（partial unique index），
 * 命中冲突返回 409，避免把 PG 唯一约束错误透出给前端。
 *
 * 写库统一走原生 SQL，数值列全部参数绑定；numeric 列不做 PHP 侧浮点运算，原样写入。
 */
class ModelPrice extends BaseController
{
    /** 允许的状态（deleted 只能经 delete 端点写入） */
    private const WRITABLE_STATUSES = ['active', 'disabled'];

    /** GET /api/v1/dashboard/model-prices */
    public function list()
    {
        [$page, $size] = Pagination::page($this->request);

        $query = ModelPriceModel::where('status', '<>', 'deleted');

        // plan_id：支持显式筛选平台默认价（plan_id IS NULL）
        $planId = $this->planIdFilter();
        if ($planId !== false) {
            if ($planId === null) {
                $query->whereNull('plan_id');
            } else {
                $query->where('plan_id', $planId);
            }
        }
        $modelId = trim((string) $this->request->get('model_id', ''));
        if ($modelId !== '') {
            $query->where('model_id', $modelId);
        }
        $status = trim((string) $this->request->get('status', ''));
        if ($status !== '') {
            $query->where('status', $status);
        }

        Pagination::applyTimeRange($query, $this->request, 'created_at');
        $total = $query->count();
        Pagination::applySort($query, $this->request, ['created_at', 'updated_at'], '-created_at');
        $list = $query->page($page, $size)->select()->toArray();

        $list = $this->attachNames($list);
        foreach ($list as &$row) {
            $row = $this->formatRow($row);
        }
        unset($row);

        return success(Pagination::wrap($list, $total, $page, $size));
    }

    /** POST /api/v1/dashboard/model-prices */
    public function create()
    {
        $row = $this->readInput();
        $this->assertNoConflict($row['plan_id'], $row['model_id'], null);

        $id = $this->genUuid();
        Db::connect('pgsql')->execute(
            "INSERT INTO model_prices (id, plan_id, model_id, request_weight, input_price_per_token, "
            . "output_price_per_token, cache_read_price_per_token, cache_write_price_per_token, "
            . "currency, status, created_at, updated_at) "
            . "VALUES (?, ?::uuid, ?::uuid, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())",
            [
                $id, $row['plan_id'], $row['model_id'], $row['request_weight'],
                $row['input_price_per_token'], $row['output_price_per_token'],
                $row['cache_read_price_per_token'], $row['cache_write_price_per_token'],
                $row['currency'], $row['status'],
            ]
        );

        return success($this->detailRow($id));
    }

    /** PUT /api/v1/dashboard/model-prices/:id */
    public function update($id)
    {
        if (ModelPriceModel::where('id', $id)->where('status', '<>', 'deleted')->find() === null) {
            throw new HttpException(404, '定价记录不存在');
        }
        $row = $this->readInput();
        $this->assertNoConflict($row['plan_id'], $row['model_id'], $id);

        Db::connect('pgsql')->execute(
            "UPDATE model_prices SET plan_id = ?::uuid, model_id = ?::uuid, request_weight = ?, "
            . "input_price_per_token = ?, output_price_per_token = ?, cache_read_price_per_token = ?, "
            . "cache_write_price_per_token = ?, currency = ?, status = ?, updated_at = NOW() "
            . "WHERE id = ?::uuid AND status <> 'deleted'",
            [
                $row['plan_id'], $row['model_id'], $row['request_weight'],
                $row['input_price_per_token'], $row['output_price_per_token'],
                $row['cache_read_price_per_token'], $row['cache_write_price_per_token'],
                $row['currency'], $row['status'], $id,
            ]
        );

        return success($this->detailRow($id));
    }

    /** POST /api/v1/dashboard/model-prices/:id/status —— status ∈ active|disabled */
    public function updateStatus($id)
    {
        $status = trim((string) $this->request->post('status', ''));
        if (!in_array($status, self::WRITABLE_STATUSES, true)) {
            throw new HttpException(400, 'status 非法，仅支持 active / disabled');
        }
        if (ModelPriceModel::where('id', $id)->where('status', '<>', 'deleted')->find() === null) {
            throw new HttpException(404, '定价记录不存在');
        }

        Db::connect('pgsql')->execute(
            "UPDATE model_prices SET status = ?, updated_at = NOW() WHERE id = ?::uuid AND status <> 'deleted'",
            [$status, $id]
        );

        return success($this->detailRow($id));
    }

    /** POST /api/v1/dashboard/model-prices/:id/delete —— 软删 */
    public function delete($id)
    {
        if (ModelPriceModel::where('id', $id)->where('status', '<>', 'deleted')->find() === null) {
            throw new HttpException(404, '定价记录不存在');
        }

        Db::connect('pgsql')->execute(
            "UPDATE model_prices SET status = 'deleted', updated_at = NOW() WHERE id = ?::uuid AND status <> 'deleted'",
            [$id]
        );

        return success([]);
    }

    // ─────────────────────────── 内部 ───────────────────────────

    /**
     * 读取 plan_id 筛选参数。
     *
     * 返回 false = 未设置筛选；null = 只筛平台默认价（plan_id IS NULL）；string = 指定套餐。
     */
    private function planIdFilter(): string|null|false
    {
        $raw = $this->request->get('plan_id');
        if ($raw === null) {
            return false;
        }
        $value = trim((string) $raw);
        if ($value === '') {
            return false;
        }
        if (in_array(strtolower($value), ['null', 'none', 'platform', 'default'], true)) {
            return null;
        }
        return $value;
    }

    /** 读取并校验定价输入（create/update 共用） */
    private function readInput(): array
    {
        $modelId = trim((string) $this->request->post('model_id', ''));
        if ($modelId === '') {
            throw new HttpException(400, 'model_id 不能为空');
        }
        $planId = trim((string) $this->request->post('plan_id', ''));
        $planId = $planId === '' ? null : $planId;

        // 外键存在性校验：把 PG 外键错误转成可读的 400
        if (Db::connect('pgsql')->query('SELECT id FROM models WHERE id = ?::uuid', [$modelId]) === []) {
            throw new HttpException(400, '模型不存在');
        }
        if ($planId !== null && Db::connect('pgsql')->query('SELECT id FROM plans WHERE id = ?::uuid', [$planId]) === []) {
            throw new HttpException(400, '套餐不存在');
        }

        $status = trim((string) $this->request->post('status', 'active'));
        if (!in_array($status, self::WRITABLE_STATUSES, true)) {
            throw new HttpException(400, 'status 非法，仅支持 active / disabled');
        }

        $currency = trim((string) $this->request->post('currency', ''));
        if ($currency === '') {
            $currency = 'CNY';
        }

        return [
            'plan_id'                     => $planId,
            'model_id'                    => $modelId,
            'request_weight'              => $this->nonNegativeOrNull('request_weight'),
            'input_price_per_token'       => $this->nonNegativeOrNull('input_price_per_token'),
            'output_price_per_token'      => $this->nonNegativeOrNull('output_price_per_token'),
            'cache_read_price_per_token'  => $this->nonNegativeOrNull('cache_read_price_per_token'),
            'cache_write_price_per_token' => $this->nonNegativeOrNull('cache_write_price_per_token'),
            'currency'                    => $currency,
            'status'                      => $status,
        ];
    }

    /** 取可空非负数字：空 → null，非数字或负数 → 400 */
    private function nonNegativeOrNull(string $key): ?float
    {
        $v = $this->request->post($key);
        if ($v === null || $v === '') {
            return null;
        }
        if (!is_numeric($v)) {
            throw new HttpException(400, "{$key} 须为数字");
        }
        $f = (float) $v;
        if ($f < 0) {
            throw new HttpException(400, "{$key} 不能为负");
        }
        return $f;
    }

    /** 同一 (plan_id, model_id) 未删除行唯一；冲突返回 409 */
    private function assertNoConflict(?string $planId, string $modelId, ?string $excludeId): void
    {
        $rows = Db::connect('pgsql')->query(
            "SELECT id FROM model_prices "
            . "WHERE model_id = ?::uuid "
            . "AND COALESCE(plan_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(?::uuid, '00000000-0000-0000-0000-000000000000'::uuid) "
            . "AND status <> 'deleted' "
            . "AND (?::uuid IS NULL OR id <> ?::uuid)",
            [$modelId, $planId, $excludeId, $excludeId]
        );
        if (!empty($rows)) {
            throw new HttpException(409, '该套餐×模型的定价已存在，请改为编辑现有记录');
        }
    }

    /** 单行详情（含套餐/模型名） */
    private function detailRow(string $id): array
    {
        $rows = Db::connect('pgsql')->table('model_prices')->where('id', $id)->select()->toArray();
        if ($rows === []) {
            throw new HttpException(404, '定价记录不存在');
        }
        $rows = $this->attachNames($rows);
        return $this->formatRow($rows[0]);
    }

    /**
     * 批量补套餐名与模型名（避免 N+1）。
     *
     * @param list<array> $rows model_prices 行
     * @return list<array>
     */
    private function attachNames(array $rows): array
    {
        $planIds  = array_values(array_unique(array_filter(array_column($rows, 'plan_id'))));
        $modelIds = array_values(array_unique(array_filter(array_column($rows, 'model_id'))));

        $planNames = [];
        if ($planIds !== []) {
            $planNames = Db::connect('pgsql')->table('plans')->whereIn('id', $planIds)->column('name', 'id');
        }
        $modelNames = [];
        if ($modelIds !== []) {
            foreach (Db::connect('pgsql')->table('models')->whereIn('id', $modelIds)->field('id, name, display_name')->select()->toArray() as $m) {
                $modelNames[$m['id']] = $m;
            }
        }

        foreach ($rows as &$row) {
            $row['plan_name'] = $row['plan_id'] !== null ? ($planNames[$row['plan_id']] ?? null) : null;
            $row['model_name'] = $modelNames[$row['model_id']]['name'] ?? null;
            $row['model_display_name'] = $modelNames[$row['model_id']]['display_name'] ?? null;
        }
        unset($row);
        return $rows;
    }

    /** numeric 出参转 float（前端直接渲染）；其余字段原样 */
    private function formatRow(array $row): array
    {
        foreach ([
            'request_weight', 'input_price_per_token', 'output_price_per_token',
            'cache_read_price_per_token', 'cache_write_price_per_token',
        ] as $k) {
            $row[$k] = ($row[$k] ?? null) !== null ? (float) $row[$k] : null;
        }
        return $row;
    }

    /** 预生成 UUID（ThinkPHP pgsql 取回 lastInsId 不可靠） */
    private function genUuid(): string
    {
        return Db::connect('pgsql')->query('select gen_random_uuid() as id')[0]['id'];
    }
}
