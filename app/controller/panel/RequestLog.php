<?php
declare(strict_types=1);

namespace app\controller\panel;

use app\BaseController;
use app\model\RequestAttempt;
use app\model\RequestLog as RequestLogModel;
use app\model\RequestLogEvent;
use app\service\DataScope;
use app\support\Pagination;
use think\exception\HttpException;

/**
 * 用户面：我的请求日志（panel，自取）
 *
 * 路由前缀 /api/v1/panel/requests
 * - GET /        列表（分页+筛选），列表裁剪 request_body 等大字段
 * - GET /:id     详情（含 attempts + events 时间线）
 *
 * DataScope::forSelf 强制 user_id=self，忽略任何前端传入的 userId。
 */
class RequestLog extends BaseController
{
    /** 列表裁剪字段：去掉 request_body（调试正文，列表不返回） */
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
     * GET /api/v1/panel/requests
     *
     * 筛选：keyword(request_id/trace_id)、model、protocol、success、usageStatus、billingPlan、时间、sort
     */
    public function list()
    {
        $ctx = DataScope::forSelf(app('user'));
        [$page, $size] = Pagination::page($this->request);

        $query = RequestLogModel::field(self::LIST_FIELDS);
        $query = $ctx->scope($query, 'user_id'); // 强制 self

        $keyword = trim((string) $this->request->get('keyword', ''));
        if ($keyword !== '') {
            $query->where(function ($q) use ($keyword) {
                $q->whereLike('request_id', "%{$keyword}%")
                  ->whereOr('trace_id', 'like', "%{$keyword}%");
            });
        }

        $model = trim((string) $this->request->get('model', ''));
        if ($model !== '') {
            // 模型名模糊 + 大小写不敏感（ILIKE）：同时匹配实际/请求/解析模型名
            $query->whereRaw(
                '(model_name ILIKE ? OR requested_model_name ILIKE ? OR resolved_model_name ILIKE ?)',
                ["%{$model}%", "%{$model}%", "%{$model}%"]
            );
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

        $success = $this->request->get('success');
        if ($success !== null && $success !== '') {
            $query->where('success', $success === '1' || $success === 'true');
        }

        Pagination::applyTimeRange($query, $this->request, 'created_at');

        $total = $query->count();
        Pagination::applySort($query, $this->request, ['created_at', 'completed_at', 'latency_ms', 'total_tokens'], '-created_at');
        $list  = $query->page($page, $size)->select();

        return success(Pagination::wrap($list, $total, $page, $size));
    }

    /**
     * GET /api/v1/panel/requests/:id
     *
     * 详情：完整字段 + attempts + events。非自己的记录 404。
     */
    public function detail($id)
    {
        $ctx   = DataScope::forSelf(app('user'));
        $query = RequestLogModel::where('id', $id);
        $query = $ctx->scope($query, 'user_id');
        $log   = $query->find();

        if ($log === null) {
            throw new HttpException(404, '请求日志不存在');
        }

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
