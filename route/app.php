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
| API 路由（统一前缀 /api/v1）
|--------------------------------------------------------------------------
| 按「调用方」拆为三个命名空间，彻底分离、无需任何运行时模式判断：
|
|   - /api/v1/auth/*       中性：登录、公钥、当前用户身份
|   - /api/v1/site/*       公开：landing 页游客数据（模型广场、套餐目录、站点统计）
|   - /api/v1/panel/*      用户面（仅 Auth）：强制自取数据——
|                           管理员在此也只看自己的（DataScope::forSelf）。
|   - /api/v1/dashboard/*  管理面（Auth + Admin）：全平台管理数据。
|
| 控制器目录与之一一对应：app/controller/{auth,panel,dashboard}/。
*/
Route::group('api/v1', function () {

    // ─────────────── 中性：认证 ───────────────
    Route::group('auth', function () {
        Route::post('login', 'auth/Auth/login');
        Route::post('register', 'auth/Auth/register');
        Route::post('register/send-code', 'auth/Auth/sendRegisterCode');
        Route::get('public-key', 'auth/Auth/publicKey');
        Route::get('captcha-config', 'auth/Auth/captchaConfig');

        // 密码重置（公开，无需登录）
        Route::post('password/send-code', 'auth/PasswordReset/sendCode');
        Route::post('password/reset', 'auth/PasswordReset/reset');

        Route::group(function () {
            Route::get('user', 'auth/Auth/user');
        })->middleware(Auth::class);
    });

    // ─────────────── 站点公开（site）：landing 页游客数据，无需登录 ───────────────
    Route::group('site', function () {
        Route::get('models', 'site/Site/models');
        Route::get('plans', 'site/Site/plans');
        Route::get('overview', 'site/Site/overview');
        Route::get('providers/:id/logo', 'site/Site/providerLogo')->pattern(['id' => '[\w\-]+']);
    });

    // ─────────────── 以下全部需鉴权（Auth） ───────────────
    Route::group(function () {

        // ─── 用户面 panel：自取数据（DataScope::forSelf） ───
        Route::group('panel', function () {
            // 注意：overview/models 必须在 overview 之前注册——静态路由 overview 会
            // 前缀匹配 overview/models（同下 keys/xxx 的先例）。
            Route::get('overview/models', 'panel/Overview/models');
            Route::get('overview', 'panel/Overview/overview');

            // 我的请求日志
            Route::group('requests', function () {
                Route::get('', 'panel/RequestLog/list');
                Route::get(':id', 'panel/RequestLog/detail')->pattern(['id' => '[\w\-]+']);
            });

            // 我的账户中心
            Route::group('user', function () {
                Route::get('', 'panel/User/profile');
                Route::put('plan-strategy', 'panel/User/updatePlanStrategy');
                // 注意：keys/bot* 必须在 keys* 之前注册——ThinkPHP 静态路由 keys 会前缀匹配
                // keys/xxx，若 keys 在前会吞掉 keys/bot 导致 Bot Key 端点误返回 API Key。
                Route::get('keys/bot', 'panel/User/botKeys');
                Route::post('keys/bot', 'panel/User/createBotKey');
                Route::put('keys/bot/:id', 'panel/User/updateBotKey')->pattern(['id' => '[\w\-]+']);
                Route::delete('keys/bot/:id', 'panel/User/deleteBotKey')->pattern(['id' => '[\w\-]+']);
                Route::get('keys', 'panel/User/keys');
                Route::post('keys', 'panel/User/createKey');
                Route::put('keys/:id', 'panel/User/updateKey')->pattern(['id' => '[\w\-]+']);
                Route::delete('keys/:id', 'panel/User/deleteKey')->pattern(['id' => '[\w\-]+']);
                Route::get('plans', 'panel/User/plans');
                Route::get('notifications', 'panel/Notification/mine');
                Route::post('notifications/read-all', 'panel/Notification/markAllRead');
                Route::post('notifications/:id/read', 'panel/Notification/markRead')->pattern(['id' => '[\\w\\-]+']);
                Route::get('redemptions', 'panel/Redeem/myRedemptions');
                Route::post('redeem', 'panel/Redeem/redeem');
            });

            // 我持有的上游 Key（自建：自带 key + 选模型 + 计费模式）
            Route::group('upstream', function () {
                Route::group('keys', function () {
                    Route::get('', 'panel/Upstream/keys');
                    // 静态路由必须先于 :id 注册（create-options 会被 [\w\-]+ 吃掉）
                    Route::get('create-options', 'panel/Upstream/createOptions');
                    Route::post('', 'panel/Upstream/createKey');
                    Route::get(':id', 'panel/Upstream/keyDetail')->pattern(['id' => '[\w\-]+']);
                    Route::put(':id', 'panel/Upstream/updateKey')->pattern(['id' => '[\w\-]+']);
                    Route::post(':id/status', 'panel/Upstream/updateKeyStatus')->pattern(['id' => '[\w\-]+']);
                    Route::delete(':id', 'panel/Upstream/deleteKey')->pattern(['id' => '[\w\-]+']);
                    Route::post(':id/probe', 'panel/Upstream/probeKey')->pattern(['id' => '[\w\-]+']);
                    Route::post(':id/models', 'panel/Upstream/addModels')->pattern(['id' => '[\w\-]+']);
                    Route::delete(':id/models/:mid', 'panel/Upstream/removeModel')->pattern(['id' => '[\w\-]+', 'mid' => '[\w\-]+']);
                });
                Route::get('models', 'panel/Upstream/models');
                Route::get('models/:id/success-buckets', 'panel/Upstream/successBuckets')->pattern(['id' => '[\w\-]+']);
                Route::get('model-names', 'panel/Upstream/modelNames');
                Route::get('model-key-health', 'panel/Upstream/modelKeyHealth');
            });

            // 我的用量
            Route::group('usage', function () {
                Route::get('ledger', 'panel/Usage/ledger');
                Route::get('quota', 'panel/Usage/quota');
                Route::get('timeline', 'panel/Usage/timeline');
                Route::get('by-model', 'panel/Usage/byModel');
            });

            // 我参与的市场分账
            Route::group('marketplace', function () {
                Route::get('listings', 'panel/Marketplace/listings');
                Route::get('settlements', 'panel/Marketplace/settlements');
                Route::get('ledger', 'panel/Marketplace/ledger');
            });

            // 公告 / 版本日志（仅 published）
            Route::get('notices', 'panel/System/notices');
            Route::group('releases', function () {
                Route::get('', 'panel/System/releases');
                Route::get(':id', 'panel/System/releaseDetail')->pattern(['id' => '[\w\-]+']);
            });
        });

        // ─── 管理面 dashboard：全平台（额外挂 Admin） ───
        Route::group(function () {
            Route::group('dashboard', function () {
                // overview/models 必须在 overview 之前注册（理由同 panel 侧）。
                Route::get('overview/models', 'dashboard/Overview/models');
                Route::get('overview', 'dashboard/Overview/overview');

                // 全平台请求日志（可按 userId 筛选）
                Route::group('requests', function () {
                    Route::get('', 'dashboard/RequestLog/list');
                    Route::get(':id', 'dashboard/RequestLog/detail')->pattern(['id' => '[\w\-]+']);
                });

                // 用户管理
                Route::group('users', function () {
                    Route::get('', 'dashboard/User/list');
                    Route::get('keys', 'dashboard/User/keys');
                    Route::post('', 'dashboard/User/create');
                    Route::get(':id', 'dashboard/User/detail')->pattern(['id' => '[\w\-]+']);
                    Route::put(':id', 'dashboard/User/update')->pattern(['id' => '[\w\-]+']);
                    Route::post(':id/reset-password', 'dashboard/User/resetPassword')->pattern(['id' => '[\w\-]+']);
                    Route::get(':id/notifications', 'dashboard/Notification/forUser')->pattern(['id' => '[\w\-]+']);

                    // 用户套餐：发放 / 续期 / 停用（planId = user_plan.id）
                    Route::post(':userId/plans', 'dashboard/UserPlan/grant')->pattern(['userId' => '[\w\-]+']);
                    Route::post(':userId/plans/:planId/renew', 'dashboard/UserPlan/renew')->pattern(['userId' => '[\w\-]+', 'planId' => '[\w\-]+']);
                    Route::put(':userId/plans/:planId/disable', 'dashboard/UserPlan/disable')->pattern(['userId' => '[\w\-]+', 'planId' => '[\w\-]+']);
                    Route::post(':userId/plans/:planId/reset-windows', 'dashboard/UserPlan/resetWindows')->pattern(['userId' => '[\w\-]+', 'planId' => '[\w\-]+']);
                });

                // 套餐目录（模板）CRUD
                Route::group('plans', function () {
                    Route::get('', 'dashboard/Plan/list');
                    Route::post('', 'dashboard/Plan/create');
                    Route::put(':id/status', 'dashboard/Plan/updateStatus')->pattern(['id' => '[\w\-]+']);
                    Route::put(':id', 'dashboard/Plan/update')->pattern(['id' => '[\w\-]+']);
                });

                // 上游与模型
                Route::group('upstream', function () {
                    Route::group('keys', function () {
                        Route::get('', 'dashboard/Upstream/keys');
                        Route::get(':id', 'dashboard/Upstream/keyDetail')->pattern(['id' => '[\w\-]+']);
                        Route::post(':id/probe', 'dashboard/Upstream/probeKey')->pattern(['id' => '[\w\-]+']);
                        Route::post(':id/status', 'dashboard/Upstream/updateKeyStatus')->pattern(['id' => '[\w\-]+']);
                        Route::post(':id/delete', 'dashboard/Upstream/deleteKey')->pattern(['id' => '[\w\-]+']);
                    });
                    Route::get('providers', 'dashboard/Upstream/providers');
                    Route::post('providers', 'dashboard/Upstream/createProvider');
                    Route::group('providers', function () {
                        Route::put(':id', 'dashboard/Upstream/updateProvider')->pattern(['id' => '[\w\-]+']);
                        Route::put(':id/thinking-config', 'dashboard/Upstream/updateProviderThinkingConfig')->pattern(['id' => '[\w\-]+']);
                        Route::get(':id/endpoints', 'dashboard/Upstream/endpoints')->pattern(['id' => '[\w\-]+']);
                        Route::post(':id/endpoints', 'dashboard/Upstream/createEndpoint')->pattern(['id' => '[\w\-]+']);
                        Route::post(':id/keys', 'dashboard/Upstream/createKey')->pattern(['id' => '[\w\-]+']);
                    });
                    Route::group('endpoints', function () {
                        Route::put(':id', 'dashboard/Upstream/updateEndpoint')->pattern(['id' => '[\w\-]+']);
                        Route::delete(':id', 'dashboard/Upstream/deleteEndpoint')->pattern(['id' => '[\w\-]+']);
                    });
                    Route::get('routes', 'dashboard/Upstream/routes');
                    Route::get('model-key-health', 'dashboard/Upstream/modelKeyHealth');
                });
                // 平台模型 CRUD
                Route::group('models', function () {
                    Route::get('', 'dashboard/Model/list');
                    Route::post('', 'dashboard/Model/create');
                    Route::get('key-options', 'dashboard/Model/keyOptions');
                    Route::get('route-groups', 'dashboard/Model/routeGroups');
                    Route::group('mappings', function () {
                        Route::put(':mid', 'dashboard/Model/updateMapping')->pattern(['mid' => '[\w\-]+']);
                        Route::delete(':mid', 'dashboard/Model/deleteMapping')->pattern(['mid' => '[\w\-]+']);
                        Route::post(':mid/status', 'dashboard/Model/updateMappingStatus')->pattern(['mid' => '[\w\-]+']);
                    });
                    Route::get(':id/mappings', 'dashboard/Model/mappings')->pattern(['id' => '[\w\-]+']);
                    Route::post(':id/mappings', 'dashboard/Model/createMapping')->pattern(['id' => '[\w\-]+']);
                    Route::put(':id/thinking-config', 'dashboard/Model/updateThinkingConfig')->pattern(['id' => '[\w\-]+']);
                    Route::get(':id', 'dashboard/Model/detail')->pattern(['id' => '[\w\-]+']);
                    Route::put(':id', 'dashboard/Model/update')->pattern(['id' => '[\w\-]+']);
                });

                // 全平台用量 + 计费规则
                Route::group('usage', function () {
                    Route::get('ledger', 'dashboard/Usage/ledger');
                    Route::get('quota', 'dashboard/Usage/quota');
                });
                Route::group('price', function () {
                    Route::get('rules', 'dashboard/PriceRule/list');
                    Route::post('rules', 'dashboard/PriceRule/create');
                    Route::group('rules', function () {
                        Route::put(':id', 'dashboard/PriceRule/update')->pattern(['id' => '[\w\-]+']);
                        Route::post(':id/status', 'dashboard/PriceRule/updateStatus')->pattern(['id' => '[\w\-]+']);
                        Route::post(':id/delete', 'dashboard/PriceRule/delete')->pattern(['id' => '[\w\-]+']);
                    });
                });

                // 全平台市场分账
                Route::group('marketplace', function () {
                    Route::get('listings', 'dashboard/Marketplace/listings');
                    Route::get('settlements', 'dashboard/Marketplace/settlements');
                    Route::get('ledger', 'dashboard/Marketplace/ledger');
                });

                // 公告 / 版本日志（全部）/ 系统配置 / 迁移台账
                Route::get('notices', 'dashboard/System/notices');
                Route::post('notices', 'dashboard/System/createNotice');
                Route::put('notices/:id', 'dashboard/System/updateNotice')->pattern(['id' => '[\w\-]+']);
                Route::delete('notices/:id', 'dashboard/System/deleteNotice')->pattern(['id' => '[\w\-]+']);
                Route::group('releases', function () {
                    Route::get('', 'dashboard/System/releases');
                    Route::post('', 'dashboard/System/createRelease');
                    Route::get(':id', 'dashboard/System/releaseDetail')->pattern(['id' => '[\w\-]+']);
                    Route::put(':id', 'dashboard/System/updateRelease')->pattern(['id' => '[\w\-]+']);
                    Route::delete(':id', 'dashboard/System/deleteRelease')->pattern(['id' => '[\w\-]+']);
                });
                Route::get('config', 'dashboard/System/config');
                Route::get('migrations', 'dashboard/System/migrations');

                // 兑换码管理
                Route::group('redeem', function () {
                    Route::group('codes', function () {
                        Route::get('', 'dashboard/Redeem/list');
                        Route::post('', 'dashboard/Redeem/create');
                        Route::get(':id/redemptions', 'dashboard/Redeem/redemptions')->pattern(['id' => '[\w\-]+']);
                    });
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

// 兜底：未匹配的非 /api 路径（如 /dashboard、/panel、/login）返回前端入口，
// 由 React Router 在客户端处理；未匹配的 /api 路径返回 404 JSON——
// 避免调用方拿到 200 + SPA HTML 误判成功（安全测试中发现的口径问题）。
Route::miss(function (\think\Request $request) {
    $path = trim($request->pathinfo(), '/');
    if ($path === 'api' || str_starts_with($path, 'api/')) {
        return json(['code' => 1, 'message' => 'Not Found', 'data' => null])->code(404);
    }
    return (new \app\controller\Index(app()))->index();
});
