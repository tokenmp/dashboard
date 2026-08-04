import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TrendPoint } from '@/types/dashboard';
import { formatCompact } from '@/utils/format';

interface TrendChartProps {
  data: TrendPoint[];
  /** 取值字段：requests / tokens / successes */
  dataKey: 'requests' | 'tokens' | 'successes';
  /** 曲线颜色（HSL 数值或 hex） */
  color?: string;
  height?: number;
}

/**
 * 趋势面积图（近 30 天单指标）
 */
export function TrendChart({
  data,
  dataKey,
  color = 'hsl(222.2 47.4% 11.2%)',
  height = 220,
}: TrendChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.25} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
        <XAxis
          dataKey="day"
          tickFormatter={(v: string) => v.slice(5)}
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          minTickGap={24}
        />
        <YAxis
          tickFormatter={(v: number) => formatCompact(v, 1)}
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={48}
        />
        <Tooltip
          formatter={(value) => formatCompact(Number(value))}
          labelFormatter={(label) => String(label)}
          contentStyle={{
            borderRadius: 8,
            border: '1px solid hsl(214.3 31.8% 91.4%)',
            fontSize: 12,
          }}
        />
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={2}
          fill={`url(#grad-${dataKey})`}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
