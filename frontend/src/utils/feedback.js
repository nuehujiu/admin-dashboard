/**
 * 全局反馈（message）访问层
 *
 * 为什么需要这一层：
 * antd 6 的静态方法（import { message } from 'antd' 然后 message.error(...)）
 * 拿不到 ConfigProvider / App 的 context，所以控制台会报
 * "Static function can not consume context like dynamic theme"，
 * 并且弹出的提示不会跟随主题与语言。
 *
 * 做法：由 main.jsx 里的 FeedbackBridge 在 App 挂载后把 useApp() 的 message
 * 注入进来，request 拦截器这类非组件代码通过 toast 使用它；
 * 万一还没注入（App 尚未挂载），退回静态方法保证功能不丢。
 */
// 引入 antd 静态 message，作为 context 尚未注入时的兜底实现
import { message as staticMessage } from 'antd';

// 模块级缓存：保存 App 内 useApp() 提供的带主题/语言的 message 实例
let instance = null;

/** 注入 App 的 message 实例，由 main.jsx 的 FeedbackBridge 在挂载后调用 */
export const bindFeedback = (m) => {
  // 挂载后一路覆盖，卸载时可再传回 null 以恢复兜底行为
  instance = m;
};

// 选择当前可用的 message 实现：优先 context 实例，缺失时回退静态方法
const pick = () => instance || staticMessage;

/** 组件外统一用这个发提示（request 拦截器、工具函数等非组件代码） */
export const toast = {
  // 成功提示
  success: (...args) => pick().success(...args),
  // 错误提示
  error: (...args) => pick().error(...args),
  // 普通信息提示
  info: (...args) => pick().info(...args),
  // 警告提示
  warning: (...args) => pick().warning(...args),
};
