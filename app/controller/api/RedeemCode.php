<?php
declare(strict_types=1);

namespace app\controller\api;

use app\BaseController;
use app\model\RedeemCode as RedeemCodeModel;
use app\model\RedeemCodeRedemption;
use app\service\DataScope;
use app\support\Pagination;
use think\exception\HttpException;

/**
 * 兑换码
 *
 * 路由前缀 /api/redeem、/api/user
 *
 * - GET /api/redeem/codes                  码列表（admin，脱敏 code_hash/code_plaintext）
 * - GET /api/redeem/codes/:id/redemptions  某码兑换记录（admin）
 * - GET /api/user/redemptions             我的兑换凭证（user，看不到码本身）
 *
 * 脱敏：永不返回 code_hash / code_plaintext；user 看不到码本身，只看自己的兑换凭证。
 */
class RedeemCode extends BaseController
{
    /** 码列表字段：去掉 code_hash / code_plaintext */
    private const CODE_FIELDS = [
        'id', 'name', 'code_prefix', 'code_suffix',
        'token_amount', 'max_redemptions', 'redeemed_count', 'status',
        'starts_at', 'expires_at', 'override_mode', 'duration_days',
        'coding_plan_id', 'token_plan_id', 'image_plan_id',
        'created_by', 'created_at', 'updated_at',
    ];

    /**
     * GET /api/redeem/codes（admin）
     */
    public function list()
    {
        $ctx = DataScope::forUser(app('user'));
        if (!$ctx->isAdmin()) {
            throw new HttpException(403, '无权访问');
        }

        [$page, $size] = Pagination::page($this->request);
        $query = RedeemCodeModel::field(self::CODE_FIELDS);

        $keyword = trim((string) $this->request->get('keyword', ''));
        if ($keyword !== '') {
            $query->whereLike('name', "%{$keyword}%");
        }
        $status = trim((string) $this->request->get('status', ''));
        if ($status !== '') {
            $query->where('status', $status);
        }
        Pagination::applyTimeRange($query, $this->request, 'created_at');
        $total = $query->count();
        Pagination::applySort($query, $this->request, ['created_at'], '-created_at');
        $list = $query->page($page, $size)->select();

        return success(Pagination::wrap($list, $total, $page, $size));
    }

    /**
     * GET /api/redeem/codes/:id/redemptions（admin）
     */
    public function redemptions($id)
    {
        $ctx = DataScope::forUser(app('user'));
        if (!$ctx->isAdmin()) {
            throw new HttpException(403, '无权访问');
        }

        $code = RedeemCodeModel::field(['id', 'name', 'code_prefix', 'code_suffix', 'token_amount', 'max_redemptions', 'redeemed_count', 'status', 'expires_at', 'starts_at'])
            ->where('id', $id)
            ->find();
        if ($code === null) {
            throw new HttpException(404, '兑换码不存在');
        }

        [$page, $size] = Pagination::page($this->request);
        $query = RedeemCodeRedemption::where('redeem_code_id', $id)
            ->with(['user']);
        $total = $query->count();
        Pagination::applySort($query, $this->request, ['created_at'], '-created_at');
        $list = $query->page($page, $size)->select();

        return success([
            'code'       => $code,
            'pagination' => Pagination::wrap($list, $total, $page, $size),
        ]);
    }

    /**
     * GET /api/user/redemptions（user）
     *
     * 我的兑换凭证：token_amount 快照、套餐快照、生效的 user_plan 行。
     * 不返回码本身（code_hash/code_plaintext 全部不带）。
     */
    public function myRedemptions()
    {
        $ctx = DataScope::forUser(app('user'));

        $list = RedeemCodeRedemption::where('user_id', $ctx->userId())
            ->with(['codingPlan', 'tokenPlan', 'imagePlan'])
            ->order('created_at', 'desc')
            ->select();

        return success($list);
    }
}
