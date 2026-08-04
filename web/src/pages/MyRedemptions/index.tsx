import { RefreshCw, Ticket } from 'lucide-react';
import { getMyRedemptionsApi } from '@/api/redeem';
import { useAsync } from '@/hooks/useAsync';
import { EmptyState } from '@/components/EmptyState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCompact } from '@/utils/format';

function MyRedemptions() {
  const { data, loading, error, reload } = useAsync(getMyRedemptionsApi);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">我的兑换记录</h1>
          <p className="mt-1 text-sm text-muted-foreground">我成功兑换的凭证与奖励快照</p>
        </div>
        <Button variant="outline" size="sm" onClick={reload} disabled={loading}><RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新</Button>
      </div>

      {error && <Card className="border-destructive"><CardContent className="py-3 text-sm text-destructive">{error}</CardContent></Card>}

      {loading ? <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}</div>
        : data && data.length > 0 ? (
          <div className="space-y-3">
            {data.map((r) => (
              <Card key={r.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <Ticket className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">兑换凭证</span>
                      <span className="font-mono text-xs text-muted-foreground">{r.created_at}</span>
                    </div>
                    {r.token_amount > 0 && (
                      <Badge variant="default" className="text-[10px]">+{formatCompact(r.token_amount)} Token</Badge>
                    )}
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <PlanSnapshot label="Coding" plan={r.coding_plan_id} name={r.codingPlan?.name} />
                    <PlanSnapshot label="Token" plan={r.token_plan_id} name={r.tokenPlan?.name} />
                    <PlanSnapshot label="Image" plan={r.image_plan_id} name={r.imagePlan?.name} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : <EmptyState title="暂无兑换记录" description="你还没有兑换过任何兑换码" />}
    </div>
  );
}

function PlanSnapshot({ label, plan, name }: { label: string; plan: string | null; name?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label} 套餐</div>
      {plan ? (
        <div className="mt-1 flex items-center gap-1.5">
          <Badge variant="secondary" className="text-[10px]">已发放</Badge>
          <span className="text-sm font-medium">{name ?? '—'}</span>
        </div>
      ) : <div className="mt-1 text-sm text-muted-foreground">无</div>}
    </div>
  );
}

export default MyRedemptions;
