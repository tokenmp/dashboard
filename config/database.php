<?php

return [
    // 默认使用的数据库连接配置
    'default'         => env('DB_DRIVER', 'mysql'),

    // 自定义时间查询规则
    'time_query_rule' => [],

    // 自动写入时间戳字段
    // true为自动识别类型 false关闭
    // 字符串则明确指定时间字段类型 支持 int timestamp datetime date
    'auto_timestamp'  => true,

    // 时间字段取出后的默认时间格式
    'datetime_format' => 'Y-m-d H:i:s',

    // 时间字段配置 配置格式：create_time,update_time
    'datetime_field'  => '',

    // 数据库连接配置信息
    'connections'     => [
        'mysql' => [
            // 数据库类型
            'type'            => env('DB_TYPE', 'mysql'),
            // 服务器地址
            'hostname'        => env('DB_HOST', '127.0.0.1'),
            // 数据库名
            'database'        => env('DB_NAME', ''),
            // 用户名
            'username'        => env('DB_USER', 'root'),
            // 密码
            'password'        => env('DB_PASS', ''),
            // 端口
            'hostport'        => env('DB_PORT', '3306'),
            // 数据库连接参数
            'params'          => [],
            // 数据库编码
            'charset'         => env('DB_CHARSET', 'utf8mb4'),
            // 数据库表前缀
            'prefix'          => env('DB_PREFIX', ''),

            // 数据库部署方式:0 集中式(单一服务器),1 分布式(主从服务器)
            'deploy'          => 0,
            // 数据库读写是否分离 主从式有效
            'rw_separate'     => false,
            // 读写分离后 主服务器数量
            'master_num'      => 1,
            // 指定从服务器序号
            'slave_no'        => '',
            // 是否严格检查字段是否存在
            'fields_strict'   => true,
            // 是否需要断线重连
            'break_reconnect' => false,
            // 监听SQL
            'trigger_sql'     => env('APP_DEBUG', true),
            // 开启字段缓存
            'fields_cache'    => false,
        ],

        // PostgreSQL 连接（app\model 下的模型通过 $connection = 'pgsql' 使用）
        // 连接信息通过环境变量注入，参考 .example.env 中的 PG_* 配置。
        'pgsql' => [
            // 数据库类型
            'type'            => 'pgsql',
            // 会话时区：显式与 app.default_timezone 对齐（think-orm 连接时执行 SET timezone）。
            // ⚠️ 不设则跟随 PG server 默认（常为 UTC），与 PHP 时区不一致时，
            //    「今日/趋势」类查询（current_date / PHP date() 混用）会出现边界错位、
            //    当天数据漏计。SET 仅影响本连接会话，不影响共享此库的 executor。
            'timezone'        => env('PG_TIMEZONE', 'Asia/Shanghai'),
            // 服务器地址
            'hostname'        => env('PG_HOST', '127.0.0.1'),
            // 数据库名
            'database'        => env('PG_DB', 'tokenmp_prod'),
            // 用户名
            'username'        => env('PG_USER', 'postgres'),
            // 密码
            'password'        => env('PG_PASS', ''),
            // 端口
            'hostport'        => env('PG_PORT', '5432'),
            // 数据库连接参数
            // EMULATE_PREPARES：模拟预处理，把 prepare+execute 合成一次网络往返。
            // 经 SSH 隧道时 native prepare 每查询 ~148ms（Parse+Bind+Execute 两次 RTT），
            // 模拟后 ~49ms（与 psql 一致）。PDO 转义可靠，安全性不变。
            'params'          => [\PDO::ATTR_EMULATE_PREPARES => true],
            // 数据库编码
            'charset'         => env('PG_CHARSET', 'utf8'),
            // 数据库表前缀
            'prefix'          => env('PG_PREFIX', ''),

            // 数据库部署方式:0 集中式(单一服务器),1 分布式(主从服务器)
            'deploy'          => 0,
            // 数据库读写是否分离 主从式有效
            'rw_separate'     => false,
            // 读写分离后 主服务器数量
            'master_num'      => 1,
            // 指定从服务器序号
            'slave_no'        => '',
            // 是否严格检查字段是否存在
            'fields_strict'   => true,
            // 是否需要断线重连
            'break_reconnect' => false,
            // 监听SQL
            'trigger_sql'     => env('APP_DEBUG', true),
            // 开启字段缓存
            'fields_cache'    => false,
        ],

        // 更多的数据库配置信息
    ],
];
