<?php
declare(strict_types=1);

namespace app\controller\dashboard;

use app\BaseController;
use app\model\UserPlan as UserPlanModel;
use think\exception\HttpException;
use think\facade\Db;

/**
 * 管理面：用户套餐发放 / 续期 / 停用（dashboard，admin）
 *
 * 路由前缀 /api/v1/dashboard/users/:userId/plans
 * - POST /                发放（grant）—— 新建一条 active user_plan
 * - POST /:planId/renew   续期（renew）—— 延长现有 active 绑定的 expires_at
 * - PUT  /:planId/disable 停用（disable）—— status='disabled'
 *
 * 业务规则（与 Go SetUserPlanSQL 完全一致）：
 *   - token 类型：发放时先停用该用户所有 active token 绑定（互斥）。
 *   - coding / image 类型：直接新建，不停用旧的（可叠加共存）。
 *   - expires_at：永久(permanent)→NULL；显式(expires_at)→直接用；
 *     否则「今天(Shanghai)+N 天的 23:59:59 Asia/Shanghai」，N=请求 duration_days ?? plan.default_duration_days；
 *     两者皆无 → NULL(永久)。
 *   - 只能基于 status='active' 的模板发放/续期。
 */
class UserPlan extends BaseController
{
    /**
     * POST /api/v1/dashboard/users/:userId/plans
     * body: plan_id(必填) + 可选 duration_days / expires_at(ISO) / permanent(bool)
     */
    public function grant($userId)
    {
        $planId = trim((string) $this->request->post('plan_id', ''));
        if ($planId === '') {
            throw new HttpException(400, 'plan_id 不能为空');
        }

        // 校验用户 & 模板（模板必须 active）
        $user = Db::connect('pgsql')->query('SELECT id FROM users WHERE id = ?', [$userId]);
        if (empty($user)) {
            throw new HttpException(404, '用户不存在');
        }
        $plan = Db::connect('pgsql')->query(
            "SELECT id, plan_type, default_duration_days FROM plans WHERE id = ? AND status = 'active'",
            [$planId]
        );
        if (empty($plan)) {
            throw new HttpException(404, '套餐不存在或已下架');
        }
        $plan       = $plan[0];
        $planType   = $plan['plan_type'];
        $defaultDur = $plan['default_duration_days'];

        $permanent    = (bool) $this->request->post('permanent', false);
        $expiresRaw   = trim((string) $this->request->post('expires_at', ''));
        $durationDays = $this->nullableInt('duration_days') ?? $defaultDur;
        $expiresAt    = $this->computeExpiresAt($durationDays, $expiresRaw, $permanent);

        $newId = $this->genUuid();
        Db::connect('pgsql')->transaction(function () use ($userId, $planId, $planType, $expiresAt, $newId) {
            // token 互斥：先停用该用户所有 active token 绑定
            if ($planType === 'token') {
                Db::connect('pgsql')->execute(
                    "UPDATE user_plans SET status = 'disabled'
                     WHERE user_id = ? AND plan_type = 'token' AND status = 'active'",
                    [$userId]
                );
            }
            Db::connect('pgsql')->execute(
                'INSERT INTO user_plans (id, user_id, plan_id, plan_type, status, expires_at)
                 VALUES (?, ?, ?, ?, ?, ?)',
                [$newId, $userId, $planId, $planType, 'active', $expiresAt]
            );
        });

        return success(UserPlanModel::where('id', $newId)->with(['plan'])->find());
    }

