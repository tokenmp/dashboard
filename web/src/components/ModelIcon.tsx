export interface ModelIconMatch {
  pattern: RegExp;
  icon: string;
  label: string;
  brandColor: string;
  logoBackground: string;
}

export const MODEL_ICON_MATCHES: ModelIconMatch[] = [
  { pattern: /(jimeng|ji-meng|即梦|dreamina)/i, icon: 'jimeng', label: '即梦', brandColor: '#27B2F0', logoBackground: '#F5FAFF' },
  { pattern: /(\bstepfun\b|\bstep[-_a-z0-9]*\b|阶跃星辰|\byuewen\b)/i, icon: 'stepfun', label: 'StepFun', brandColor: '#0160FF', logoBackground: '#F4F9FF' },
  { pattern: /\b(xiaomi|xiaomimimo|mi-mo|mi_mo|mimo)\b/i, icon: 'xiaomimimo-white', label: 'Xiaomi MIMO', brandColor: '#FF6900', logoBackground: '#FF6900' },
  { pattern: /\b(minimax|mini-max|abab)\b/i, icon: 'minimax', label: 'MiniMax', brandColor: '#FE603C', logoBackground: '#FFF4F1' },
  { pattern: /\b(kimi|moonshot)\b/i, icon: 'kimi', label: 'Kimi', brandColor: '#1783FF', logoBackground: '#111318' },
  { pattern: /\b(qingyan|清言)\b/i, icon: 'qingyan', label: '智谱清言', brandColor: '#1041F3', logoBackground: '#101216' },
  { pattern: /\b(z\.ai|zai)\b/i, icon: 'zai', label: 'Z.ai', brandColor: '#111111', logoBackground: '#F6F7F9' },
  { pattern: /\b(zhipu|glm|chatglm)\b/i, icon: 'zhipu', label: '智谱 AI', brandColor: '#3859FF', logoBackground: '#FFFFFF' },
  { pattern: /\b(qwen|tongyi|aliyun)\b/i, icon: 'qwen', label: 'Qwen', brandColor: '#6336E7', logoBackground: '#F7F4FF' },
  { pattern: /\b(deepseek|deep-seek)\b/i, icon: 'deepseek', label: 'DeepSeek', brandColor: '#4D6BFE', logoBackground: '#FFFFFF' },
  { pattern: /\b(claude|anthropic)\b/i, icon: 'claude', label: 'Claude', brandColor: '#D97757', logoBackground: '#F4EFE6' },
  { pattern: /\b(gpt|openai|o[134](?:-|$)|chatgpt)\b/i, icon: 'openai', label: 'OpenAI', brandColor: '#111827', logoBackground: '#FFFFFF' },
  { pattern: /\b(gemini|google)\b/i, icon: 'gemini', label: 'Gemini', brandColor: '#3186FF', logoBackground: '#FFFFFF' },
  { pattern: /\b(doubao|seed|volc|bytedance)\b/i, icon: 'doubao', label: '豆包', brandColor: '#1E37FC', logoBackground: '#F6F7FF' },
  { pattern: /\b(grok|xai)\b/i, icon: 'xai', label: 'xAI', brandColor: '#111111', logoBackground: '#F6F7F9' },
  { pattern: /\b(mistral|mixtral)\b/i, icon: 'mistral', label: 'Mistral', brandColor: '#FA500F', logoBackground: '#FFFFFF' },
  { pattern: /\b(longcat)\b/i, icon: 'zhipu', label: 'LongCat', brandColor: '#3859FF', logoBackground: '#FFFFFF' },
  { pattern: /\b(spark)\b/i, icon: 'zhipu', label: 'Spark', brandColor: '#3859FF', logoBackground: '#FFFFFF' },
];

export function findModelIcon(id: string, displayName?: string): ModelIconMatch | undefined {
  const haystack = `${displayName || ''} ${id || ''}`;
  return MODEL_ICON_MATCHES.find((m) => m.pattern.test(haystack));
}

/**
 * 模型品牌图标：按模型名正则匹配品牌 svg。
 * svg 用 background-image 渲染（svg 自身 width/height=1em，img naturalWidth=0 不显示，
 * background-size: contain 不依赖固有像素尺寸，最可靠）。
 */
export function ModelIcon({
  id,
  displayName,
  size = 40,
  className = '',
}: {
  id: string;
  displayName?: string;
  size?: number;
  className?: string;
}) {
  const match = findModelIcon(id, displayName);
  if (!match) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded-lg bg-muted/50 text-xs font-black text-muted-foreground ${className}`}
        style={{ width: size, height: size }}
        aria-label="默认 AI 模型图标"
      >
        AI
      </div>
    );
  }
  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-lg p-1.5 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)] ${className}`}
      style={{
        width: size,
        height: size,
        background: `${match.logoBackground} url("/model-icons/${match.icon}.svg") center / contain no-repeat`,
      }}
      title={match.label}
      aria-label={`${match.label} 图标`}
    />
  );
}

export default ModelIcon;
