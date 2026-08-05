<?php
declare(strict_types=1);

namespace app\controller\panel;

use app\BaseController;
use app\model\MarketplaceLedger;
use app\model\MarketplaceListing;
use app\model\MarketplaceRequestSettlement;
use app\service\DataScope;
use app\support\Pagination;

/**
 * 用户面：我参与的市场分账（panel，自取）
 *
 * 路由前缀 /api/v1/panel/marketplace
 * - GET /listings      我作为卖家的挂单
 * - GET /settlements   我作为 consumer/supplier 的结算单
 * - GET /ledger        我的分账账本（user_id=self）
 */
class Marketplace extends BaseController
{
    /** GET /api/v1/panel/marketplace/listings */
    public function listings()
    {
        $ctx = DataScope::forSelf(app('user'));
        [$page, $size] = Pagination::page($this->request);

        $query = MarketplaceListing::with(['sellerUser', 'upstreamModelMapping'])
            ->where('seller_user_id', $ctx->userId());

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

    /** GET /api/v1/panel/marketplace/settlements */
    public function settlements()
    {
        $ctx = DataScope::forSelf(app('user'));
        [$page, $size] = Pagination::page($this->request);

        $uid   = $ctx->userId();
        $query = MarketplaceRequestSettlement::with(['consumerUser', 'supplierUser', 'listing'])
            ->where(function ($q) use ($uid) {
                $q->where('consumer_user_id', $uid)
                  ->whereOr('supplier_user_id', $uid);
            });

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

    /** GET /api/v1/panel/marketplace/ledger */
    public function ledger()
    {
        $ctx = DataScope::forSelf(app('user'));
        [$page, $size] = Pagination::page($this->request);

        $query = MarketplaceLedger::with(['listing'])
            ->where('user_id', $ctx->userId());

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
