<?php
// +----------------------------------------------------------------------
// | ThinkPHP [ WE CAN DO IT JUST THINK ]
// +----------------------------------------------------------------------
// | Copyright (c) 2006~2018 http://thinkphp.cn All rights reserved.
// +----------------------------------------------------------------------
// | Licensed ( http://www.apache.org/licenses/LICENSE-2.0 )
// +----------------------------------------------------------------------
// | Author: liu21st <liu21st@gmail.com>
// +----------------------------------------------------------------------
use app\middleware\Auth;
use think\facade\Route;

/*
|--------------------------------------------------------------------------
| API 路由（统一前缀 /api）
|--------------------------------------------------------------------------
*/
Route::group('api', function () {
    Route::group('auth', function () {
        // 公开接口
        Route::post('login', 'api/Auth/login');
        Route::get('public-key', 'api/Auth/publicKey');

        // 需鉴权的接口
        Route::group(function () {
            Route::get('user', 'api/Auth/user');
        })->middleware(Auth::class);
    });

    // 概览仪表盘（需鉴权）
    Route::group(function () {
        Route::group('dashboard', function () {
            Route::get('overview', 'api/Dashboard/overview');
        });

        // 请求日志监控
        Route::group('requests', function () {
            Route::get('', 'api/RequestLog/list');
            Route::get(':id', 'api/RequestLog/detail')->pattern(['id' => '[\w\-]+']);
        });

        // 用户与账户
        Route::group('users', function () {
            Route::get('', 'api/User/list');
            Route::get(':id', 'api/User/detail')->pattern(['id' => '[\w\-]+']);
        });
        // 当前用户账户中心（单数 user）
        Route::group('user', function () {
            Route::get('', 'api/User/profile');
            Route::get('keys', 'api/User/keys');
            Route::get('keys/bot', 'api/User/botKeys');
            Route::get('plans', 'api/User/plans');
        });

        // 上游与模型
        Route::group('upstream', function () {
            Route::get('providers', 'api/Upstream/providers');
            Route::group('keys', function () {
                Route::get('', 'api/Upstream/keys');
                Route::get(':id', 'api/Upstream/keyDetail')->pattern(['id' => '[\w\-]+']);
            });
            Route::get('routes', 'api/Upstream/routes');
        });
        Route::get('models', 'api/Upstream/models');

        // 计费用量
        Route::group('usage', function () {
            Route::get('ledger', 'api/Usage/ledger');
            Route::get('quota', 'api/Usage/quota');
        });
        Route::group('price', function () {
            Route::get('rules', 'api/Usage/rules');
        });
    })->middleware(Auth::class);
});

/*
|--------------------------------------------------------------------------
| SPA 入口与兜底
|--------------------------------------------------------------------------
| 根路径与所有未匹配的非 /api 路径（如 /dashboard、/login）均返回前端入口
| HTML，具体页面由 React Router 在客户端处理。
*/
Route::get('/', 'Index/index');

// 兜底：未匹配的非 /api 路径（如 /dashboard、/login）也返回前端入口，
// 由 React Router 在客户端处理
Route::miss('Index/index');
