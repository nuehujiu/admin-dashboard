import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { LineChart, PieChart, BarChart } from 'echarts/charts';


// 按需注册。直接 import 整个 echarts 会把 3MB 全打进包里。
echarts.use([LineChart, PieChart, GridComponent, TooltipComponent, CanvasRenderer,BarChart]);

/**
 * ChartBox组件 - 基于ECharts的图表容器组件
 * @param {Object} option - ECharts配置项对象
 * @param {number} [height=300] - 图表容器高度，默认300px
 */
export default function ChartBox({ option, height = 300 }) {

  // 使用useRef创建两个引用，分别用于DOM元素和图表实例
  const elRef = useRef(null);  // DOM元素引用，用于挂载图表容器
  const chartRef = useRef(null);  // 图表实例引用，用于操作图表

  // 使用useEffect初始化图表，设置ResizeObserver监听容器大小变化
  useEffect(() => {
    if (!elRef.current) return;  // 确保DOM元素存在
    const chart = echarts.init(elRef.current);  // 初始化ECharts实例
    chartRef.current = chart;  // 保存图表实例引用

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
