<?php
declare(strict_types=1);

namespace app\controller\dashboard;

use app\BaseController;
use app\model\BotKey;
use app\model\User as UserModel;
use app\model\UserApiKey;
use app\model\UserPlan;
use app\service\DataScope;
use app\support\Pagination;
use think\exception\HttpException;
use think\facade\Db;

/**
 * 管理面：用户管理（dashboard，admin）
 *
 * 路由前缀 /api/v1/dashboard/users
 * - GET  /        用户列表（分页+搜索 email/role/status）
 * - GET  /:id     用户画像（基本信息 + API Key + Bot Key + 套餐 + 用量汇总）
 * - POST /        新建用户（随机临时密码明文仅返回一次）
 * - PUT  /:id     改角色/状态/计费偏好；改角色或状态时 token_version++ 吊销旧 JWT
 * - POST /:id/reset-password  重置密码（随机临时密码明文仅返回一次 + token_version++）
 *
 * Admin 中间件已保证角色。脱敏：password_hash / token_version 永不返回；密钥类只给 key_prefix/key_suffix。
 * 自保护：管理员不能禁用/降级自己的账户（避免把自己锁在外面）。
 */
class User extends BaseController
{
    /** GET /api/v1/dashboard/users */
    public function list()
    {
        [$page, $size] = Pagination::page($this->request);

        $query = UserModel::field(['id', 'email', 'role', 'status', 'preferred_billing', 'fallback_enabled', 'created_at', 'updated_at']);

        $keyword = trim((string) $this->request->get('keyword', ''));
        if ($keyword !== '') {
            $query->whereLike('email', "%{$keyword}%");
        }
        $role = trim((string) $this->request->get('role', ''));
        if ($role !== '') {
            $query->where('role', $role);
        }
        $status = trim((string) $this->request->get('status', ''));
        if ($status !== '') {
            $query->where('status', $status);
        }

        Pagination::applyTimeRange($query, $this->request, 'created_at');
        $total = $query->count();
        Pagination::applySort($query, $this->request, ['created_at', 'updated_at'], '-created_at');
        $list = $query->page($page, $size)->select();

        return success(Pagination::wrap($list, $total, $page, $size));
    }

    /** GET /api/v1/dashboard/users/:id */
    public function detail($id)
    {
        $user = UserModel::field(['id', 'email', 'role', 'status', 'preferred_billing', 'fallback_enabled', 'created_at', 'updated_at'])
            ->where('id', $id)
            ->find();
        if ($user === null) {
            throw new HttpException(404, '用户不存在');
        }

        // API Key（脱敏：去掉 key_hash）
        $apiKeys = UserApiKey::where('user_id', $id)
            ->field(['id', 'name', 'key_prefix', 'key_suffix', 'status', 'last_used_at', 'created_at'])
            ->order('created_at', 'desc')
            ->select();

        // Bot Key（脱敏：去掉 key_hash）
        $botKeys = BotKey::where('user_id', $id)
            ->field(['id', 'name', 'scope', 'key_prefix', 'key_suffix', 'status', 'last_used_at', 'created_at', 'updated_at'])
            ->order('created_at', 'desc')
            ->select();

        // 持有套餐（含 Plan 模板）
        $plans = UserPlan::where('user_id', $id)
            ->with(['plan'])
            ->order('created_at', 'desc')
            ->select();

        // 用量汇总：按 billing_plan 聚合 token_delta / request_delta
        $usage = Db::connect('pgsql')->query(
            'select coalesce(billing_plan, ?) as billing_plan,'
            . ' coalesce(sum(token_delta),0) as token_balance,'
            . ' coalesce(sum(request_delta),0) as request_balance'
            . ' from usage_ledger where user_id = ? group by billing_plan order by billing_plan',
            ['unknown', $id]
        );
        $usageSummary = array_map(static function ($r) {
            return [
                'billingPlan'    => $r['billing_plan'],
                'tokenBalance'   => (int) $r['token_balance'],
                'requestBalance' => (int) $r['request_balance'],
            ];
        }, $usage);

        return success([
            'user'    => $user,
            'apiKeys' => $apiKeys,
            'botKeys' => $botKeys,
            'plans'   => $plans,
            'usage'   => $usageSummary,
        ]);
    }

