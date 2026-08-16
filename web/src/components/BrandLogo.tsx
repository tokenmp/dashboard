import { cn } from '@/lib/utils';

/**
 * 品牌 logo（后端 public/tokenmp.svg，近黑版图形）。
 * panel/admin header、landing 头部与页脚共用；尺寸用 className 覆盖。
 */
export function BrandLogo({ className }: { className?: string }) {
  return <img src="/tokenmp.svg" alt="TokenMP" className={cn('h-6 w-6', className)} />;
}
