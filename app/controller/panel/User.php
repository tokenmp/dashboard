<?php
declare(strict_types=1);

namespace app\controller\panel;

use app\BaseController;
use app\model\BotKey;
use app\model\User as UserModel;
use app\model\UserApiKey;
use app\enums\CodingPlanStrategy;
use app\model\UserPlan;
use app\service\ApiKeyHasher;
use app\service\DataScope;
use think\exception\HttpException;
use think\facade\Db;

/**
 * 用户面：我的账户中心（panel，自取）
 *
 * 路由前缀 /api/v1/panel/user
 * - GET /          我的资料
 * - GET /keys      我的 user_api_keys（脱敏）
 * - GET /keys/bot  我的 bot_keys（脱敏）
 * - GET /plans     我的 user_plans（含 Plan 模板）
 *
 * 脱敏：password_hash / token_version 永不返回；密钥类只给 key_prefix/key_suffix。
 */
class User extends BaseController
{
    /** GET /api/v1/panel/user */
    public function profile()
    {
        $ctx  = DataScope::forSelf(app('user'));
        $user = UserModel::field(['id', 'email', 'role', 'status', 'preferred_billing', 'fallback_enabled', 'coding_plan_strategy', 'created_at', 'updated_at'])
            ->where('id', $ctx->userId())
            ->find();

        return success($user);
    }

    /** PUT /api/v1/panel/user/plan-strategy —— 配置扣费套餐选择策略（有序枚举列表） */
    public function updatePlanStrategy()
    {
        $ctx = DataScope::forSelf(app('user'));
        // put() 仅在 PUT 方法下安全（内部数组按方法惰性解析），其余场景回退 post
        $raw   = $this->request->isPut() ? (string) $this->request->put('strategy', '') : '';
        $input = trim($raw !== '' ? $raw : (string) $this->request->post('strategy', ''));
        try {
            $list = CodingPlanStrategy::parseList($input);
        } catch (\ValueError|\InvalidArgumentException $e) {
            throw new HttpException(400, 'strategy 非法：' . $e->getMessage());
        }
        $stored = CodingPlanStrategy::format($list);
        Db::connect('pgsql')->execute(
            'UPDATE users SET coding_plan_strategy = ?, updated_at = NOW() WHERE id = ?',
            [$stored, $ctx->userId()],
        );
        return success(['coding_plan_strategy' => $stored]);
    }

    /** GET /api/v1/panel/user/keys */
    public function keys()
    {
        $ctx  = DataScope::forSelf(app('user'));
        $list = UserApiKey::where('user_id', $ctx->userId())
            ->where('status', '<>', 'deleted')
            ->field(['id', 'name', 'key_prefix', 'key_suffix', 'status', 'last_used_at', 'created_at'])
            ->order('created_at', 'desc')
            ->select();

        return success($list);
    }

    /** GET /api/v1/panel/user/keys/bot */
    public function botKeys()
    {
        $ctx  = DataScope::forSelf(app('user'));
        $list = BotKey::where('user_id', $ctx->userId())
            ->where('status', '<>', 'deleted')
            ->field(['id', 'name', 'scope', 'key_prefix', 'key_suffix', 'status', 'last_used_at', 'created_at', 'updated_at'])
            ->order('created_at', 'desc')
            ->select();

        return success($list);
    }

    /** POST /api/v1/panel/user/keys —— 创建 API Key，明文仅返回一次 */
    public function createKey()
    {
        $ctx  = DataScope::forSelf(app('user'));
        $name = trim((string) $this->request->post('name', '')) ?: 'default';
        $raw  = ApiKeyHasher::generateApiKey();
        [$pre, $suf] = ApiKeyHasher::parts($raw);
        $id   = $this->genUuid();
        UserApiKey::create([
            'id'         => $id,
            'user_id'    => $ctx->userId(),
            'name'       => $name,
            'key_prefix' => $pre,
            'key_suffix' => $suf,
            'key_hash'   => ApiKeyHasher::hash($raw),
            'status'     => 'active',
        ]);

        return success([
            'id'         => $id,
            'name'       => $name,
            'status'     => 'active',
            'key_prefix' => $pre,
            'key_suffix' => $suf,
            'key'        => $raw, // 明文只返回这一次，不落库
            'created_at' => date('Y-m-d H:i:s'),
        ]);
    }

