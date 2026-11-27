// 引入 antd 的配置容器与 App 容器（后者提供带主题的 message / notification / modal）
import { ConfigProvider, App as AntdApp } from 'antd';
// 引入中文语言包，使分页、日期、空态等内置文案为中文
import zhCN from 'antd/locale/zh_CN';
// 引入应用主组件（内部挂载路由）
import App from './App.jsx';
// 引入错误边界：兜住渲染期异常，避免整页白屏
import ErrorBoundary from './components/ErrorBoundary.jsx';
// 引入反馈桥接组件：把带主题的 message 实例交给 request 层
import FeedbackBridge from './utils/FeedbackBridge.jsx';
// 引入主题工厂：根据主色动态生成 antd token 与组件样式
import { createTheme } from './utils/theme.js';
// 引入用户仓库，读取系统设置里的主题色
import { useUserStore } from './store/useUserStore';

/**
 * 应用根节点
 * 职责：语言包 + 主题 + App 容器 + 反馈桥接 + 错误边界，最后渲染 App。
 * 单独成文件是为了让入口 main.jsx 保持纯粹，避免 Fast Refresh 因混合导出失效
 */
export default function AppRoot() {
  // 主题色跟随 store 里的系统设置（系统设置页修改后即时生效）
  const themeColor = useUserStore((s) => s.settings.themeColor);
  return (
    // 语言与时区/文案配置，同时按主色注入主题
    <ConfigProvider locale={zhCN} theme={createTheme(themeColor)}>
      {/* App 容器：提供 context 化的 message 等反馈能力 */}
      <AntdApp>
        {/* 把 message 实例注入全局 toast，让 request 拦截器的提示也跟随主题 */}
        <FeedbackBridge />
        {/* 错误边界包裹业务树，任意页面报错都只影响局部区域 */}
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </AntdApp>
    </ConfigProvider>
  );
}
