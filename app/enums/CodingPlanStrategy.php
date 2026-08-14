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

    /** 默认策略（依序）：最近到期 → 剩余少 → 限额小 → 先激活 */
    public const DEFAULT_LIST = [
        self::SoonestExpiry,
        self::LeastRemaining,
        self::SmallestLimit,
        self::OldestFirst,
    ];

    /** 策略所属维度分组；同组两向互斥，不可同时出现在一个策略列表里 */
    public function group(): string
    {
        return match ($this) {
            self::LargestLimit, self::SmallestLimit   => 'limit',
            self::LeastRemaining, self::MostRemaining => 'remaining',
            self::SoonestExpiry, self::LatestExpiry   => 'expiry',
            self::OldestFirst, self::NewestFirst      => 'activated',
        };
    }

    /** 同组的另一向（互斥项）；无同名概念时返回 null（每项都有 sibling） */
    public function sibling(): self
    {
        return match ($this) {
            self::LargestLimit  => self::SmallestLimit,
            self::SmallestLimit => self::LargestLimit,
            self::LeastRemaining => self::MostRemaining,
            self::MostRemaining   => self::LeastRemaining,
            self::SoonestExpiry => self::LatestExpiry,
            self::LatestExpiry  => self::SoonestExpiry,
            self::OldestFirst => self::NewestFirst,
            self::NewestFirst => self::OldestFirst,
        };
    }

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
        $groups = [];
        $out = [];
        foreach (explode(',', $stored) as $part) {
            $key = trim($part);
            if ($key === '' || isset($seen[$key])) {
                throw new \InvalidArgumentException("策略 key 非法或重复：{$part}");
            }
            $strategy = self::from($key); // 非法 key 抛 ValueError
            $group = $strategy->group();
            if (isset($groups[$group])) {
                throw new \InvalidArgumentException("同组策略互斥：{$key} 与 {$groups[$group]} 不能同时启用");
            }
            $out[] = $strategy;
            $seen[$key] = true;
            $groups[$group] = $key;
        }
        return $out;
    }

    /** 宽松解析（展示路径）：非法/空时回退默认列表；同组冲突时保留先出现者。不抛异常。
     * @return list<self> */
    public static function parseListLenient(?string $stored): array
    {
        try {
            return self::parseList((string) $stored);
        } catch (\ValueError) {
            return self::DEFAULT_LIST;
        } catch (\InvalidArgumentException) {
            // 逐项过滤：key 合法 + 去重 + 同组保留先出现者
            $seen = [];
            $groups = [];
            $out = [];
            foreach (explode(',', (string) $stored) as $part) {
                $key = trim($part);
                if ($key === '' || isset($seen[$key])) {
                    continue;
                }
                $strategy = self::tryFrom($key);
                if ($strategy === null) {
                    continue;
                }
                $group = $strategy->group();
                if (isset($groups[$group])) {
                    continue;
                }
                $out[] = $strategy;
                $seen[$key] = true;
                $groups[$group] = $key;
            }
            return $out !== [] ? $out : self::DEFAULT_LIST;
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
