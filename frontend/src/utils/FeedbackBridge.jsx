// 只需要副作用，不需要渲染逻辑，故只引入 useEffect
import { useEffect } from 'react';
// 引入 antd 的 App 组件（它内部提供带主题/语言的 message、notification、modal 实例）
import { App as AntdApp } from 'antd';
// 引入反馈注入函数，把实例交给全局 toast 使用
import { bindFeedback } from './feedback';

/**
 * 反馈桥接组件
 * 作用：把 App 里的 message 实例注入给非组件代码（如 axios 拦截器）使用，
 * 这样请求报错提示也能拿到 ConfigProvider 的主题与语言，而不会报静态方法警告
 * 说明：该组件只做副作用，不渲染任何节点
 */
export default function FeedbackBridge() {
  // 从 App 的 context 中取出受主题控制的 message 实例
  const { message } = AntdApp.useApp();
  // 实例变化（如主题重载）时重新注入，保证后续提示都用最新实例
  useEffect(() => {
    // 写入全局缓存，供 toast 使用
    bindFeedback(message);
  }, [message]);
  // 不渲染任何内容
  return null;
}
