<?php
declare(strict_types=1);

namespace app\controller\dashboard;

use app\BaseController;
use app\model\Plan as PlanModel;
use app\support\Pagination;
use think\exception\HttpException;
use think\facade\Db;

/**
 * 管理面：套餐目录（plans 模板）CRUD（dashboard，admin）
 *
 * 路由前缀 /api/v1/dashboard/plans
 * - GET  /            套餐目录（分页+筛选 plan_type/status/keyword）
 * - POST /            新建套餐模板
 * - PUT  /:id         编辑套餐模板
 * - PUT  /:id/status  上下架/软删（status ∈ active|disabled|deleted；deleted 级联停用 user_plans）
 *
 * 注意：plans.status='disabled'（下架）不影响已发放 user_plans；status='deleted'（软删）
 * 才会级联停用所有引用此模板且 active 的 user_plans（与 Go UpdatePlanStatusSQL 行为一致）。
 */
class Plan extends BaseController
{
    private const PLAN_TYPES = ['coding', 'token', 'image'];
    private const STATUSES   = ['active', 'disabled', 'deleted'];

    /** GET /api/v1/dashboard/plans */
    public function list()
    {
        [$page, $size] = Pagination::page($this->request);

        $query = PlanModel::where('status', '<>', 'deleted');

        $planType = trim((string) $this->request->get('plan_type', ''));
        if ($planType !== '' && in_array($planType, self::PLAN_TYPES, true)) {
            $query->where('plan_type', $planType);
        }
        $status = trim((string) $this->request->get('status', ''));
        if ($status !== '') {
            $query->where('status', $status);
        }
        $keyword = trim((string) $this->request->get('keyword', ''));
        if ($keyword !== '') {
            $query->whereLike('name', "%{$keyword}%");
        }

        Pagination::applyTimeRange($query, $this->request, 'created_at');
        $total = $query->count();
        Pagination::applySort($query, $this->request, ['created_at', 'updated_at', 'price'], '-created_at');
        $list = $query->page($page, $size)->select();

        return success(Pagination::wrap($list, $total, $page, $size));
    }

    /** POST /api/v1/dashboard/plans */
    public function create()
    {
        $row               = $this->planInput();
        $row['id']         = $this->genUuid();
        $row['created_at'] = date('Y-m-d H:i:s');
        $row['updated_at'] = $row['created_at'];

        // 用原生 SQL 写入：allowed_model_names 为 jsonb，必须 ::jsonb 显式转换
        $this->rawUpsert($row, null);

        return success(PlanModel::where('id', $row['id'])->find());
    }

    /** PUT /api/v1/dashboard/plans/:id */
    public function update($id)
    {
        $plan = PlanModel::where('id', $id)->where('status', '<>', 'deleted')->find();
        if ($plan === null) {
            throw new HttpException(404, '套餐不存在');
        }
        $row              = $this->planInput();
        $row['updated_at'] = date('Y-m-d H:i:s');
        $this->rawUpsert($row, $id);

        return success(PlanModel::where('id', $id)->find());
    }

    /** PUT /api/v1/dashboard/plans/:id/status —— status ∈ active|disabled|deleted */
    public function updateStatus($id)
    {
        $status = (string) $this->request->post('status');
        if (!in_array($status, self::STATUSES, true)) {
            throw new HttpException(400, 'status 取值非法');
        }
        $plan = PlanModel::where('id', $id)->where('status', '<>', 'deleted')->find();
        if ($plan === null) {
            throw new HttpException(404, '套餐不存在');
        }

        Db::connect('pgsql')->transaction(function () use ($id, $status) {
            // 更新模板状态
            Db::connect('pgsql')->execute(
                "UPDATE plans SET status = ?, updated_at = NOW() WHERE id = ? AND status <> 'deleted'",
                [$status, $id]
            );
            // deleted：级联停用引用此模板的 active user_plans（与 Go UpdatePlanStatusSQL 一致）
            if ($status === 'deleted') {
                Db::connect('pgsql')->execute(
                    "UPDATE user_plans SET status = 'disabled' WHERE plan_id = ? AND status = 'active'",
                    [$id]
                );
            }
        });

        return success(PlanModel::where('id', $id)->find());
    }

    // ─────────────────────────── 内部 ───────────────────────────