    /**
     * POST /api/v1/dashboard/users/:userId/plans/:planId/renew
     * body: 可选 duration_days / expires_at(ISO) / permanent(bool)
     * 注意：planId 此处是 user_plan.id（用户套餐绑定主键），非 plans.id
     */
    public function renew($userId, $planId)
    {
        $permanent  = (bool) $this->request->post('permanent', false);
        $expiresRaw = trim((string) $this->request->post('expires_at', ''));
        $duration   = $this->nullableInt('duration_days');

        // 复刻 Go RenewUserPlanByIDSQL：UPDATE 现有 active 绑定的 expires_at，基点=max(expires_at,NOW())
        $durStr = $duration !== null ? (string) $duration : null;
        $affected = Db::connect('pgsql')->execute(
            "UPDATE user_plans SET expires_at = (
                CASE
                  WHEN ?::boolean THEN NULL
                  WHEN NULLIF(?, '') IS NOT NULL THEN NULLIF(?, '')::timestamptz
                  WHEN ?::int IS NOT NULL THEN
                    ((date_trunc('day',
                       ((CASE WHEN expires_at IS NOT NULL AND expires_at > NOW() THEN expires_at ELSE NOW() END)
                        AT TIME ZONE 'Asia/Shanghai') + MAKE_INTERVAL(days => ?::int))
                      + INTERVAL '1 day' - INTERVAL '1 second') AT TIME ZONE 'Asia/Shanghai')
                  ELSE expires_at
                END
              )
              WHERE id = ? AND user_id = ? AND status = 'active'",
            [$permanent ? 'true' : 'false', $expiresRaw, $expiresRaw, $durStr, $durStr, $planId, $userId]
        );
        if ($affected === 0) {
            throw new HttpException(404, '用户套餐绑定不存在或非 active');
        }
        return success(UserPlanModel::where('id', $planId)->where('user_id', $userId)->with(['plan'])->find());
    }

    /** POST /api/v1/dashboard/users/:userId/plans/:planId/reset-windows */
    public function resetWindows($userId, $planId)
    {
        // 仅 coding 有 5h/周短期窗；周期/总量不受本操作影响（仍按 activated_at 累计）
        $affected = Db::connect('pgsql')->execute(
            "UPDATE user_plans SET windows_reset_at = NOW()
             WHERE id = ? AND user_id = ? AND status = 'active' AND plan_type = 'coding'",
            [$planId, $userId]
        );
        if ($affected === 0) {
            throw new HttpException(404, '用户套餐绑定不存在、非 active 或非 coding 类型');
        }
        return success(UserPlanModel::where('id', $planId)->where('user_id', $userId)->with(['plan'])->find());
    }

    /** PUT /api/v1/dashboard/users/:userId/plans/:planId/disable */
    public function disable($userId, $planId)
    {
        $affected = Db::connect('pgsql')->execute(
            "UPDATE user_plans SET status = 'disabled'
             WHERE id = ? AND user_id = ? AND status = 'active'",
            [$planId, $userId]
        );
        if ($affected === 0) {
            throw new HttpException(404, '用户套餐绑定不存在或非 active');
        }
        return success(['id' => $planId]);
    }

    // ─────────────────────────── 内部 ───────────────────────────

    /**
     * 计算 grant 时的 expires_at（复刻 Go CASE，结果为带 +08 偏移的 ISO 串）
     * 返回 null=永久
     */
    private function computeExpiresAt(?int $durationDays, string $expiresRaw, bool $permanent): ?string
    {
        if ($permanent) {
            return null;
        }
        if ($expiresRaw !== '') {
            $ts = strtotime($expiresRaw);
            if ($ts === false) {
                throw new HttpException(400, 'expires_at 格式不正确');
            }
            return date('Y-m-d H:i:s', $ts);
        }
        if ($durationDays === null) {
            return null; // 无天数 → 永久
        }
        // 今天(Shanghai) + N 天，23:59:59 Asia/Shanghai → 显式 +08 偏移，存库为 15:59:59+00
        $dt = new \DateTime('now', new \DateTimeZone('Asia/Shanghai'));
        $dt->modify("+{$durationDays} day")->setTime(23, 59, 59);
        return $dt->format('Y-m-d H:i:s') . $dt->format('P');
    }

    private function nullableInt(string $key): ?int
    {
        $v = $this->request->post($key);
        if ($v === null || $v === '') {
            return null;
        }
        return (int) $v;
    }

    private function genUuid(): string
    {
        return Db::connect('pgsql')->query('select gen_random_uuid() as id')[0]['id'];
    }
}
