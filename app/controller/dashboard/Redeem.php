<?php
declare(strict_types=1);

namespace app\controller\dashboard;

use app\BaseController;
use app\model\RedeemCode as RedeemCodeModel;
use app\model\RedeemCodeRedemption;
use app\support\Pagination;
use think\exception\HttpException;

/**
 * 管理面：兑换码管理（dashboard，admin）
 *
 * 路由前缀 /api/v1/dashboard/redeem
 * - GET /codes                  码列表（脱敏 code_hash/code_plaintext）
 * - GET /codes/:id/redemptions  某码兑换记录
 *
 * Admin 中间件已保证角色。
 * 脱敏：永不返回 code_hash / code_plaintext。
 */
class Redeem extends BaseController
{
    /** 码列表字段：去掉 code_hash / code_plaintext */
    private const CODE_FIELDS = [
        'id', 'name', 'code_prefix', 'code_suffix',
        'token_amount', 'max_redemptions', 'redeemed_count', 'status',
        'starts_at', 'expires_at', 'override_mode', 'duration_days',
        'coding_plan_id', 'token_plan_id', 'image_plan_id',
        'created_by', 'created_at', 'updated_at',
    ];

    /** GET /api/v1/dashboard/redeem/codes */
    public function list()
    {
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

    /** GET /api/v1/dashboard/redeem/codes/:id/redemptions */
    public function redemptions($id)
    {
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
}
