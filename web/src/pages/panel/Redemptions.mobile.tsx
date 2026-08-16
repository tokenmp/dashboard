import { useState } from 'react';
import { Gift, RefreshCw, Ticket } from 'lucide-react';
import { getPanelRedemptionsApi, redeemCodeApi, type RedeemResult } from '@/api/panel';
import { useAsync } from '@/hooks/useAsync';
import { useMutation } from '@/hooks/useMutation';
import { EmptyState } from '@/components/EmptyState';
import { MobileCard, MobilePageHeader } from '@/components/mobile';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime, formatNumber } from '@/utils/format';
import type { RedeemCodeRedemptionItem } from '@/types/redeem';
import { PlanBadge } from './Redemptions';

/**
 * 我的兑换·移动端（v3 ⑦ 定稿）：浅琥珀渐变兑换输入卡（mono 输入 + 深色「兑换」主按钮）
 * + 记录卡片流（兑换码 mono 主键 + 到账 Token 绿色 ok 徽标 + 套餐快照徽标行）。
 * 列表为全量无分页、无筛选，与桌面接口行为一致。
 */
export function RedemptionsMobile() {
  // 自取数据：我名下的全部兑换凭证（无分页）
  const { data, loading, error, reload } = useAsync(getPanelRedemptionsApi);
  const list = data ?? [];

  return (
    <div className="space-y-3">
      <MobilePageHeader
        title="兑换码"
        action={
          <Button variant="outline" size="sm" className="h-[30px] rounded-lg px-2.5" onClick={reload} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        }
      />

      <RedeemCardMobile onRedeemed={reload} />

      {error && (
        <Card className="border-destructive">
          <CardContent className="py-2.5 text-[13px] text-destructive">{error}</CardContent>
        </Card>
      )}

      {loading ? (
        <div className="space-y-[7px]">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[68px] w-full rounded-xl" />)}</div>
      ) : list.length === 0 ? (
        <EmptyState title="暂无兑换记录" description="你还没有兑换过任何兑换码" />
      ) : (
        <div className="space-y-[7px]">
          {list.map((item) => <RedemptionCard key={item.id} item={item} />)}
        </div>
      )}
    </div>
  );
}

/** 兑换输入卡·移动端：浅琥珀渐变底 + amber 描边，mono 输入框 + 深色「兑换」主按钮；
 *  兑换/加载/错误态逻辑与桌面 RedeemCard 一致（失败 toast + 保留输入便于重试） */
function RedeemCardMobile({ onRedeemed }: { onRedeemed: () => void }) {
  const [code, setCode] = useState('');
  const [result, setResult] = useState<RedeemResult | null>(null);
  const { loading, mutate } = useMutation();

  const handleRedeem = () => {
    const trimmed = code.trim();
    if (trimmed === '') return;
    mutate(() => redeemCodeApi(trimmed), {
      successMsg: '兑换成功',
      onSuccess: (res) => {
        setResult(res);
        setCode('');
        onRedeemed();
      },
    }).catch(() => {
      // 失败保持输入与结果区，便于重试
    });
  };

  return (
    <div className="rounded-xl border border-amber-200/70 bg-gradient-to-br from-amber-50 to-white p-3">
      <div className="text-[13px] font-semibold">输入兑换码</div>
      <div className="mt-2 flex gap-1.5">
        <div className="relative min-w-0 flex-1">
          <Ticket className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-[34px] rounded-lg pl-8 font-mono text-[13px] uppercase placeholder:font-mono placeholder:text-muted-foreground/70"
            placeholder="ABCD-EFGH-JKLM-NPQR"
            value={code}
            onChange={(e) => { setCode(e.target.value); setResult(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleRedeem(); }}
          />
        </div>
        <Button className="h-[34px] shrink-0 rounded-lg px-4 text-xs" onClick={handleRedeem} disabled={loading || code.trim() === ''}>
          <Gift className="mr-1 h-3.5 w-3.5" />
          {loading ? '兑换中…' : '兑换'}
        </Button>
      </div>
      {result && (
        <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-emerald-800">
          ✅ 兑换成功{result.redemption.token_amount > 0 ? `，已充入 ${formatNumber(result.redemption.token_amount)} Token` : ''}
          {(result.redemption.coding_plan_id || result.redemption.token_plan_id || result.redemption.image_plan_id) && '，套餐奖励已到账'}
        </div>
      )}
    </div>
  );
}

/** 兑换记录卡片：兑换码（mono）为主键，到账 Token 为 ok 徽标，兑换时间为副行，套餐快照为徽标行。 */
function RedemptionCard({ item }: { item: RedeemCodeRedemptionItem }) {
  return (
    <MobileCard
      title={<span className="font-mono">{item.code ?? '—'}</span>}
      badge={<TokenAmountBadge amount={item.token_amount} />}
      subtitle={<span className="font-mono">{formatDateTime(item.created_at)}</span>}
    >
      <div className="mt-2 flex flex-wrap gap-1">
        {item.codingPlan ? <PlanBadge type="coding" name={item.codingPlan.name} /> : item.coding_plan_id ? <PlanBadge type="coding" /> : null}
        {item.tokenPlan ? <PlanBadge type="token" name={item.tokenPlan.name} /> : item.token_plan_id ? <PlanBadge type="token" /> : null}
        {item.imagePlan ? <PlanBadge type="image" name={item.imagePlan.name} /> : item.image_plan_id ? <PlanBadge type="image" /> : null}
        {!item.coding_plan_id && !item.token_plan_id && !item.image_plan_id && (
          <span className="flex items-center gap-1 text-[10.5px] text-muted-foreground"><Gift className="h-3 w-3" />仅 Token 充值</span>
        )}
      </div>
    </MobileCard>
  );
}

/** 到账 Token 徽标（v3 .badge/.badge.ok 样式：胶囊 + 前置圆点）：
 *  到账 >0 为绿色 ok 徽标「+N tok」；0（兑换记录无状态字段，仅套餐奖励时 token_amount 为 0）弱化为中性徽标。 */
function TokenAmountBadge({ amount }: { amount: number }) {
  const cls = amount > 0 ? 'bg-green-600/10 text-green-600' : 'border bg-muted/60 text-muted-foreground';
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium ${cls}`}>
      <span className="h-[5px] w-[5px] rounded-full bg-current" />
      {amount > 0 ? '+' : ''}{formatNumber(amount)} tok
    </span>
  );
}
