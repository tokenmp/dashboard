import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * 合并 Tailwind 类名，解决冲突（后者覆盖前者）
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
