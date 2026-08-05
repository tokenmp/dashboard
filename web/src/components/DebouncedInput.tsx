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
  /**
   * 可选值校验：返回 false 则拒绝该值（不更新本地、不触发回调），并把输入框
   * 重置回上一个合法值。用于约束格式——如日期须为 YYYY-MM-DD（年份恰好 4 位），
   * 避免出现 6 位年份等异常输入。
   */
  acceptValue?: (value: string) => boolean;
}

/**
 * 防抖输入框：输入时本地 state 立即更新（不卡顿、不丢字），外部回调延迟触发；
 * 按下 Enter 会立即触发（清掉待执行的防抖）。
 *
 * 解决场景：搜索框直接 onChange → 父级 setFilters → 请求飞行期冻结受控 value。
 * 本组件用本地 state 隔离请求飞行期，输入永远流畅；只在用户停止输入 delay 毫秒后才发起请求。
 */
export const DebouncedInput = React.forwardRef<HTMLInputElement, DebouncedInputProps>(
  function DebouncedInput({ value, onDebouncedChange, delay = 300, acceptValue, onKeyDown, ...rest }, ref) {
    const [local, setLocal] = React.useState(value);
    const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const inputRef = React.useRef<HTMLInputElement | null>(null);

    // 同时维护内部 ref（用于非法值时重置 DOM）与外部 forwarded ref
    const setRefs = React.useCallback(
      (node: HTMLInputElement | null) => {
        inputRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      },
      [ref],
    );

    // 外部 value 变化（重置 / 程序化修改）时回灌本地
    React.useEffect(() => {
      setLocal(value);
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      // 校验不通过：拒绝该值，把输入框重置回上一个合法值，避免异常输入残留
      if (acceptValue && !acceptValue(v)) {
        if (inputRef.current) inputRef.current.value = local;
        return;
      }
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

    return <Input ref={setRefs} value={local} onChange={handleChange} onKeyDown={handleKeyDown} {...rest} />;
  },
);
