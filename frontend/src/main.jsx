// 引入严格模式：开发期额外检查（副作用重复执行、过时 API 提示等）
import { StrictMode } from 'react';
// 引入 React 18+ 的并发渲染入口
import { createRoot } from 'react-dom/client';
// 引入全局样式入口（CSS 变量、重置样式、antd 覆盖等都在这里收敛）
import './styles/index.scss';
// 引入应用根组件（内部完成主题、语言、路由的装配）
import AppRoot from './AppRoot.jsx';

// 页面标题跟环境走：优先读环境变量，未配置时用默认系统名
document.title = import.meta.env.VITE_APP_TITLE || '电商后台管理系统';

// 挂载到 #root 节点；StrictMode 仅在开发期生效，生产构建不受影响
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppRoot />
  </StrictMode>,
);
