import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { LineChart, PieChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

// 按需注册。直接 import 整个 echarts 会把 3MB 全打进包里。
echarts.use([LineChart, PieChart, GridComponent, TooltipComponent, CanvasRenderer]);

export default function ChartBox({ option, height = 300 }) {
  const elRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!elRef.current) return;
    const chart = echarts.init(elRef.current);
    chartRef.current = chart;

    // 卡片宽度会随窗口变，不监听就不会跟着重绘
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(elRef.current);

    return () => {
      ro.disconnect();
      chart.dispose();          // 不 dispose 会泄漏，切页/刷新后会累积
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (chartRef.current && option) chartRef.current.setOption(option, true);
  }, [option]);

  return <div ref={elRef} style={{ width: '100%', height }} />;
}
