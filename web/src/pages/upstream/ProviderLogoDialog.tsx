import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateDashboardProviderApi } from '@/api/dashboard';
import type { ProviderItem } from '@/types/upstream';
import { findModelIcon } from '@/components/ModelIcon';

/**
 * 供应商品牌 Logo 编辑弹窗：外链 URL 或上传 SVG（二选一，外链优先）。
 * 展示位置：landing 模型广场的供应商筛选 chips。
 */
export function ProviderLogoDialog({
  provider,
  onClose,
  onSaved,
}: {
  provider: ProviderItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [logoUrl, setLogoUrl] = useState('');
  const [logoSvg, setLogoSvg] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!provider) return;
    setLogoUrl(provider.logo_url ?? '');
    setLogoSvg(provider.logo_svg ?? '');
    setError('');
  }, [provider]);

  const pickFile = (file: File | undefined) => {
    setError('');
    if (!file) return;
    if (file.size > 64 * 1024) {
      setError('SVG 文件不能超过 64KB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '').trim();
      const head = text.slice(0, 256).toLowerCase();
      if (!head.startsWith('<svg') && !head.startsWith('<?xml')) {
        setError('请选择 SVG 文件');
        return;
      }
      setLogoSvg(text);
    };
    reader.readAsText(file);
  };

  // 预览：外链直接用；SVG 源码转 data URL；都未配置时回退内置品牌图标
  const builtin = provider ? findModelIcon(provider.name, provider.display_name ?? undefined) : undefined;
  const previewSrc = logoUrl.trim() !== ''
    ? logoUrl.trim()
    : logoSvg !== ''
      ? `data:image/svg+xml;utf8,${encodeURIComponent(logoSvg)}`
      : builtin
        ? `/model-icons/${builtin.icon}.svg`
        : null;

  const save = async () => {
    if (!provider) return;
    setSaving(true);
    setError('');
    try {
      await updateDashboardProviderApi(provider.id, {
        logo_url: logoUrl.trim() === '' ? null : logoUrl.trim(),
        logo_svg: logoUrl.trim() === '' ? (logoSvg === '' ? null : logoSvg) : null,
      });
      onSaved();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={provider !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>品牌 Logo · {provider?.display_name || provider?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* 预览 */}
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border bg-muted/50">
              {previewSrc ? (
                <img src={previewSrc} alt="logo 预览" className="h-full w-full object-contain" />
              ) : (
                <span className="text-xs text-muted-foreground">无</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {logoUrl.trim() === '' && logoSvg === ''
                ? '当前为内置品牌图标（按名称自动匹配）；配置后前台展示自定义 Logo'
                : '展示于前台模型广场的供应商筛选'}
            </p>
          </div>

          <div className="space-y-1">
            <Label>Logo 链接（优先）</Label>
            <Input
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://example.com/logo.svg"
            />
          </div>

          <div className="space-y-1">
            <Label>或上传 SVG 文件</Label>
            <input
              ref={fileRef}
              type="file"
              accept=".svg,image/svg+xml"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                选择文件
              </Button>
              {logoSvg !== '' && (
                <>
                  <span className="text-xs text-muted-foreground">已载入 {(logoSvg.length / 1024).toFixed(1)}KB</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setLogoSvg('');
                      if (fileRef.current) fileRef.current.value = '';
                    }}
                  >
                    清除
                  </Button>
                </>
              )}
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={save} disabled={saving}>{saving ? '保存中…' : '保存'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