    /** 读取并校验套餐字段（create/update 共用） */
    private function planInput(): array
    {
        $name = trim((string) $this->request->post('name', ''));
        if ($name === '') {
            throw new HttpException(400, '套餐名称不能为空');
        }
        $planType = (string) $this->request->post('plan_type', '');
        if (!in_array($planType, self::PLAN_TYPES, true)) {
            throw new HttpException(400, 'plan_type 取值非法（coding/token/image）');
        }
        $status = (string) $this->request->post('status', 'active');
        if (!in_array($status, self::STATUSES, true)) {
            throw new HttpException(400, 'status 取值非法（active/disabled/deleted）');
        }

        // 模型白名单：仅 coding 生效；其它类型强制为 []
        $allowed = $this->request->post('allowed_model_names');
        $allowedModels = is_array($allowed)
            ? array_values(array_filter(array_map('strval', $allowed), fn ($v) => $v !== ''))
            : [];
        if ($planType !== 'coding' && count($allowedModels) > 0) {
            throw new HttpException(400, '仅 coding 类型套餐可设置模型白名单');
        }

        return [
            'name'                  => $name,
            'plan_type'             => $planType,
            'hourly_5h_limit'       => $this->nullableInt('hourly_5h_limit'),
            'weekly_limit'          => $this->nullableInt('weekly_limit'),
            'monthly_limit'         => $this->nullableInt('monthly_limit'),
            'cycle_days'            => $this->nullableInt('cycle_days'),
            'total_limit'           => $this->nullableInt('total_limit'),
            'token_limit'           => $this->nullableInt('token_limit'),
            'price'                 => (float) ($this->request->post('price', 0) ?? 0),
            'status'                => $status,
            'default_duration_days' => $this->nullableInt('default_duration_days'),
            'allowed_model_names'   => $allowedModels,
            'category'              => ($c = trim((string) $this->request->post('category', ''))) === '' ? null : $c,
        ];
    }

    /** 入参为 ''/null → 返回 null（表示「不限」）；否则强转 int */
    private function nullableInt(string $key): ?int
    {
        $v = $this->request->post($key);
        if ($v === null || $v === '') {
            return null;
        }
        return (int) $v;
    }

    /**
     * 原生 INSERT/UPDATE（jsonb 列需显式 ::jsonb 转换，ThinkPHP json cast 不支持）
     * @param array $row 已规整的字段；$id=null → INSERT，否则 UPDATE
     */
    private function rawUpsert(array $row, ?string $id): void
    {
        $json = json_encode(is_array($row['allowed_model_names']) ? $row['allowed_model_names'] : [], JSON_UNESCAPED_UNICODE);
        $db = Db::connect('pgsql');
        if ($id === null) {
            $db->execute(
                "INSERT INTO plans (id, name, plan_type, hourly_5h_limit, weekly_limit, monthly_limit, cycle_days, total_limit, "
                . "token_limit, price, status, default_duration_days, allowed_model_names, category, created_at, updated_at) "
                . "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?::jsonb,?,?,?)",
                [$row['id'], $row['name'], $row['plan_type'], $row['hourly_5h_limit'],
                 $row['weekly_limit'], $row['monthly_limit'], $row['cycle_days'], $row['total_limit'],
                 $row['token_limit'], $row['price'],
                 $row['status'], $row['default_duration_days'], $json, $row['category'],
                 $row['created_at'], $row['updated_at']]
            );
        } else {
            $db->execute(
                "UPDATE plans SET name=?, plan_type=?, hourly_5h_limit=?, weekly_limit=?, monthly_limit=?, cycle_days=?, total_limit=?, "
                . "token_limit=?, price=?, status=?, default_duration_days=?, allowed_model_names=?::jsonb, "
                . "category=?, updated_at=NOW() WHERE id=? AND status <> 'deleted'",
                [$row['name'], $row['plan_type'], $row['hourly_5h_limit'], $row['weekly_limit'],
                 $row['monthly_limit'], $row['cycle_days'], $row['total_limit'], $row['token_limit'], $row['price'], $row['status'],
                 $row['default_duration_days'], $json, $row['category'], $id]
            );
        }
    }

    /** 预生成 UUID（ThinkPHP pgsql 取回 lastInsId 不可靠） */
    private function genUuid(): string
    {
        return Db::connect('pgsql')->query('select gen_random_uuid() as id')[0]['id'];
    }
}
