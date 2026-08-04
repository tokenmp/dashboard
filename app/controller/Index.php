<?php

namespace app\controller;

use app\BaseController;

class Index extends BaseController
{
    /**
     * 返回 SPA 入口 HTML
     *
     * 前端构建产物位于 public/static/index.html（由 Vite 输出）；
     * 若未构建，返回提示信息。
     */
    public function index()
    {
        $file = public_path('static') . 'index.html';

        if (!is_file($file)) {
            return response(
                '前端尚未构建。请在 web/ 目录执行 <code>npm run build</code>。',
                200,
                ['Content-Type' => 'text/html; charset=utf-8']
            );
        }

        return response(file_get_contents($file))->contentType('text/html; charset=utf-8');
    }
}
