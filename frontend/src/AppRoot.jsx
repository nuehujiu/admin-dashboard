import { ConfigProvider, App as AntdApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from './App.jsx';
import FeedbackBridge from './utils/FeedbackBridge.jsx';
import { createTheme } from './utils/theme.js';
import { useUserStore } from './store/useUserStore';

/**
 * 应用根节点：主题色跟随 store 里的系统设置
 * 单独成文件，避免入口文件既做渲染又导出组件（Fast Refresh 会失效）
 */
export default function AppRoot() {
  const themeColor = useUserStore((s) => s.settings.themeColor);
  return (
    <ConfigProvider locale={zhCN} theme={createTheme(themeColor)}>
      <AntdApp>
        {/* 注入 message 实例，让 request 层也能跟随主题 */}
        <FeedbackBridge />
        <App />
      </AntdApp>
    </ConfigProvider>
  );
}
