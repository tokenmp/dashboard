import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface ModelIconMatch {
  pattern: RegExp;
  icon: string;
  label: string;
  brandColor: string;
  logoBackground: string;
  series: string;
}

export const MODEL_ICON_MATCHES: ModelIconMatch[] = [
  { pattern: /(jimeng|ji-meng|即梦|dreamina)/i, icon: 'jimeng', label: '即梦', brandColor: '#27B2F0', logoBackground: '#F5FAFF', series: 'jimeng' },
  { pattern: /(\bstepfun\b|\bstep[-_a-z0-9]*\b|阶跃星辰|\byuewen\b)/i, icon: 'stepfun', label: 'StepFun', brandColor: '#0160FF', logoBackground: '#F4F9FF', series: 'step' },
  { pattern: /\b(xiaomi|xiaomimimo|mi-mo|mi_mo|mimo)\b/i, icon: 'xiaomimimo-white', label: 'Xiaomi MIMO', brandColor: '#FF6900', logoBackground: '#FF6900', series: 'mimo' },
  { pattern: /\b(minimax|mini-max|abab)\b/i, icon: 'minimax', label: 'MiniMax', brandColor: '#FE603C', logoBackground: '#FFF4F1', series: 'minimax' },
  { pattern: /\b(kimi|moonshot)\b/i, icon: 'kimi', label: 'Kimi', brandColor: '#1783FF', logoBackground: '#111318', series: 'kimi' },
  { pattern: /\b(zhipu|glm|chatglm)\b/i, icon: 'zhipu', label: '智谱 AI', brandColor: '#3859FF', logoBackground: '#FFFFFF', series: 'glm' },
  { pattern: /\b(qingyan|清言)\b/i, icon: 'qingyan', label: '智谱清言', brandColor: '#1041F3', logoBackground: '#101216', series: 'glm' },
  { pattern: /\b(z\.ai|zai)\b/i, icon: 'zai', label: 'Z.ai', brandColor: '#111111', logoBackground: '#F6F7F9', series: 'glm' },
  { pattern: /\b(qwen|tongyi|aliyun)\b/i, icon: 'qwen', label: 'Qwen', brandColor: '#6336E7', logoBackground: '#F7F4FF', series: 'qwen' },
  { pattern: /\b(deepseek|deep-seek)\b/i, icon: 'deepseek', label: 'DeepSeek', brandColor: '#4D6BFE', logoBackground: '#FFFFFF', series: 'deepseek' },
  { pattern: /\b(claude|anthropic)\b/i, icon: 'claude', label: 'Claude', brandColor: '#D97757', logoBackground: '#F4EFE6', series: 'claude' },
  { pattern: /\b(gpt|openai|o[134](?:-|$)|chatgpt)\b/i, icon: 'openai', label: 'OpenAI', brandColor: '#111827', logoBackground: '#FFFFFF', series: 'gpt' },
  { pattern: /\b(gemini|google)\b/i, icon: 'gemini', label: 'Gemini', brandColor: '#3186FF', logoBackground: '#FFFFFF', series: 'gemini' },
  { pattern: /\b(doubao|seed|volc|bytedance)\b/i, icon: 'doubao', label: '豆包', brandColor: '#1E37FC', logoBackground: '#F6F7FF', series: 'doubao' },
  { pattern: /\b(grok|xai)\b/i, icon: 'xai', label: 'xAI', brandColor: '#111111', logoBackground: '#F6F7F9', series: 'grok' },
  { pattern: /\b(mistral|mixtral)\b/i, icon: 'mistral', label: 'Mistral', brandColor: '#FA500F', logoBackground: '#FFFFFF', series: 'mistral' },
  { pattern: /\b(longcat)\b/i, icon: 'zhipu', label: 'LongCat', brandColor: '#3859FF', logoBackground: '#FFFFFF', series: 'longcat' },
  { pattern: /\b(spark)\b/i, icon: 'zhipu', label: 'Spark', brandColor: '#3859FF', logoBackground: '#FFFFFF', series: 'spark' },
];

export interface ModelSeries {
  series: string;
  label: string;
  icon: string;
  logoBackground: string;
}

export const MODEL_SERIES: ModelSeries[] = MODEL_ICON_MATCHES
  .filter((match) => match.series)
  .map((match) => ({
    series: match.series,
    label: match.label,
    icon: match.icon,
    logoBackground: match.logoBackground,
  }))
  .filter((item, index, arr) => arr.findIndex((x) => x.series === item.series) === index);

export function ModelSeriesSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <Select value={value || 'all'} onValueChange={onChange}>
      <SelectTrigger className="w-[160px]"><SelectValue placeholder="全部系列" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">全部系列</SelectItem>
        {MODEL_SERIES.map((modelSeries) => (
          <SelectItem key={modelSeries.series} value={modelSeries.series}>
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-5 w-5 shrink-0 rounded"
                style={{ background: `${modelSeries.logoBackground} url("/model-icons/${modelSeries.icon}.svg") center / contain no-repeat` }}
              />
              <span>{modelSeries.label}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

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
  rounded = true,
}: {
  id: string;
  displayName?: string;
  size?: number;
  className?: string;
  rounded?: boolean;
}) {
  const roundCls = rounded ? 'rounded-lg' : '';
  const match = findModelIcon(id, displayName);
  if (!match) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center ${roundCls} bg-muted/50 text-xs font-black text-muted-foreground ${className}`}
        style={{ width: size, height: size }}
        aria-label="默认 AI 模型图标"
      >
        AI
      </div>
    );
  }
  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden ${roundCls} shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)] ${className}`}
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
