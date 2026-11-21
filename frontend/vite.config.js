import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
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
  },
);
