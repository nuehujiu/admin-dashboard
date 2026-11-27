// 引入 antd 的结果页与按钮，用于异常兜底界面
import { Button, Result } from 'antd';
// 引入类组件基类：错误边界只能通过类组件实现（需 getDerivedStateFromError）
import { Component } from 'react';

/**
 * 顶层错误边界
 * 作用：渲染期异常时兜底展示友好页面，避免整页白屏
 * 边界：只捕获渲染 / 生命周期异常，不捕获事件回调里抛出的错误与异步错误
 */
export default class ErrorBoundary extends Component {
  // 保存捕获到的错误对象；null 表示无异常
  state = { error: null };

  /**
   * 静态方法：错误抛出后由 React 调用，把 error 写入 state 以触发降级渲染
   * @returns {{ error: Error }}
   */
  static getDerivedStateFromError(error) {
    return { error };
  }

  /**
   * 组件异常时的回调：适合在这里接入错误上报
   */
  componentDidCatch(error, info) {
    // 生产环境可在此接入上报；本地保留完整栈便于定位
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  render() {
    // 读取当前错误
    const { error } = this.state;
    // 无异常：正常渲染子树
    if (!error) return this.props.children;

    // 有异常：展示结果页 + 两个恢复操作
    return (
      <Result
        status="error"
        title="页面出错了"
        subTitle="该页面渲染时发生异常，可刷新重试；若持续出现请联系管理员。"
        extra={[
          // 主操作：整页刷新（重新走一遍初始化流程）
          <Button key="reload" type="primary" onClick={() => window.location.reload()}>
            刷新页面
          </Button>,
          // 次操作：退回根路径（默认落地页会按权限再分流）
          <Button
            key="home"
            onClick={() => {
              // replace 避免在历史栈里留下出错页
              window.location.replace('/');
            }}
          >
            回到首页
          </Button>,
        ]}
      >
        {/* 仅开发环境展示堆栈，生产不暴露内部实现细节 */}
        {import.meta.env.DEV && (
          <pre style={{ maxHeight: 240, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
            {String(error?.stack || error)}
          </pre>
        )}
      </Result>
    );
  }
}
