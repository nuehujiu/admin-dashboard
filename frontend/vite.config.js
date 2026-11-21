import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
import { defineConfig } from 'vite';

/** 只把真正共享的基础库抽出来做长缓存；antd 组件大量被懒加载页面按需使用，
 *  整体塞进一个 vendor 块会让首屏把用不到的表单/表格一起下载，反而更大 */
function manualChunks(id) {
  if (!id.includes('node_modules')) return undefined;
  const p = id.replace(/\\/g, '/');
  if (p.includes('/echarts/') || p.includes('/zrender/')) return 'vendor-charts';
  if (
    p.includes('/react/') ||
    p.includes('/react-dom/') ||
    p.includes('/react-router') ||
    p.includes('/scheduler/')
  ) {
    return 'vendor-react';
  }
  return undefined;
}

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
      // 头像等上传文件由后端静态托管
      '/uploads': {
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
    // 首屏体积监控：产物带 manifest，便于核对每个入口真正加载了哪些 chunk
    manifest: true,
    // vendor 块按依赖拆分后单块明显变小，阈值收紧到 600
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
});