    /** POST /api/v1/panel/user/keys/bot —— 创建 Bot Key（scope 固定 user），明文仅返回一次 */
    public function createBotKey()
    {
        $ctx  = DataScope::forSelf(app('user'));
        $name = trim((string) $this->request->post('name', '')) ?: 'default';
        $raw  = ApiKeyHasher::generateBotKey();
        [$pre, $suf] = ApiKeyHasher::parts($raw);
        $id   = $this->genUuid();
        BotKey::create([
            'id'          => $id,
            'user_id'     => $ctx->userId(),
            'name'        => $name,
            'scope'       => 'user',
            'key_prefix'  => $pre,
            'key_suffix'  => $suf,
            'key_hash'    => ApiKeyHasher::hash($raw),
            'status'      => 'active',
            'last_used_at'=> date('Y-m-d H:i:s'),
        ]);

        return success([
            'id'         => $id,
            'name'       => $name,
            'scope'      => 'user',
            'status'     => 'active',
            'key_prefix' => $pre,
            'key_suffix' => $suf,
            'key'        => $raw,
            'created_at' => date('Y-m-d H:i:s'),
        ]);
    }

    /** PUT /api/v1/panel/user/keys/:id —— 改名 / 启停（status ∈ active|disabled） */
    public function updateKey($id)
    {
        $key = $this->findOwnApiKey($id);
        $key->save($this->keyUpdateInput());
        return success($key->refresh());
    }

    /** PUT /api/v1/panel/user/keys/bot/:id —— 改名 / 启停 */
    public function updateBotKey($id)
    {
        $key = $this->findOwnBotKey($id);
        $key->save($this->keyUpdateInput());
        return success($key->refresh());
    }

    /** DELETE /api/v1/panel/user/keys/:id —— 软删（status=deleted） */
    public function deleteKey($id)
    {
        $key = $this->findOwnApiKey($id);
        $key->status = 'deleted';
        $key->save();
        return success(['id' => $id]);
    }

    /** DELETE /api/v1/panel/user/keys/bot/:id —— 软删 */
    public function deleteBotKey($id)
    {
        $key = $this->findOwnBotKey($id);
        $key->status = 'deleted';
        $key->save();
        return success(['id' => $id]);
    }

    /** 读取更新字段：name（非空则改）、status（须为 active|disabled） */
    private function keyUpdateInput(): array
    {
        $update = [];
        $name   = trim((string) $this->request->post('name', ''));
        if ($name !== '') {
            $update['name'] = $name;
        }
        $status = $this->request->post('status');
        if ($status !== null && in_array($status, ['active', 'disabled'], true)) {
            $update['status'] = $status;
        }
        if (empty($update)) {
            throw new HttpException(400, '无可更新字段');
        }
        return $update;
    }

    /** 找到自己名下、未删除的 API Key，越权或不存在 → 404 */
    private function findOwnApiKey(string $id): UserApiKey
    {
        $ctx = DataScope::forSelf(app('user'));
        $key = UserApiKey::where('id', $id)->where('user_id', $ctx->userId())->where('status', '<>', 'deleted')->find();
        if ($key === null) {
            throw new HttpException(404, '密钥不存在');
        }
        return $key;
    }

    /** 找到自己名下、未删除的 Bot Key */
    private function findOwnBotKey(string $id): BotKey
    {
        $ctx = DataScope::forSelf(app('user'));
        $key = BotKey::where('id', $id)->where('user_id', $ctx->userId())->where('status', '<>', 'deleted')->find();
        if ($key === null) {
            throw new HttpException(404, '密钥不存在');
        }
        return $key;
    }

    private function genUuid(): string
    {
        return Db::connect('pgsql')->query('select gen_random_uuid() as id')[0]['id'];
    }

    /** GET /api/v1/panel/user/plans */
    public function plans()
    {
        $ctx  = DataScope::forSelf(app('user'));
        $list = UserPlan::where('user_id', $ctx->userId())
            ->with(['plan'])
            ->order('created_at', 'desc')
            ->select();

        return success($list);
    }
}
