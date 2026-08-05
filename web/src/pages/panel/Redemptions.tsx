import { RefreshCw, Gift } from 'lucide-react';
import { getPanelRedemptionsApi } from '@/api/panel';
import { useAsync } from '@/hooks/useAsync';
import { EmptyState } from '@/components/EmptyState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatNumber } from '@/utils/format';
import type { RedeemCodeRedemptionItem } from '@/types/redeem';

function Redemptions() {
  // 自取数据：我名下的全部兑换凭证（无分页）
  const { data, loading, error, reload } = useAsync(getPanelRedemptionsApi);
  const list = data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">我的兑换</h1>
          <p className="mt-1 text-sm text-muted-foreground">我使用兑换码产生的凭证记录</p>
        </div>
        <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
          <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新
        </Button>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="py-3 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : list.length === 0 ? (
        <EmptyState title="暂无兑换记录" description="你还没有兑换过任何兑换码" />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px] text-right">Token 快照</TableHead>
                  <TableHead>套餐快照</TableHead>
                  <TableHead className="w-[160px]">兑换时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((r) => <RedemptionRow key={r.id} item={r} />)}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function RedemptionRow({ item }: { item: RedeemCodeRedemptionItem }) {
  return (
    <TableRow>
      <TableCell className="text-right tabular-nums">{formatNumber(item.token_amount)}</TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          {item.codingPlan ? (
            <PlanBadge type="coding" name={item.codingPlan.name} />
          ) : item.coding_plan_id ? (
            <PlanBadge type="coding" />
          ) : null}
          {item.tokenPlan ? (
            <PlanBadge type="token" name={item.tokenPlan.name} />
          ) : item.token_plan_id ? (
            <PlanBadge type="token" />
          ) : null}
          {item.imagePlan ? (
            <PlanBadge type="image" name={item.imagePlan.name} />
          ) : item.image_plan_id ? (
            <PlanBadge type="image" />
          ) : null}
          {!item.coding_plan_id && !item.token_plan_id && !item.image_plan_id && (
            <span className="flex items-center gap-1 text-sm text-muted-foreground"><Gift className="h-3 w-3" />仅 Token 充值</span>
          )}
        </div>
      </TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">{item.created_at}</TableCell>
    </TableRow>
  );
}

function PlanBadge({ type, name }: { type: string; name?: string }) {
  return <Badge variant="outline" className="text-[10px]">{type}{name ? `·${name}` : ''}</Badge>;
}

export default Redemptions;
