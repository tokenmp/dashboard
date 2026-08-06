<?php
declare(strict_types=1);

namespace app\service;

use think\facade\Cache;
use think\facade\Db;

/**
 * 按模型聚合各上游 Key 最近 24 小时的调用健康数据。
 */
class ModelKeyHealthService
{
    /**
     * 返回指定模型所有 active mapping 的上游 Key 最近 24 个 UTC 小时桶。
     *
     * 已完成小时会缓存到该 UTC 日期的次日结束，确保其仍在 24 小时窗口内时可复用；
     * 当前小时始终实时查询。
     *
     * @return array<int, array{
     *     upstream_key_id: string,
     *     series: array<int, array{hour: string, total: int, success: int, failed: int}>
     * }>
     */
    public static function getModelKeyHealth(string $modelId): array
    {
        $modelId = trim($modelId);
        if ($modelId === '') {
            return [];
        }

        $keyRows = Db::connect('pgsql')->table('upstream_model_mappings')
            ->where('model_id', $modelId)
            ->where('status', 'active')
            ->distinct(true)
            ->column('upstream_key_id');
        $keyIds = array_values(array_unique(array_filter($keyRows)));
        if (empty($keyIds)) {
            return [];
        }

        $now = time();
        $currentHour = intdiv($now, 3600) * 3600;
        $startHour = $currentHour - 23 * 3600;

        /** @var array<string, array<string, array{0: int, 1: int, 2: int}>> $buckets */
        $buckets = [];
        $missingHours = [];

        for ($hour = $startHour; $hour <= $currentHour; $hour += 3600) {
            $hourString = gmdate('YmdH', $hour);
            $cached = Cache::get(self::cacheKey($modelId, $hourString));
            if ($cached !== null && $hour < $currentHour) {
                $buckets[$hourString] = $cached;
            } else {
                $missingHours[] = $hour;
            }
        }

        if (!empty($missingHours)) {
            $keyPlaceholders = implode(',', array_fill(0, count($keyIds), '?'));
            $minTime = gmdate('Y-m-d\TH:i:s\Z', min($missingHours));
            $maxTime = gmdate('Y-m-d\TH:i:s\Z', max($missingHours) + 3600);
            $rows = Db::connect('pgsql')->query(
                "select upstream_key_id,"
                . " to_char(created_at AT TIME ZONE 'UTC', 'YYYYMMDDHH24') as hour,"
                . " count(*) as total,"
                . " count(*) filter (where status_code between 200 and 299 and coalesce(error_code, '') = '') as success,"
                . " count(*) filter (where status_code is null or status_code < 200 or status_code >= 300 or coalesce(error_code, '') <> '') as failed"
                . " from request_attempts"
                . " where upstream_key_id in ($keyPlaceholders)"
                . " and created_at >= ? and created_at < ?"
                . " group by upstream_key_id, hour",
                array_merge($keyIds, [$minTime, $maxTime])
            );

            $byHour = [];
            foreach ($rows as $row) {
                $byHour[$row['hour']][$row['upstream_key_id']] = [
                    (int) $row['total'],
                    (int) $row['success'],
                    (int) $row['failed'],
                ];
            }

            foreach ($missingHours as $hour) {
                $hourString = gmdate('YmdH', $hour);
                $bucketData = $byHour[$hourString] ?? [];
                $buckets[$hourString] = $bucketData;

                if ($hour < $currentHour) {
                    // UTC 当天结束再加一天，使前一天桶在次日的 24h 窗口内仍可命中。
                    $expiresAt = (intdiv($hour, 86400) + 2) * 86400;
                    Cache::set(
                        self::cacheKey($modelId, $hourString),
                        $bucketData,
                        max(60, $expiresAt - $now)
                    );
                }
            }
        }

        $result = [];
        foreach ($keyIds as $keyId) {
            $series = [];
            for ($hour = $startHour; $hour <= $currentHour; $hour += 3600) {
                $hourString = gmdate('YmdH', $hour);
                $data = $buckets[$hourString][$keyId] ?? [0, 0, 0];
                $series[] = [
                    'hour' => gmdate('H', $hour),
                    'total' => $data[0],
                    'success' => $data[1],
                    'failed' => $data[2],
                ];
            }
            $result[] = [
                'upstream_key_id' => $keyId,
                'series' => $series,
            ];
        }

        return $result;
    }

    private static function cacheKey(string $modelId, string $hour): string
    {
        return 'mkh:' . $modelId . ':' . $hour;
    }
}
