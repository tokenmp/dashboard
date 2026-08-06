<?php
declare(strict_types=1);

namespace app\controller\panel;

use app\BaseController;
use app\model\RedeemCodeRedemption;
use app\service\DataScope;
use app\service\RedeemService;
use think\exception\HttpException;

/**
 * 用户面：我的兑换（panel，自取）
 *
 * 路由前缀 /api/v1/panel/user
 * - GET /redemptions  我的兑换凭证（token_amount 快照、套餐快照、生效 user_plan）
 *
 * 不返回码本身（code_hash/code_plaintext 全部不带）。
 */
class Redeem extends BaseController
{
    /** GET /api/v1/panel/user/redemptions */
    public function myRedemptions()
    {
        $ctx  = DataScope::forSelf(app('user'));
        $list = RedeemCodeRedemption::where('user_id', $ctx->userId())
            ->with(['codingPlan', 'tokenPlan', 'imagePlan'])
            ->order('created_at', 'desc')
            ->select();

        return success($list);
    }

    /**
     * POST /api/v1/panel/user/redeem
     * body: { code: string }
     * 兑换一个兑换码，原子地发放 token 余额与套餐奖励。
     */
    public function redeem()
    {
        $code = trim((string) $this->request->post('code', ''));
        if ($code === '') {
            throw new HttpException(400, '兑换码不能为空');
        }

        $userId = app('user')->id;
        $result = (new RedeemService())->redeem($userId, $code);

        return success($result);
    }
}
