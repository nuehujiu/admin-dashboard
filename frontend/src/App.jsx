// 引入路由提供器：把 router 实例接入 React 树
import { RouterProvider } from 'react-router-dom';
// 引入已创建好的路由器实例（内部含全部路由配置）
import router from './router/index.jsx';

/**
 * 应用主组件
 * 只有一件事：把路由树挂载到 React 中（主题、语言、错误边界都在 AppRoot 里配置）
 */
export default function App() {
  return <RouterProvider router={router} />;
}
