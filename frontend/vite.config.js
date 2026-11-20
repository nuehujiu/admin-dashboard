import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
import { defineConfig, loadEnv } from 'vite';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // 第三个参数传 '' 表示把不带 VITE_ 前缀的变量也读进来（proxy target 属于 node 侧配置）
  const env = loadEnv(mode, process.cwd(), '');
  // VITE_MOCK=0 时转发到真后端，否则（默认）转发到 mock 服务
  const apiTarget = env.VITE_MOCK === '0' ? 'http://localhost:3003' : 'http://localhost:3001';

  return {
    plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
    // 首次冷启动就预构建这些大依赖，避免启动后又发现新依赖、二次 re-bundle
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-router-dom',
        'antd',
        '@ant-design/icons',
        'echarts/core',
        'echarts/charts',
        'echarts/components',
        'echarts/renderers',
        'axios',
        'zustand',
      ],
    },
    build: {
      // 单个大块（echarts / antd 基础）本身就在 500~600 kB，放宽阈值避免噪音告警
      chunkSizeWarningLimit: 900,
    },
  };
});
