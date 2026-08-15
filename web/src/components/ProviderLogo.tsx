import { findModelIcon } from './ModelIcon';

/** 供应商最小信息（列表/关联/选项各处字段子集） */
export interface ProviderLike {
  id?: string;
  name: string;
  display_name?: string | null;
  logo_url?: string | null;
  logo_svg?: string | null;
}

/**
 * 供应商 Logo 三级回退（与前台模型广场、后台供应商列表口径一致）：
 * 自定义外链 → 上传 SVG（公开端点）→ 按名称匹配内置品牌图标。
 */
export function providerLogoInfo(p: ProviderLike): { src: string | null; builtinBg?: string } {
  if (p.logo_url) return { src: p.logo_url };
  if (p.logo_svg && p.id) return { src: `/api/v1/site/providers/${p.id}/logo` };
  const m = findModelIcon(p.name, p.display_name ?? undefined);
  if (m) return { src: `/model-icons/${m.icon}.svg`, builtinBg: m.logoBackground };
  return { src: null };
}

/**
 * 供应商 Logo 小图标，四级展示：
 * 自定义外链 → 上传 SVG 端点 → 内置品牌图标 → 占位图标（灰底 + 名称首字母）。
 * 占位确保无任何 Logo 来源的供应商也有可见标识，
 * 避免叠排场景下「无图标位」被误读成相邻供应商的 Logo。
 */
export function ProviderLogo({
  provider,
  size = 16,
  className = '',
}: {
  provider: ProviderLike;
  size?: number;
  className?: string;
}) {
  const { src, builtinBg } = providerLogoInfo(provider);
  if (!src) {
    return (
      <span
        aria-hidden="true"
        className={`flex shrink-0 items-center justify-center rounded-sm bg-muted font-black uppercase leading-none text-muted-foreground ${className}`}
        style={{ width: size, height: size, fontSize: Math.max(8, size * 0.55) }}
      >
        {provider.display_name || provider.name.slice(0, 1)}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      className={`shrink-0 rounded-sm object-contain ${className}`}
      style={{ width: size, height: size, background: builtinBg }}
    />
  );
}
