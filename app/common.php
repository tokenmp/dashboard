<?php
// 应用公共文件

use think\response\Json;

if (!function_exists('success')) {
    /**
     * 成功响应
     *
     * @param mixed  $data 业务数据
     * @param string $msg  提示信息
     * @return Json
     */
    function success($data = null, string $msg = 'ok'): Json
    {
        return json([
            'code' => 0,
            'msg'  => $msg,
            'data' => $data,
        ]);
    }
}

if (!function_exists('fail')) {
    /**
     * 失败响应
     *
     * @param string $msg        提示信息
     * @param int    $code       业务码（非 0）
     * @param int    $httpStatus HTTP 状态码
     * @return Json
     */
    function fail(string $msg = 'fail', int $code = 1, int $httpStatus = 200): Json
    {
        return json([
            'code' => $code,
            'msg'  => $msg,
            'data' => null,
        ], $httpStatus);
    }
}
