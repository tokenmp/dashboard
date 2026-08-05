import { RefreshCw } from 'lucide-react';
import { getPanelKeysApi, getPanelBotKeysApi } from '@/api/panel';
import { useAsync } from '@/hooks/useAsync';
import { EmptyState } from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

function Keys() {
  // 同时拉取我的 API Key 与 Bot Key（接口已脱敏，仅返回 key_prefix/key_suffix）
  const { data, loading, error, reload } = useAsync(async () => {
    const [apiKeys, botKeys] = await Promise.all([getPanelKeysApi(), getPanelBotKeysApi()]);
    return { apiKeys, botKeys };
  });

  const apiKeys = data?.apiKeys ?? [];
  const botKeys = data?.botKeys ?? [];
  const isEmpty = apiKeys.length === 0 && botKeys.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">我的密钥</h1>
          <p className="mt-1 text-sm text-muted-foreground">我名下的 API Key 与 Bot Key（仅显示脱敏片段）</p>
        </div>
        <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
          <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="py-3 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : isEmpty ? (
        <EmptyState title="暂无密钥" description="你还没有生成任何 API Key 或 Bot Key" />
      ) : (
        <Tabs defaultValue={apiKeys.length > 0 ? 'api' : 'bot'} className="w-full">
          <TabsList>
            <TabsTrigger value="api">API Key{apiKeys.length > 0 ? ` (${apiKeys.length})` : ''}</TabsTrigger>
            <TabsTrigger value="bot">Bot Key{botKeys.length > 0 ? ` (${botKeys.length})` : ''}</TabsTrigger>
          </TabsList>

          <TabsContent value="api" className="mt-4">
            {apiKeys.length > 0 ? (
              <KeyTable
                kind="api"
                rows={apiKeys.map((k) => ({
                  id: k.id,
                  name: k.name,
                  scope: null,
                  prefix: k.key_prefix,
                  suffix: k.key_suffix,
                  status: k.status,
                  lastUsed: k.last_used_at,
                  createdAt: k.created_at,
                }))}
              />
            ) : (
              <EmptyState title="暂无 API Key" description="你还没有生成 API Key" />
            )}
          </TabsContent>

          <TabsContent value="bot" className="mt-4">
            {botKeys.length > 0 ? (
              <KeyTable
                kind="bot"
                rows={botKeys.map((k) => ({
                  id: k.id,
                  name: k.name,
                  scope: k.scope,
                  prefix: k.key_prefix,
                  suffix: k.key_suffix,
                  status: k.status,
                  lastUsed: k.last_used_at,
                  createdAt: k.created_at,
                }))}
              />
            ) : (
              <EmptyState title="暂无 Bot Key" description="你还没有生成 Bot Key" />
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

/** 统一的密钥列表（表格，非卡片套卡片） */
type KeyRow = {
  id: string;
  name: string;
  scope: string | null;
  prefix: string;
  suffix: string;
  status: string;
  lastUsed: string | null;
  createdAt: string;
};

function KeyTable({ kind, rows }: { kind: 'api' | 'bot'; rows: KeyRow[] }) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[22%]">名称</TableHead>
            {kind === 'bot' && <TableHead className="w-[8%]">权限</TableHead>}
            <TableHead>密钥</TableHead>
            <TableHead className="w-[10%]">状态</TableHead>
            <TableHead className="w-[18%]">最近使用</TableHead>
            <TableHead className="w-[12%]">创建时间</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">{r.name || '—'}</TableCell>
              {kind === 'bot' && (
                <TableCell>
                  <Badge variant="secondary" className="text-[10px]">{r.scope ?? '—'}</Badge>
                </TableCell>
              )}
              <TableCell>
                <span className="font-mono text-xs">{r.prefix}…{r.suffix}</span>
              </TableCell>
              <TableCell><StatusBadge status={r.status} /></TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {r.lastUsed ?? '未使用'}
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {r.createdAt?.slice(0, 10) ?? '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default Keys;
