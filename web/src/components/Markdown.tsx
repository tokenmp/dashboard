import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { cn } from '@/lib/utils';

/**
 * Markdown 渲染器：支持 GFM（表格/删除线/任务列表）+ 单换行渲染为 <br>（多行友好），
 * 配 @tailwindcss/typography 的 prose 样式。公告/版本日志等正文共用。
 */
export function Markdown({ children, className }: { children: string; className?: string }) {
  if (!children) return null;
  return (
    <div className={cn('prose prose-sm max-w-none', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{children}</ReactMarkdown>
    </div>
  );
}
