<?php
declare(strict_types=1);

namespace app\enums;

/**
 * 扣费套餐选择策略（枚举）。多 coding 套餐共存时决定扣费顺序，
 * 与执行器 internal/postgres/plan_strategy.go 的 Go 枚举一一对应。
 *
 * 配置为有序策略列表（users.coding_plan_strategy，逗号分隔 key）：
 * 依序比较、前者相等再比下一者；模型白名单匹配永远最优先。
 */
enum CodingPlanStrategy: string
{
    /** 限额大优先（cycle→weekly→5h 降序；历史默认行为） */
    case LargestLimit = 'largest_limit';
    /** 限额小优先 */
    case SmallestLimit = 'smallest_limit';
    /** 剩余最少优先（把快用完的打满再换新） */
    case LeastRemaining = 'least_remaining';
    /** 剩余最多优先 */
    case MostRemaining = 'most_remaining';
    /** 最近到期优先（快过期的先用；永久套餐殿后） */
    case SoonestExpiry = 'soonest_expiry';
    /** 最晚到期优先（长期套餐先垫；永久套餐殿后） */
    case LatestExpiry = 'latest_expiry';
    /** 先激活先用（FIFO） */
    case OldestFirst = 'oldest_first';
    /** 最新激活先用（历史 tie-break 行为） */
    case NewestFirst = 'newest_first';

    /** 默认策略（依序）：最近到期 → 限额小 → 剩余少 → 先激活 */
    public const DEFAULT_LIST = [
        self::SoonestExpiry,
        self::SmallestLimit,
        self::LeastRemaining,
        self::OldestFirst,
    ];

    /**
     * 解析存储串为有序枚举列表。
     * 非法 key / 空值 / 重复 → 抛 InvalidArgumentException（写入口应转为 400）。
     *
     * @return list<self>
     */
    public static function parseList(string $stored): array
    {
        $stored = trim($stored);
        if ($stored === '') {
            throw new \InvalidArgumentException('策略列表不能为空');
        }
        $seen = [];
        $out = [];
        foreach (explode(',', $stored) as $part) {
            $key = trim($part);
            if ($key === '' || isset($seen[$key])) {
                throw new \InvalidArgumentException("策略 key 非法或重复：{$part}");
            }
            $out[] = self::from($key); // 非法 key 抛 ValueError
            $seen[$key] = true;
        }
        return $out;
    }

    /** 宽松解析（展示路径）：非法/空时回退默认列表，不抛异常。
     * @return list<self> */
    public static function parseListLenient(?string $stored): array
    {
        try {
            return self::parseList((string) $stored);
        } catch (\ValueError|\InvalidArgumentException) {
            return self::DEFAULT_LIST;
        }
    }

    /** 格式化为存储串（逗号分隔）。
     * @param list<self> $list */
    public static function format(array $list): string
    {
        return implode(',', array_map(fn (self $s) => $s->value, $list));
    }

    /** 默认存储串 */
    public static function defaultStored(): string
    {
        return self::format(self::DEFAULT_LIST);
    }
}
