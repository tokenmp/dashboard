<?php
declare(strict_types=1);

namespace app\controller\api;

use app\BaseController;
use app\model\RequestAttempt;
use app\model\RequestLog as RequestLogModel;
use app\model\RequestLogEvent;
use app\service\DataScope;
use app\support\Pagination;
use think\exception\HttpException;

/**
 * 请求日志监控
 *
 * 路由前缀 /api/requests
 *
 * - GET /api/requests       列表（分页+筛选），列表裁剪 request_body 等大字段
 * - GET /api/requests/:id   详情（含 attempts + events 时间线）
 *
 * 角色隔离：user 仅看 user_id=self；admin 可选 userId 筛选（经 DataScope）。
 * attempts / events 对 request_log 无 ORM relation 方法，控制器手动 where 取数。
 */
class RequestLog extends BaseController
{
    /**
     * 列表裁剪字段：去掉 request_body（调试正文，列表不返回，见脱敏红线）。
     * 显式列出返回字段，避免一次性把 43 列全拉回。
     */
    private const LIST_FIELDS = [
        'id', 'user_id', 'user_api_key_id', 'request_id', 'trace_id',
        'model_name', 'requested_model_name', 'resolved_model_name',
        'route_group_name', 'requested_provider_name', 'protocol', 'stream',
        'billing_plan', 'billing_source', 'billing_plan_name',
        'billing_charge_requests', 'billing_charge_tokens',
        'input_tokens', 'output_tokens', 'total_tokens', 'cache_tokens', 'usage_status',
        'final_status_code', 'success', 'latency_ms', 'ttft_ms',
        'error_code', 'error_message',
        'provider_error_code', 'provider_error_type', 'provider_http_status',
        'thinking_mode', 'thinking_effort', 'thinking_effort_original', 'thinking_effort_degraded',
        'created_at', 'completed_at',
    ];

    /**
     * GET /api/requests
     *
     * 筛选：keyword(request_id/trace_id 模糊)、model、protocol、success、usageStatus、
     *       billingPlan、userId(admin)、from/to(created_at)、sort
     */
    public function list()
    {
        $ctx    = DataScope::forUser(app('user'));
        [$page, $size] = Pagination::page($this->request);

        $query = RequestLogModel::field(self::LIST_FIELDS);
        $query = $ctx->scope($query, 'user_id', (string) $this->request->get('userId', ''));

        // 关键字模糊（request_id / trace_id）
        $keyword = trim((string) $this->request->get('keyword', ''));
        if ($keyword !== '') {
            $query->where(function ($q) use ($keyword) {
                $q->whereLike('request_id', "%{$keyword}%")
                  ->whereOr('trace_id', 'like', "%{$keyword}%");
            });
        }

        // 模型名（匹配 model_name / requested_model_name / resolved_model_name）
        $model = trim((string) $this->request->get('model', ''));
        if ($model !== '') {
            $query->where(function ($q) use ($model) {
                $q->where('model_name', $model)
                  ->whereOr('requested_model_name', $model)
                  ->whereOr('resolved_model_name', $model);
            });
        }

        $protocol = trim((string) $this->request->get('protocol', ''));
        if ($protocol !== '') {
            $query->where('protocol', $protocol);
        }

        $billingPlan = trim((string) $this->request->get('billingPlan', ''));
        if ($billingPlan !== '') {
            $query->where('billing_plan', $billingPlan);
        }

        $usageStatus = trim((string) $this->request->get('usageStatus', ''));
        if ($usageStatus !== '') {
            $query->where('usage_status', $usageStatus);
        }

        // success：1=成功 0=失败
        $success = $this->request->get('success');
        if ($success !== null && $success !== '') {
            $query->where('success', $success === '1' || $success === 'true');
        }

        Pagination::applyTimeRange($query, $this->request, 'created_at');

        // 先 count（不带 order，避免 PostgreSQL grouping error），再应用排序与分页
        $total = $query->count();
        Pagination::applySort($query, $this->request, ['created_at', 'completed_at', 'latency_ms', 'total_tokens'], '-created_at');
        $list  = $query->page($page, $size)->select();

        return success(Pagination::wrap($list, $total, $page, $size));
    }

    /**
     * GET /api/requests/:id
     *
     * 详情：完整字段（含 request_body 按需返回），并附 attempts（按 attempt_index）与
     * events（按 created_at, id）时间线。user 仅归属自己时可见，否则 404。
     */
    public function detail($id)
    {
        $ctx = DataScope::forUser(app('user'));

        $query = RequestLogModel::where('id', $id);
        $query = $ctx->scope($query, 'user_id');
        $log   = $query->find();

        if ($log === null) {
            throw new HttpException(404, '请求日志不存在');
        }

        // attempts / events 对 request_log 无 ORM relation，手动 where 取数
        $attempts = RequestAttempt::where('request_log_id', $id)
            ->order('attempt_index', 'asc')
            ->select();
        $events = RequestLogEvent::where('request_log_id', $id)
            ->order('created_at', 'asc')
            ->order('id', 'asc')
            ->select();

        // attempts 隐藏调试用 response_body（详情页也裁剪，避免超大响应）
        $attempts->each(function ($a) {
            unset($a->response_body);
        });

        return success([
            'log'      => $log,
            'attempts' => $attempts,
            'events'   => $events,
        ]);
    }
}
