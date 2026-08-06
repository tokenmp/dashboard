<?php
declare(strict_types=1);

namespace app\controller\dashboard;

use app\BaseController;
use app\model\RequestAttempt;
use app\model\RequestLog as RequestLogModel;
use app\model\RequestLogEvent;
use app\service\DataScope;
use app\support\Pagination;
use think\exception\HttpException;

/**
 * 管理面：全平台请求日志（dashboard，admin）
 *
 * 路由前缀 /api/v1/dashboard/requests
 * - GET /        列表（分页+筛选，可选 userId 筛选指定用户）
 * - GET /:id     详情（含 attempts + events 时间线，任意用户）
 *
 * Admin 中间件已保证角色；DataScope::forUser（admin）允许 userId 筛选。
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
     * GET /api/v1/dashboard/requests
     *
     * 筛选：keyword、model、protocol、success、usageStatus、billingPlan、userId、时间、sort
     */
    public function list()
    {
        $ctx = DataScope::forUser(app('user'));
        [$page, $size] = Pagination::page($this->request);

        $query = RequestLogModel::field(self::LIST_FIELDS);
        $query = $ctx->scope($query, 'user_id', (string) $this->request->get('userId', ''));

        $keyword = trim((string) $this->request->get('keyword', ''));
        if ($keyword !== '') {
            $query->where(function ($q) use ($keyword) {
                $q->whereLike('request_id', "%{$keyword}%")
                  ->whereOr('trace_id', 'like', "%{$keyword}%")
                  ->whereOr('model_name', 'like', "%{$keyword}%");
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

        $apiKeyId = trim((string) $this->request->get('userApiKeyId', ''));
        if ($apiKeyId !== '') {
            $query->where('user_api_key_id', $apiKeyId);
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
        $list  = $query->with(['userApiKey' => function ($r) {
            $r->field('id,name');
        }, 'user' => function ($r) {
            $r->field('id,email');
        }])->page($page, $size)->select();

        $list = $list->each(function ($item) {
            $item['api_key_name'] = $item->userApiKey?->name;
            $item['user_email']   = $item->user?->email;
            unset($item->userApiKey, $item->user);
            return $item;
        });

        return success(Pagination::wrap($list, $total, $page, $size));
    }

    /** GET /api/v1/dashboard/requests/:id */
    public function detail($id)
    {
        $ctx   = DataScope::forUser(app('user'));
        $query = RequestLogModel::where('id', $id);
        $query = $ctx->scope($query, 'user_id');
        $log   = $query->find();

        if ($log === null) {
            throw new HttpException(404, '请求日志不存在');
        }

        $attempts = RequestAttempt::where('request_log_id', $id)
            ->with(['provider' => function ($r) {
                $r->field('id,name,display_name');
            }, 'upstreamKey' => function ($r) {
                $r->field('id,name');
            }])
            ->order('attempt_index', 'asc')
            ->select();
        $events = RequestLogEvent::where('request_log_id', $id)
            ->order('created_at', 'asc')
            ->order('id', 'asc')
            ->select();

        $attempts->each(function ($a) {
            unset($a->response_body);
            $a['provider_name'] = $a->provider?->display_name ?: $a->provider?->name;
            $a['upstream_key_name'] = $a->upstreamKey?->name;
            unset($a->provider, $a->upstreamKey);
        });

        return success([
            'log'      => $log,
            'attempts' => $attempts,
            'events'   => $events,
        ]);
    }
}
