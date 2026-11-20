import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.scss';
import AppRoot from './AppRoot.jsx';

// 页面标题跟环境走：开发环境下带「（开发）」，避免和线上混淆
document.title = import.meta.env.VITE_APP_TITLE || '电商后台管理系统';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppRoot />
  </StrictMode>,
);
