"use client";

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}

export default function Sparkline({
  data,
  width = 120,
  height = 32,
  color = "#4F46E5",
  className = "",
}: SparklineProps) {
  if (!data || data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min === 0 ? 1 : max - min;

  const padding = 2;
  const usableHeight = height - padding * 2;
  const usableWidth = width;

  // Map data points to SVG coordinates
  const points = data.map((val, index) => ({
    x: (index / (data.length - 1)) * usableWidth,
    y: height - padding - ((val - min) / range) * usableHeight,
  }));

  // Generate smooth cubic bezier curve (Catmull-Rom style)
  const getBezierPath = (pts: { x: number; y: number }[]) => {
    return pts.reduce((acc, pt, idx, arr) => {
      if (idx === 0) return `M ${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
      const prev = arr[idx - 1];
      const cpsX = prev.x + (pt.x - prev.x) / 2;
      return `${acc} C ${cpsX.toFixed(1)},${prev.y.toFixed(1)} ${cpsX.toFixed(1)},${pt.y.toFixed(1)} ${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
    }, "");
  };

  const linePath = getBezierPath(points);
  const firstX = points[0].x;
  const lastX = points[points.length - 1].x;
  const areaPath = `${linePath} L ${lastX},${height} L ${firstX},${height} Z`;
  const gradientId = `sparkline-grad-${color.replace("#", "")}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={`overflow-visible block ${className}`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
