<?php
declare(strict_types=1);

namespace app\controller\panel;

use app\BaseController;
use app\model\UpstreamKey;
use app\model\UpstreamKeyVerification;
use app\model\UpstreamModelMapping;
use app\service\DataScope;
use app\support\Pagination;
use think\exception\HttpException;
use think\facade\Db;

/**
 * 用户面：我持有的上游 Key（panel，自取）
 *
 * 路由前缀 /api/v1/panel/upstream
 * - GET /keys       我自有的上游 Key 列表（脱敏）
 * - GET /keys/:id   详情 + mappings + route_groups + 最近 verifications
 *
 * 仅看 owner_user_id=self 的私有 Key。脱敏：永不返回 encrypted_key / encryption_version。
 */
class Upstream extends BaseController
{
    /** GET /api/v1/panel/upstream/keys */
    public function keys()
    {
        $ctx = DataScope::forSelf(app('user'));
        [$page, $size] = Pagination::page($this->request);

        $query = UpstreamKey::with(['provider', 'ownerUser'])
            ->where('status', '<>', 'deleted')
            ->where('owner_user_id', $ctx->userId());

        $keyword = trim((string) $this->request->get('keyword', ''));
        if ($keyword !== '') {
            $query->whereLike('name', "%{$keyword}%");
        }
        $status = trim((string) $this->request->get('status', ''));
        if ($status !== '') {
            $query->where('status', $status);
        }
        $marketStatus = trim((string) $this->request->get('marketStatus', ''));
        if ($marketStatus !== '') {
            $query->where('market_status', $marketStatus);
        }

        Pagination::applyTimeRange($query, $this->request, 'created_at');
        $total = $query->count();
        Pagination::applySort($query, $this->request, ['created_at', 'priority'], '-created_at');
        $list = $query->page($page, $size)->select();

        // 脱敏：去掉 encrypted_key / encryption_version；保留 key_prefix/key_suffix
        $list->hidden(['encrypted_key', 'encryption_version']);

        return success(Pagination::wrap($list, $total, $page, $size));
    }

    /** GET /api/v1/panel/upstream/keys/:id */
    public function keyDetail($id)
    {
        $ctx   = DataScope::forSelf(app('user'));
        $query = UpstreamKey::with(['provider', 'ownerUser'])
            ->where('id', $id)
            ->where('status', '<>', 'deleted')
            ->where('owner_user_id', $ctx->userId());
        $key = $query->find();
        if ($key === null) {
            throw new HttpException(404, '上游 Key 不存在');
        }
        $key->hidden(['encrypted_key', 'encryption_version']);

        // 映射（含 model 名、endpoint、单价）
        $mappings = UpstreamModelMapping::where('upstream_key_id', $id)
            ->where('status', '<>', 'deleted')
            ->with(['model', 'providerEndpoint'])
            ->order('created_at', 'desc')
            ->select();

        // 所属路由组
        $routeGroups = Db::connect('pgsql')->query(
            "select rg.id, rg.name, rg.display_name, rg.is_system, rg.status"
            . " from upstream_route_group_memberships urgm"
            . " join route_groups rg on rg.id = urgm.route_group_id"
            . " where urgm.upstream_model_mapping_id in (select id from upstream_model_mappings where upstream_key_id = ?)"
            . " and urgm.status <> 'deleted' and rg.status <> 'deleted'",
            [$id]
        );

        // 最近校验记录
        $verifications = UpstreamKeyVerification::where('upstream_key_id', $id)
            ->order('created_at', 'desc')
            ->limit(10)
            ->select();

        return success([
            'key'           => $key,
            'mappings'      => $mappings,
            'routeGroups'   => $routeGroups,
            'verifications' => $verifications,
        ]);
    }
}
