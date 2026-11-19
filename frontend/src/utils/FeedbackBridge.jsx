import { useEffect } from 'react';
import { App as AntdApp } from 'antd';
import { bindFeedback } from './feedback';

/**
 * 把 App 里的 message 实例注入给非组件代码（如 axios 拦截器）使用，
 * 这样请求报错提示也能拿到主题与语言
 */
export default function FeedbackBridge() {
  const { message } = AntdApp.useApp();
  useEffect(() => {
    bindFeedback(message);
  }, [message]);
  return null;
}
