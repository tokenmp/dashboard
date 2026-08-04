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
