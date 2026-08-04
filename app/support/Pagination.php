<?php
declare(strict_types=1);

namespace app\support;

use think\db\BaseQuery;
use think\Request;

/**
 * 分页与查询参数解析工具
 *
 * 统一约定（见 docs/dashboard-api-plan.md §2.2）：
 * - 入参：page（默认 1）、size（默认 20，上限 100）、sort（如 -created_at）、from / to（ISO 8601）
 * - 分页响应：data => { list, page, size, total }
 *
 * 用法：
 *   [$page, $size] = Pagination::page($this->request);
 *   $query = ...;
 *   Pagination::applySort($query, $this->request, ['created_at', 'updated_at']);
 *   Pagination::applyTimeRange($query, $this->request, 'created_at');
 *   $total = $query->count();
 *   $list  = $query->page($page, $size)->select();
 *   return success(Pagination::wrap($list, $total, $page, $size));
 */
class Pagination
{
    /** 默认每页条数 */
    public const DEFAULT_SIZE = 20;

    /** 每页最大条数 */
    public const MAX_SIZE = 100;

    /**
     * 解析 page / size
     *
     * @return array{0:int,1:int} [page, size]
     */
    public static function page(Request $request): array
    {
        $page = max(1, (int) $request->get('page', 1));
        $size = (int) $request->get('size', self::DEFAULT_SIZE);
        $size = max(1, min(self::MAX_SIZE, $size));
        return [$page, $size];
    }

    /**
     * 包装分页结果为统一响应 data 结构
     *
     * @param mixed $list  列表数据（数组或集合）
     */
    public static function wrap($list, int $total, int $page, int $size): array
    {
        return [
            'list'  => $list,
            'page'  => $page,
            'size'  => $size,
            'total' => $total,
        ];
    }

    /**
     * 应用时间区间过滤（闭区间，列需为时间类型）
     *
     * @param string $column 时间列名，如 created_at
     */
    public static function applyTimeRange($query, Request $request, string $column): void
    {
        $from = self::parseTime($request->get('from'));
        $to   = self::parseTime($request->get('to'));
        if ($from !== null) {
            $query->where($column, '>=', $from);
        }
        if ($to !== null) {
            $query->where($column, '<=', $to);
        }
    }

    /**
     * 应用白名单排序
     *
     * sort 形如 "-created_at"（降序）、"created_at"（升序）。
     * 仅允许 $allowed 中声明的列，防注入与全表扫描。
     */
    public static function applySort($query, Request $request, array $allowed, string $default = ''): void
    {
        $sort = (string) $request->get('sort', '');
        if ($sort === '' && $default !== '') {
            $sort = $default;
        }
        if ($sort === '') {
            return;
        }

        $desc = str_starts_with($sort, '-');
        $col  = ltrim($sort, '-+');
        if (in_array($col, $allowed, true)) {
            $query->order($col, $desc ? 'desc' : 'asc');
        }
    }

    /**
     * 解析时间字符串为 'Y-m-d H:i:s'（失败返回 null）
     */
    private static function parseTime($value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        $ts = strtotime((string) $value);
        return $ts === false ? null : date('Y-m-d H:i:s', $ts);
    }
}
