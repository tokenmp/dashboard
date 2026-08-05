import * as React from 'react';
import { Input } from '@/components/ui/input';

export interface DebouncedInputProps
  extends Omit<React.ComponentProps<'input'>, 'value' | 'onChange'> {
  /** 受控值（与外部状态同步，如重置/程序化修改时会回灌） */
  value: string;
  /** 防抖结束后触发，把最终值回写给父级 */
  onDebouncedChange: (value: string) => void;
  /** 防抖延时（毫秒），默认 300 */
  delay?: number;
}

/**
 * 防抖输入框：输入时本地 state 立即更新（不卡顿、不丢字），外部回调延迟触发；
 * 按下 Enter 会立即触发（清掉待执行的防抖）。
 *
 * 解决场景：搜索框直接 onChange → 父级 setFilters → 请求飞行期冻结受控 value。
 * 本组件用本地 state 隔离请求飞行期，输入永远流畅；只在用户停止输入 delay 毫秒后才发起请求。
 */
export const DebouncedInput = React.forwardRef<HTMLInputElement, DebouncedInputProps>(
  function DebouncedInput({ value, onDebouncedChange, delay = 300, onKeyDown, ...rest }, ref) {
    const [local, setLocal] = React.useState(value);
    const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    // 外部 value 变化（重置 / 程序化修改）时回灌本地
    React.useEffect(() => {
      setLocal(value);
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      setLocal(v); // 立即响应，不阻塞输入
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => onDebouncedChange(v), delay);
    };

    // Enter：立即触发（清掉待执行的防抖），保留外部传入的 onKeyDown
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      onKeyDown?.(e);
      if (e.key === 'Enter' && !e.defaultPrevented) {
        if (timer.current) {
          clearTimeout(timer.current);
          timer.current = undefined;
        }
        onDebouncedChange(local);
      }
    };

    // 卸载时清理定时器
    React.useEffect(
      () => () => {
        if (timer.current) clearTimeout(timer.current);
      },
      [],
    );

    return <Input ref={ref} value={local} onChange={handleChange} onKeyDown={handleKeyDown} {...rest} />;
  },
);
