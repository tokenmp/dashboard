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
use app\middleware\Admin;
use app\middleware\Auth;
use think\facade\Route;

/*
|--------------------------------------------------------------------------
| API 路由（统一前缀 /api）
|--------------------------------------------------------------------------
| 角色分区：
|   - 双角色共用：登录、概览、我的请求/用量/密钥/兑换、公告、更新日志等，
|     由控制器内 DataScope 按角色 scope/过滤。
|   - 管理专属：用户管理、上游供应商/路由组/模型、系统配置/迁移、兑换码管理、
|     计费规则 —— 挂 Admin 中间件，非 admin 直接 403。
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

    // 需鉴权的接口（以下全部挂 Auth）
    Route::group(function () {

        // 概览仪表盘（双角色，控制器内按角色返回 admin/user 视图）
        Route::group('dashboard', function () {
            Route::get('overview', 'api/Dashboard/overview');
        });

        // 请求日志监控（双角色，DataScope 按 user_id 隔离）
        Route::group('requests', function () {
            Route::get('', 'api/RequestLog/list');
            Route::get(':id', 'api/RequestLog/detail')->pattern(['id' => '[\w\-]+']);
        });

        // 用户管理（admin）：列表 / 详情 / 某用户通知
        Route::group(function () {
            Route::group('users', function () {
                Route::get('', 'api/User/list');
                Route::get(':id', 'api/User/detail')->pattern(['id' => '[\w\-]+']);
                Route::get(':id/notifications', 'api/System/userNotifications')->pattern(['id' => '[\w\-]+']);
            });
        })->middleware(Admin::class);

        // 当前用户账户中心（双角色，单数 user）
        Route::group('user', function () {
            Route::get('', 'api/User/profile');
            Route::get('keys', 'api/User/keys');
            Route::get('keys/bot', 'api/User/botKeys');
            Route::get('plans', 'api/User/plans');
            Route::get('redemptions', 'api/RedeemCode/myRedemptions');
            Route::get('notifications', 'api/System/myNotifications');
        });

        // 上游与模型
        Route::group('upstream', function () {
            // Key 列表/详情：双角色（user 仅看 owner_user_id 为自己的）
            Route::group('keys', function () {
                Route::get('', 'api/Upstream/keys');
                Route::get(':id', 'api/Upstream/keyDetail')->pattern(['id' => '[\w\-]+']);
            });
            // 供应商 / 路由组：admin
            Route::group(function () {
                Route::get('providers', 'api/Upstream/providers');
                Route::get('routes', 'api/Upstream/routes');
            })->middleware(Admin::class);
        });
        // 模型目录：admin
        Route::get('models', 'api/Upstream/models')->middleware(Admin::class);

        // 计费用量（双角色）
        Route::group('usage', function () {
            Route::get('ledger', 'api/Usage/ledger');
            Route::get('quota', 'api/Usage/quota');
        });
        // 计费规则（价格倍率）：admin
        Route::group('price', function () {
            Route::get('rules', 'api/Usage/rules');
        })->middleware(Admin::class);

        // 市场分账（双角色，控制器内按角色过滤：user 仅看自己参与的）
        Route::group('marketplace', function () {
            Route::get('listings', 'api/Marketplace/listings');
            Route::get('settlements', 'api/Marketplace/settlements');
            Route::get('ledger', 'api/Marketplace/ledger');
        });

        // 系统与通知
        Route::group('system', function () {
            // 公告 / 版本日志：双角色（user 仅看 published）
            Route::get('notices', 'api/System/notices');
            Route::group('releases', function () {
                Route::get('', 'api/System/releases');
                Route::get(':id', 'api/System/releaseDetail')->pattern(['id' => '[\w\-]+']);
            });
            // 系统配置 / 迁移台账：admin
            Route::group(function () {
                Route::get('config', 'api/System/config');
                Route::get('migrations', 'api/System/migrations');
            })->middleware(Admin::class);
        });

        // 兑换码管理（admin）
        Route::group(function () {
            Route::group('redeem', function () {
                Route::group('codes', function () {
                    Route::get('', 'api/RedeemCode/list');
                    Route::get(':id/redemptions', 'api/RedeemCode/redemptions')->pattern(['id' => '[\w\-]+']);
                });
            });
        })->middleware(Admin::class);
    })->middleware(Auth::class);
});

/*
|--------------------------------------------------------------------------
| SPA 入口与兜底
|--------------------------------------------------------------------------
| 根路径与所有未匹配的非 /api 路径（如 /dashboard、/panel、/login）均返回前端入口
| HTML，具体页面由 React Router 在客户端处理。
*/
Route::get('/', 'Index/index');

// 兜底：未匹配的非 /api 路径（如 /dashboard、/panel、/login）也返回前端入口，
// 由 React Router 在客户端处理
Route::miss('Index/index');
