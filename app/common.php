<?php
// 应用公共文件

use think\response\Json;

if (!function_exists('success')) {
    /**
     * 成功响应
     *
     * 统一信封：{ code, message, data }
     *
     * @param mixed  $data    业务数据
     * @param string $message 提示信息
     * @return Json
     */
    function success($data = null, string $message = 'ok'): Json
    {
        return json([
            'code'    => 0,
            'message' => $message,
            'data'    => $data,
        ]);
    }
}

if (!function_exists('fail')) {
    /**
     * 失败响应
     *
     * 统一信封：{ code, message, data }，code 为非 0 业务码，可与 HTTP 状态码解耦。
     *
     * @param string $message    提示信息
     * @param int    $code       业务码（非 0）
     * @param int    $httpStatus HTTP 状态码
     * @return Json
     */
    function fail(string $message = 'fail', int $code = 1, int $httpStatus = 200): Json
    {
        return json([
            'code'    => $code,
            'message' => $message,
            'data'    => null,
        ], $httpStatus);
    }
}
