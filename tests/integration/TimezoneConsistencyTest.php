<?php
declare(strict_types=1);

namespace tests\integration;

use think\facade\Db;

/**
 * 时区一致性回归守卫。
 *
 * 背景:config/app.php 设 PHP 时区为 Asia/Shanghai,而 PG 连接若不显式设置会话时区,
 * 会跟随 server 默认(常为 UTC)。两套口径不一致时,「今日/趋势」类查询
 * (current_date 与 PHP date() 混用)会出现边界错位、当天数据漏计
 * (已在 panel/Overview 修过一次,此处防止回归)。
 *
 * 约束:config/database.php 的 pgsql.timezone 必须与 app.default_timezone 对齐。
 */
final class TimezoneConsistencyTest extends IntegrationTestCase
{
    public function testDbSessionTimezoneMatchesPhpTimezone(): void
    {
        $dbTz = Db::connect('pgsql')->query(
            'SELECT extract(timezone from now())::int AS tz, current_setting(\'TimeZone\') AS name'
        )[0];

        // 功能性断言:同一时刻的 UTC 偏移秒数必须一致(命名无关,DST 安全)
        $phpOffset = (new \DateTime('now'))->format('Z');
        $this->assertSame(
            (int) $phpOffset,
            (int) $dbTz['tz'],
            sprintf(
                'DB 会话时区(%s,偏移 %ds)与 PHP 时区(%s,偏移 %ds)不一致;'
                . '请检查 config/database.php pgsql.timezone 与 config/app.php default_timezone',
                $dbTz['name'],
                $dbTz['tz'],
                date_default_timezone_get(),
                $phpOffset
            )
        );
    }
}
