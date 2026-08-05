<?php
declare(strict_types=1);

namespace app\controller\dashboard;

use app\BaseController;
use app\model\MarketplaceLedger;
use app\model\MarketplaceListing;
use app\model\MarketplaceRequestSettlement;
use app\service\DataScope;
use app\support\Pagination;

/**
 * 管理面：全平台市场分账（dashboard，admin）
 *
 * 路由前缀 /api/v1/dashboard/marketplace
 * - GET /listings      全部挂单
 * - GET /settlements   全部结算单（可选 userId 筛选 consumer/supplier）
 * - GET /ledger        全部分账账本（可选 userId）
 *
 * Admin 中间件已保证角色；DataScope::forUser（admin）允许 userId 筛选。
 */
class Marketplace extends BaseController
{
    /** GET /api/v1/dashboard/marketplace/listings */
    public function listings()
    {
        [$page, $size] = Pagination::page($this->request);

        $query = MarketplaceListing::with(['sellerUser', 'upstreamModelMapping']);

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

    /** GET /api/v1/dashboard/marketplace/settlements */
    public function settlements()
    {
        [$page, $size] = Pagination::page($this->request);

        $query = MarketplaceRequestSettlement::with(['consumerUser', 'supplierUser', 'listing']);

        $userId = trim((string) $this->request->get('userId', ''));
        if ($userId !== '') {
            $query->where(function ($q) use ($userId) {
                $q->where('consumer_user_id', $userId)
                  ->whereOr('supplier_user_id', $userId);
            });
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

    /** GET /api/v1/dashboard/marketplace/ledger */
    public function ledger()
    {
        $ctx = DataScope::forUser(app('user'));
        [$page, $size] = Pagination::page($this->request);

        $query = MarketplaceLedger::with(['listing']);
        $query = $ctx->scope($query, 'user_id', (string) $this->request->get('userId', ''));

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
