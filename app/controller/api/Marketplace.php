<?php
declare(strict_types=1);

namespace app\controller\api;

use app\BaseController;
use app\model\MarketplaceLedger;
use app\model\MarketplaceListing;
use app\model\MarketplaceRequestSettlement;
use app\service\DataScope;
use app\support\Pagination;
use think\exception\HttpException;
use think\facade\Db;

/**
 * 市场分账
 *
 * 路由前缀 /api/marketplace
 *
 * - GET /api/marketplace/listings      挂单列表
 * - GET /api/marketplace/settlements   结算单
 * - GET /api/marketplace/ledger        分账账本
 *
 * 角色：admin 看全部；user 仅 seller_user_id/consumer_user_id/supplier_user_id/user_id=self 的相关记录。
 * 注意：request_log_id/request_attempt_id 对 request_log 无 relation 方法，需手动 where/join。
 */
class Marketplace extends BaseController
{
    /**
     * GET /api/marketplace/listings
     */
    public function listings()
    {
        $ctx = DataScope::forUser(app('user'));
        [$page, $size] = Pagination::page($this->request);

        $query = MarketplaceListing::with(['sellerUser', 'upstreamModelMapping']);

        if (!$ctx->isAdmin()) {
            // user：仅看自己作为卖家的挂单
            $query->where('seller_user_id', $ctx->userId());
        }

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
        Pagination::applySort($query, $this->request, ['created_at', 'published_at'], '-created_at');
        $list = $query->page($page, $size)->select();

        return success(Pagination::wrap($list, $total, $page, $size));
    }

    /**
     * GET /api/marketplace/settlements
     */
    public function settlements()
    {
        $ctx = DataScope::forUser(app('user'));
        [$page, $size] = Pagination::page($this->request);

        $query = MarketplaceRequestSettlement::with(['consumerUser', 'supplierUser', 'listing']);

        if (!$ctx->isAdmin()) {
            $uid = $ctx->userId();
            $query->where(function ($q) use ($uid) {
                $q->where('consumer_user_id', $uid)
                  ->whereOr('supplier_user_id', $uid);
            });
        } else {
            $userId = trim((string) $this->request->get('userId', ''));
            if ($userId !== '') {
                $query->where(function ($q) use ($userId) {
                    $q->where('consumer_user_id', $userId)
                      ->whereOr('supplier_user_id', $userId);
                });
            }
        }

        $usageSource = trim((string) $this->request->get('usageSource', ''));
        if ($usageSource !== '') {
            $query->where('usage_source', $usageSource);
        }
        $status = trim((string) $this->request->get('status', ''));
        if ($status !== '') {
            $query->where('status', $status);
        }
        Pagination::applyTimeRange($query, $this->request, 'created_at');
        $total = $query->count();
        Pagination::applySort($query, $this->request, ['created_at', 'settled_at'], '-created_at');
        $list = $query->page($page, $size)->select();

        return success(Pagination::wrap($list, $total, $page, $size));
    }

    /**
     * GET /api/marketplace/ledger
     */
    public function ledger()
    {
        $ctx = DataScope::forUser(app('user'));
        [$page, $size] = Pagination::page($this->request);

        $query = MarketplaceLedger::with(['listing']);

        if (!$ctx->isAdmin()) {
            $query->where('user_id', $ctx->userId());
        } else {
            $query = $ctx->scope($query, 'user_id', (string) $this->request->get('userId', ''));
        }

        $entryType = trim((string) $this->request->get('entryType', ''));
        if ($entryType !== '') {
            $query->where('entry_type', $entryType);
        }
        $status = trim((string) $this->request->get('status', ''));
        if ($status !== '') {
            $query->where('status', $status);
        }
        Pagination::applyTimeRange($query, $this->request, 'created_at');
        $total = $query->count();
        Pagination::applySort($query, $this->request, ['created_at', 'available_at'], '-created_at');
        $list = $query->page($page, $size)->select();

        return success(Pagination::wrap($list, $total, $page, $size));
    }
}
