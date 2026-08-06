interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  failColor?: string;
}

export function Sparkline({
  data,
  width = 120,
  height = 28,
  color = '#10b981',
}: SparklineProps) {
  if (data.length === 0 || Math.max(...data) === 0) {
    return (
      <div
        style={{ width, height }}
        className="flex items-center justify-center text-[9px] text-muted-foreground/50"
      >
        无调用
      </div>
    );
  }

  const max = Math.max(...data, 1);
  const step = data.length > 1 ? width / (data.length - 1) : width;
  const points = data.map((value, index) => {
    const x = index * step;
    const y = height - (value / max) * (height - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const path = `M ${points.join(' L ')}`;
  const areaPath = `${path} L ${width},${height} L 0,${height} Z`;

  return (
    <svg width={width} height={height} className="overflow-visible" aria-hidden="true">
      <path d={areaPath} fill={color} fillOpacity={0.12} />
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={1.2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {data.map((value, index) => value > 0 && (
        <circle
          key={index}
          cx={(index * step).toFixed(1)}
          cy={(height - (value / max) * (height - 2) - 1).toFixed(1)}
          r={1}
          fill={color}
        />
      ))}
    </svg>
  );
}

export default Sparkline;
