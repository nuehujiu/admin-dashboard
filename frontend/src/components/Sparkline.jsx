/**
 * 迷你趋势线（Sparkline）
 * 纯 SVG 手绘，不引第三方图表库，适合指标卡里的小尺寸走势图
 * @param {number[]} data - 数值序列
 * @param {string} color - 线条颜色，默认暖橙
 * @param {number} width - 画布宽度（px）
 * @param {number} height - 画布高度（px）
 */
export default function Sparkline({ data = [], color = '#F5611D', width = 92, height = 34 }) {
  // 无数据时不渲染，避免出现空白 SVG 占位
  if (!data.length) return null;

  // 取最大/最小值，用于把数值缩放到画布高度
  const max = Math.max(...data);
  const min = Math.min(...data);
  // 极差；全部数值相等时分母为 0，兜底 1 防止除零得到 NaN
  const span = max - min || 1;
  // 相邻点的水平间距；只有一个点时 step 无意义，置 0
  const step = data.length > 1 ? width / (data.length - 1) : 0;
  // 上下各留 3px 内边距，避免线贴边被裁
  const pad = 3;

  // 把每个数据点换算成 SVG 坐标字符串
  const points = data
    .map((v, i) => {
      // x：按索引线性分布
      const x = i * step;
      // y：数值归一化后映射到可用高度区间，并做上下翻转（SVG 原点在左上）
      const y = height - pad - ((v - min) / span) * (height - pad * 2);
      // 保留一位小数，减小路径字符串长度
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    // viewBox 与宽高一致，缩放时比例不变；aria-hidden 表示纯装饰元素
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {/* 用折线连接各点：圆角端点 + 圆角拐角，视觉更柔和 */}
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
