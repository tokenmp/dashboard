<?php
declare(strict_types=1);

namespace tests\unit;

use app\support\Pagination;
use PHPUnit\Framework\TestCase;
use think\Request;

/**
 * Pagination 工具单测。
 *
 * 重点验证安全语义:size 上限(防大分页拖库)、排序白名单(防注入/全表扫描)、
 * 以及时间区间解析。
 */
final class PaginationTest extends TestCase
{
    /** 记录 where()/order() 调用的 fake query。 */
    private function recordingQuery(): object
    {
        return new class {
            public array $wheres = [];
            public array $orders = [];

            /** @return $this */
            public function where(...$args)
            {
                $this->wheres[] = $args;
                return $this;
            }

            /** @return $this */
            public function order($column, $direction = 'asc')
            {
                $this->orders[] = [$column, $direction];
                return $this;
            }
        };
    }

    private function request(array $get): Request
    {
        return (new Request())->withGet($get);
    }

    /* ----------------------------- page 解析 ----------------------------- */

    public function testPageDefaults(): void
    {
        [$page, $size] = Pagination::page($this->request([]));
        $this->assertSame([1, 20], [$page, $size]);
    }

    public function testPageClampsBelowOne(): void
    {
        [$page, $size] = Pagination::page($this->request(['page' => 0, 'size' => 0]));
        $this->assertSame([1, 1], [$page, $size]);
    }

    public function testSizeCappedAtMax(): void
    {
        // 防大分页拖库:size 上限 100
        [$page, $size] = Pagination::page($this->request(['size' => 99999]));
        $this->assertSame(100, $size);
    }

    public function testPageHonorsExplicitValues(): void
    {
        [$page, $size] = Pagination::page($this->request(['page' => 3, 'size' => 50]));
        $this->assertSame([3, 50], [$page, $size]);
    }

    /* ----------------------------- wrap 结构 ----------------------------- */

    public function testWrapReturnsCanonicalShape(): void
    {
        $data = Pagination::wrap(['a', 'b'], 42, 3, 10);

        $this->assertSame(['list' => ['a', 'b'], 'page' => 3, 'size' => 10, 'total' => 42], $data);
    }

    /* ----------------------------- applySort 白名单 ----------------------------- */

    public function testApplySortAllowsWhitelistedColumnDesc(): void
    {
        $q = $this->recordingQuery();
        Pagination::applySort($q, $this->request(['sort' => '-created_at']), ['created_at', 'updated_at']);

        $this->assertSame([['created_at', 'desc']], $q->orders);
    }

    public function testApplySortAllowsWhitelistedColumnAsc(): void
    {
        $q = $this->recordingQuery();
        Pagination::applySort($q, $this->request(['sort' => 'updated_at']), ['created_at', 'updated_at']);

        $this->assertSame([['updated_at', 'asc']], $q->orders);
    }

    public function testApplySortIgnoresNonWhitelistedColumn(): void
    {
        // 防注入/防全表扫描:未在白名单的列直接忽略,不产生 order
        $q = $this->recordingQuery();
        Pagination::applySort($q, $this->request(['sort' => '-password_hash']), ['created_at']);

        $this->assertSame([], $q->orders);
    }

    public function testApplySortUsesDefaultWhenAbsent(): void
    {
        $q = $this->recordingQuery();
        Pagination::applySort($q, $this->request([]), ['created_at', 'updated_at'], '-created_at');

        $this->assertSame([['created_at', 'desc']], $q->orders);
    }

    public function testApplySortNoopWhenAbsentAndNoDefault(): void
    {
        $q = $this->recordingQuery();
        Pagination::applySort($q, $this->request([]), ['created_at']);

        $this->assertSame([], $q->orders);
    }

    /* ----------------------------- applyTimeRange ----------------------------- */

    public function testApplyTimeRangeAppliesBothBounds(): void
    {
        $q = $this->recordingQuery();
        Pagination::applyTimeRange($q, $this->request(['from' => '2026-01-01', 'to' => '2026-02-01']), 'created_at');

        // 两条 where:created_at >= 与 created_at <=
        $this->assertCount(2, $q->wheres);
        $this->assertSame(['created_at', '>=', date('Y-m-d H:i:s', strtotime('2026-01-01'))], $q->wheres[0]);
        $this->assertSame(['created_at', '<=', date('Y-m-d H:i:s', strtotime('2026-02-01'))], $q->wheres[1]);
    }

    public function testApplyTimeRangeIgnoresInvalidTime(): void
    {
        // 非法时间字符串不产生过滤(避免脏输入导致查询报错)
        $q = $this->recordingQuery();
        Pagination::applyTimeRange($q, $this->request(['from' => 'not-a-date']), 'created_at');

        $this->assertSame([], $q->wheres);
    }

    public function testApplyTimeRangeNoopWhenAbsent(): void
    {
        $q = $this->recordingQuery();
        Pagination::applyTimeRange($q, $this->request([]), 'created_at');

        $this->assertSame([], $q->wheres);
    }
}
