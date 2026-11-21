import { Button, Result } from 'antd';
import { Component } from 'react';

/**
 * 顶层错误边界：渲染期异常时兜底，避免整页白屏
 * 只捕获渲染/生命周期异常，不捕获事件回调与异步错误
 */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // 生产环境可在此接入上报；本地保留完整栈便于定位
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <Result
        status="error"
        title="页面出错了"
        subTitle="该页面渲染时发生异常，可刷新重试；若持续出现请联系管理员。"
        extra={[
          <Button key="reload" type="primary" onClick={() => window.location.reload()}>
            刷新页面
          </Button>,
          <Button
            key="home"
            onClick={() => {
              window.location.replace('/');
            }}
          >
            回到首页
          </Button>,
        ]}
      >
        {import.meta.env.DEV && (
          <pre style={{ maxHeight: 240, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
            {String(error?.stack || error)}
          </pre>
        )}
      </Result>
    );
  }
}
