<?php
namespace app;

use think\db\exception\DataNotFoundException;
use think\db\exception\ModelNotFoundException;
use think\exception\Handle;
use think\exception\HttpException;
use think\exception\HttpResponseException;
use think\exception\ValidateException;
use think\Response;
use Throwable;

/**
 * 应用异常处理类
 */
class ExceptionHandle extends Handle
{
    /**
     * 不需要记录信息（日志）的异常类列表
     * @var array
     */
    protected $ignoreReport = [
        HttpException::class,
        HttpResponseException::class,
        ModelNotFoundException::class,
        DataNotFoundException::class,
        ValidateException::class,
    ];

    /**
     * 记录异常信息（包括日志或者其它方式记录）
     *
     * @access public
     * @param  Throwable $exception
     * @return void
     */
    public function report(Throwable $exception): void
    {
        // 使用内置的方式记录异常日志
        parent::report($exception);
    }

    /**
     * Render an exception into an HTTP response.
     *
     * @access public
     * @param \think\Request   $request
     * @param Throwable $e
     * @return Response
     */
    public function render($request, Throwable $e): Response
    {
        // 主动抛出的 HTTP 响应异常（如 redirect）直接返回
        if ($e instanceof HttpResponseException) {
            return $e->getResponse();
        }

        $path   = $request->pathinfo();
        $isApi  = $path === 'api' || str_starts_with($path, 'api/');

        // API 请求统一返回 JSON 错误
        if ($isApi) {
            $httpStatus = match (true) {
                $e instanceof ValidateException => 422,
                $e instanceof HttpException     => $e->getStatusCode() ?: 500,
                default                         => 500,
            };
            return json([
                'code' => 1,
                'msg'  => $e->getMessage() ?: '服务器错误',
                'data' => null,
            ], $httpStatus);
        }

        // 其他错误交给系统处理
        return parent::render($request, $e);
    }
}