    /** POST /api/v1/dashboard/users —— 新建用户，随机临时密码明文仅返回一次 */
    public function create()
    {
        $email = trim((string) $this->request->post('email', ''));
        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new HttpException(400, '邮箱格式不正确');
        }
        if (UserModel::where('email', $email)->find() !== null) {
            throw new HttpException(409, '该邮箱已被注册');
        }
        $role     = $this->request->post('role') === 'admin' ? 'admin' : 'user';
        $password = $this->genPassword();
        $id       = $this->genUuid();
        UserModel::create([
            'id'            => $id,
            'email'         => $email,
            'password_hash' => password_hash($password, PASSWORD_BCRYPT),
            'role'          => $role,
            'token_version' => 1,
        ]);
        $user = $this->publicUser($id);

        return success([
            'id'       => $user->id,
            'email'    => $user->email,
            'role'     => $user->role,
            'status'   => $user->status,
            'password' => $password, // 明文只返回这一次，不落库
        ]);
    }

    /** PUT /api/v1/dashboard/users/:id —— 改角色/状态/计费偏好；角色或状态变更时 token_version++ */
    public function update($id)
    {
        $user = UserModel::where('id', $id)->find();
        if ($user === null) {
            throw new HttpException(404, '用户不存在');
        }
        $me    = app('user')->id;
        $dirty = false;
        $bump  = false;

        $role = $this->request->post('role');
        if ($role !== null && in_array($role, ['user', 'admin'], true) && $role !== $user->role) {
            if ($id === $me) {
                throw new HttpException(400, '不能修改自己的角色');
            }
            $user->role = $role;
            $bump = true;
            $dirty = true;
        }
        $status = $this->request->post('status');
        if ($status !== null && in_array($status, ['active', 'disabled'], true) && $status !== $user->status) {
            if ($id === $me) {
                throw new HttpException(400, '不能禁用自己的账户');
            }
            $user->status = $status;
            $bump = true;
            $dirty = true;
        }
        $billing = $this->request->post('preferred_billing');
        if ($billing !== null && in_array($billing, ['coding', 'token'], true)) {
            $user->preferred_billing = $billing;
            $dirty = true;
        }
        $fallback = $this->request->post('fallback_enabled');
        if ($fallback !== null) {
            $user->fallback_enabled = (bool) $fallback;
            $dirty = true;
        }

        if (!$dirty) {
            throw new HttpException(400, '无可更新字段');
        }
        if ($bump) {
            $user->token_version = (int) $user->token_version + 1;
        }
        $user->save();

        return success($this->publicUser($id));
    }

    /** POST /api/v1/dashboard/users/:id/reset-password —— 重置密码，明文仅返回一次 + token_version++ */
    public function resetPassword($id)
    {
        $user = UserModel::where('id', $id)->find();
        if ($user === null) {
            throw new HttpException(404, '用户不存在');
        }
        $password = $this->genPassword();
        $user->password_hash  = password_hash($password, PASSWORD_BCRYPT);
        $user->token_version  = (int) $user->token_version + 1;
        $user->save();

        return success(['id' => $id, 'password' => $password]); // 明文只返回这一次
    }

    /** 随机临时密码：剔除易混字符（0/O/1/l/I），16 位 */
    private function genPassword(int $len = 16): string
    {
        $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghijkmnpqrstuvwxyz';
        $max = strlen($alphabet) - 1;
        $out = '';
        for ($i = 0; $i < $len; $i++) {
            $out .= $alphabet[random_int(0, $max)];
        }
        return $out;
    }

    /** 生成 UUID（ThinkPHP pgsql 取回 lastInsId 不可靠，预生成） */
    private function genUuid(): string
    {
        return Db::connect('pgsql')->query('select gen_random_uuid() as id')[0]['id'];
    }

    /** 取脱敏后的公开字段（不含 password_hash / token_version） */
    private function publicUser(string $id): UserModel
    {
        return UserModel::field(['id', 'email', 'role', 'status', 'preferred_billing', 'fallback_enabled', 'created_at', 'updated_at'])
            ->where('id', $id)
            ->find();
    }
}
