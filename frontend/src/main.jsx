import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { Theme } from './utils/theme.js';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ConfigProvider locale={zhCN} theme={Theme}>
      <App />
    </ConfigProvider>
  </StrictMode>,
);
