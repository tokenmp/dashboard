import type { ReactNode } from 'react';
import { RefreshCw, Key, Bot } from 'lucide-react';
import { getPanelKeysApi, getPanelBotKeysApi } from '@/api/panel';
import { useAsync } from '@/hooks/useAsync';
import { EmptyState } from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { UserApiKeyItem, BotKeyItem } from '@/types/user';

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
        <Button variant="outline" size="sm" onClick={reload} disabled={loading}><RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新</Button>
      </div>

      {error && <Card className="border-destructive"><CardContent className="py-3 text-sm text-destructive">{error}</CardContent></Card>}

      {loading ? <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}</div>
        : isEmpty ? <EmptyState title="暂无密钥" description="你还没有生成任何 API Key 或 Bot Key" /> : (
          <Tabs defaultValue="api" className="w-full">
            <TabsList>
              <TabsTrigger value="api">API Key{apiKeys.length > 0 ? ` (${apiKeys.length})` : ''}</TabsTrigger>
              <TabsTrigger value="bot">Bot Key{botKeys.length > 0 ? ` (${botKeys.length})` : ''}</TabsTrigger>
            </TabsList>
            <TabsContent value="api" className="space-y-3 mt-4">
              {apiKeys.length > 0 ? (
                apiKeys.map((item) => <ApiKeyCard key={item.id} item={item} />)
              ) : (
                <EmptyState title="暂无 API Key" description="你还没有生成 API Key" />
              )}
            </TabsContent>
            <TabsContent value="bot" className="space-y-3 mt-4">
              {botKeys.length > 0 ? (
                botKeys.map((item) => <BotKeyCard key={item.id} item={item} />)
              ) : (
                <EmptyState title="暂无 Bot Key" description="你还没有生成 Bot Key" />
              )}
            </TabsContent>
          </Tabs>
        )}
    </div>
  );
}

/** API Key 卡片：只渲染脱敏后的 key_prefix/key_suffix，绝不展示完整密钥 */
function ApiKeyCard({ item }: { item: UserApiKeyItem }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Key className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{item.name}</span>
            <StatusBadge status={item.status} />
          </div>
          <span className="font-mono text-xs text-muted-foreground">{item.created_at?.slice(0, 10)}</span>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Meta label="密钥" value={<span className="font-mono text-sm">{item.key_prefix}…{item.key_suffix}</span>} />
          <Meta label="最近使用" value={item.last_used_at ? <span className="font-mono text-xs">{item.last_used_at}</span> : <span className="text-muted-foreground">未使用</span>} />
        </div>
      </CardContent>
    </Card>
  );
}

/** Bot Key 卡片：在 API Key 基础上额外展示 scope */
function BotKeyCard({ item }: { item: BotKeyItem }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{item.name}</span>
            <Badge variant="secondary" className="text-[10px]">{item.scope}</Badge>
            <StatusBadge status={item.status} />
          </div>
          <span className="font-mono text-xs text-muted-foreground">{item.created_at?.slice(0, 10)}</span>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Meta label="密钥" value={<span className="font-mono text-sm">{item.key_prefix}…{item.key_suffix}</span>} />
          <Meta label="最近使用" value={item.last_used_at ? <span className="font-mono text-xs">{item.last_used_at}</span> : <span className="text-muted-foreground">未使用</span>} />
        </div>
      </CardContent>
    </Card>
  );
}

function Meta({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1">{value}</div>
    </div>
  );
}

export default Keys;
