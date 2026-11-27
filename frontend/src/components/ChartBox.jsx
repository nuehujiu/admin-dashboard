// 引入副作用与引用钩子：用来挂载 DOM、保存图表实例
import { useEffect, useRef } from 'react';
// 引入 echarts 核心（只含渲染调度骨架，不含具体图表/组件）
import * as echarts from 'echarts/core';
// 引入需要的组件：直角坐标系网格、提示框
import { GridComponent, TooltipComponent } from 'echarts/components';
// 引入 Canvas 渲染器（比 SVG 更省内存，动画也顺滑）
import { CanvasRenderer } from 'echarts/renderers';
// 引入需要的图表类型：折线、饼、柱
import { LineChart, PieChart, BarChart } from 'echarts/charts';

// 按需注册：直接 import 整个 echarts 会把约 3MB 全打进包里，这里只注册用到的模块
echarts.use([LineChart, PieChart, GridComponent, TooltipComponent, CanvasRenderer, BarChart]);

/**
 * 图表容器组件（对 ECharts 的薄封装）
 * 负责：实例生命周期、容器尺寸自适应、配置项更新
 * @param {object} option - ECharts 配置项，变化时直接 setOption 刷新
 * @param {number} height - 容器高度（px），默认 300
 */
export default function ChartBox({ option, height = 300 }) {
  // DOM 引用：图表挂载的容器节点
  const elRef = useRef(null);
  // 实例引用：保存 echarts 实例，供 setOption / resize / dispose 使用
  const chartRef = useRef(null);

  // 只在挂载时初始化一次：创建实例 + 监听尺寸变化
  useEffect(() => {
    // 容器尚未渲染时直接跳过，避免 init 报错
    if (!elRef.current) return;
    // 在容器上创建图表实例
    const chart = echarts.init(elRef.current);
    // 记录实例，供另一个 effect 使用
    chartRef.current = chart;

    // 卡片宽度会随窗口/侧栏折叠变化，不监听就不会跟着重绘
    const ro = new ResizeObserver(() => chart.resize());
    // 开始观察容器尺寸
    ro.observe(elRef.current);

    // 卸载清理
    return () => {
      // 停止观察，防止已销毁节点仍触发回调
      ro.disconnect();
      // 释放实例；不 dispose 会泄漏，切页/刷新后会累积
      chart.dispose();
      // 清空引用
      chartRef.current = null;
    };
  }, []);

  // 配置项变化时刷新图表（第二个参数 true 表示不与旧配置合并，避免残留系列）
  useEffect(() => {
    if (chartRef.current && option) chartRef.current.setOption(option, true);
  }, [option]);

  // 容器占满父级宽度，高度由调用方决定
  return <div ref={elRef} style={{ width: '100%', height }} />;
}
