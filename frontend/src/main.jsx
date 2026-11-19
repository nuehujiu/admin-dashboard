import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.scss';
import App from './App.jsx';
import { Theme } from './utils/theme.js';
import FeedbackBridge from './utils/FeedbackBridge.jsx';
import zhCN from 'antd/locale/zh_CN';
import { ConfigProvider, App as AntdApp } from 'antd';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ConfigProvider locale={zhCN} theme={Theme}>
      <AntdApp>
        {/* 注入 message 实例，让 request 层也能跟随主题 */}
        <FeedbackBridge />
        <App />
      </AntdApp>
    </ConfigProvider>
  </StrictMode>,
);
