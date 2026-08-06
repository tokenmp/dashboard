import { useEffect, useMemo, useState } from 'react';
import { Copy, Check, Ticket } from 'lucide-react';
import { createDashboardRedeemCodeApi } from '@/api/dashboard';
import { getDashboardPlansApi } from '@/api/dashboard';
import { useMutation } from '@/hooks/useMutation';
import { useAsync } from '@/hooks/useAsync';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatNumber } from '@/utils/format';
import type { PlanItem } from '@/types/plan';
import type { CreateRedeemCodeResult } from '@/types/redeem';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const PLAN_TYPES: { key: 'coding' | 'token' | 'image'; label: string; field: 'coding_plan_id' | 'token_plan_id' | 'image_plan_id' }[] = [
  { key: 'coding', label: 'Coding 套餐', field: 'coding_plan_id' },
  { key: 'token', label: 'Token 套餐', field: 'token_plan_id' },
  { key: 'image', label: 'Image 套餐', field: 'image_plan_id' },
];

/** 新建兑换码弹窗：单页表单，成功后展示明文码（仅一次）。 */
function CreateRedeemCodeDialog({ open, onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [tokenAmount, setTokenAmount] = useState('0');
  const [maxRedemptions, setMaxRedemptions] = useState('1');
  const [overrideMode, setOverrideMode] = useState<'replace' | 'upgrade_only'>('replace');
  const [durationDays, setDurationDays] = useState('');
  const [planIds, setPlanIds] = useState<Record<string, string | null>>({ coding_plan_id: null, token_plan_id: null, image_plan_id: null });
  const [result, setResult] = useState<CreateRedeemCodeResult | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: plansData } = useAsync(() => getDashboardPlansApi({ size: 200, status: 'active' }), []);
  const plansByType = useMemo(() => {
    const map: Record<string, PlanItem[]> = { coding: [], token: [], image: [] };
    (plansData?.list ?? []).forEach((p) => { if (map[p.plan_type]) map[p.plan_type].push(p); });
    return map;
  }, [plansData]);

  const { loading, mutate } = useMutation();

  // 打开/关闭时重置表单
  useEffect(() => {
    if (open) {
      setName(''); setCode(''); setTokenAmount('0'); setMaxRedemptions('1'); setOverrideMode('replace');
      setDurationDays(''); setPlanIds({ coding_plan_id: null, token_plan_id: null, image_plan_id: null });
      setResult(null); setCopied(false);
    }
  }, [open]);

  const tokenAmt = parseInt(tokenAmount || '0', 10) || 0;
  const hasReward = tokenAmt > 0 || Object.values(planIds).some((v) => v !== null);

  const handleSubmit = () => {
    if (name.trim() === '') return;
    mutate(() => createDashboardRedeemCodeApi({
      name: name.trim(),
      code: code.trim() === '' ? undefined : code.trim(),
      token_amount: tokenAmt,
      max_redemptions: parseInt(maxRedemptions || '1', 10) || 1,
      override_mode: overrideMode,
      duration_days: durationDays.trim() === '' ? null : parseInt(durationDays, 10) || null,
      coding_plan_id: planIds.coding_plan_id,
      token_plan_id: planIds.token_plan_id,
      image_plan_id: planIds.image_plan_id,
    }), {
      successMsg: '兑换码已创建',
      onSuccess: (res) => { setResult(res); onCreated(); },
    }).catch(() => { /* 保持弹窗以便重试 */ });
  };

  const handleCopy = () => {
    if (!result) return;
    navigator.clipboard?.writeText(result.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !loading) onClose(); }}>
      <DialogContent className="max-w-xl" onInteractOutside={(e) => { if (!result) e.preventDefault(); }}>
        {result ? (
          // 创建成功：展示明文码（仅一次）
          <>
            <DialogHeader>
              <DialogTitle>兑换码已创建</DialogTitle>
              <DialogDescription>请立即复制并妥善保存，关闭后将不再显示完整码。</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/40 p-3">
                <Label className="text-xs text-muted-foreground">{result.name}</Label>
                <div className="mt-1 flex items-center gap-2">
                  <code className="flex-1 break-all rounded bg-background px-2 py-1.5 font-mono text-sm font-semibold tracking-wider">{result.code}</code>
                  <Button type="button" size="icon" variant="outline" onClick={handleCopy}>
                    {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 text-xs">
                {result.token_amount > 0 && <Badge variant="secondary">{formatNumber(result.token_amount)} Token</Badge>}
                {result.coding_plan_id && <Badge variant="secondary">Coding 套餐</Badge>}
                {result.token_plan_id && <Badge variant="secondary">Token 套餐</Badge>}
                {result.image_plan_id && <Badge variant="secondary">Image 套餐</Badge>}
                <Badge variant="outline">可兑换 {result.max_redemptions} 次</Badge>
                {result.duration_days && <Badge variant="outline">有效 {result.duration_days} 天</Badge>}
              </div>
              <div className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
                兑换码属于敏感凭据，请妥善保管，切勿泄露。
              </div>
            </div>
            <DialogFooter>
              <Button type="button" onClick={onClose}>完成</Button>
            </DialogFooter>
          </>
        ) : (
          // 创建表单（单页）
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Ticket className="h-5 w-5" />新建兑换码</DialogTitle>
              <DialogDescription>配置奖励，创建后可分发给用户兑换。</DialogDescription>
            </DialogHeader>
            <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
              {/* 基础信息 */}
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>名称 <span className="text-destructive">*</span></Label>
                  <Input placeholder="如：新年福利码" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
                </div>
                <div className="space-y-1.5">
                  <Label>兑换码</Label>
                  <Input className="font-mono" placeholder="留空则自动生成" value={code} onChange={(e) => setCode(e.target.value)} maxLength={60} />
                  <p className="text-xs text-muted-foreground">自定义固定码（字母/数字/连字符/下划线，4-60 字符）；留空由系统随机生成。</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Token 充值量</Label>
                    <Input type="number" min={0} value={tokenAmount} onChange={(e) => setTokenAmount(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>可兑换次数</Label>
                    <Input type="number" min={1} value={maxRedemptions} onChange={(e) => setMaxRedemptions(e.target.value)} />
                  </div>
                </div>
              </div>

              {/* 套餐奖励 */}
              <div className="space-y-3 border-t pt-4">
                <div className="rounded-lg border p-3">
                  <Label className="text-xs text-muted-foreground">套餐奖励（可选，可多选）</Label>
                  <div className="mt-2 space-y-2">
                    {PLAN_TYPES.map((t) => (
                      <div key={t.key} className="grid grid-cols-[80px_1fr] items-center gap-2">
                        <span className="text-sm">{t.label}</span>
                        <Select
                          value={planIds[t.field] ?? 'none'}
                          onValueChange={(v) => setPlanIds((prev) => ({ ...prev, [t.field]: v === 'none' ? null : v }))}
                        >
                          <SelectTrigger><SelectValue placeholder="不发放" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">不发放</SelectItem>
                            {plansByType[t.key].map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>套餐覆盖模式</Label>
                    <Select value={overrideMode} onValueChange={(v) => setOverrideMode(v as 'replace' | 'upgrade_only')}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="replace">替换现有</SelectItem>
                        <SelectItem value="upgrade_only">仅新增</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>套餐有效天数</Label>
                    <Input type="number" min={1} placeholder="沿用套餐默认" value={durationDays} onChange={(e) => setDurationDays(e.target.value)} />
                  </div>
                </div>
                {!hasReward && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
                    至少需要配置一种奖励（Token 充值或套餐奖励）。
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={loading}>取消</Button>
              <Button onClick={handleSubmit} disabled={loading || name.trim() === '' || !hasReward}>
                {loading ? '创建中…' : '创建兑换码'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default CreateRedeemCodeDialog;
