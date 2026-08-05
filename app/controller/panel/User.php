<?php
declare(strict_types=1);

namespace app\controller\panel;

use app\BaseController;
use app\model\BotKey;
use app\model\User as UserModel;
use app\model\UserApiKey;
use app\model\UserPlan;
use app\service\DataScope;

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
        $user = UserModel::field(['id', 'email', 'role', 'status', 'preferred_billing', 'fallback_enabled', 'created_at', 'updated_at'])
            ->where('id', $ctx->userId())
            ->find();

        return success($user);
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
