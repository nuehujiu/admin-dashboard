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
import { message as staticMessage } from 'antd';

let instance = null;

/** 注入 App 的 message 实例，由 main.jsx 调用 */
export const bindFeedback = (m) => {
  instance = m;
};

const pick = () => instance || staticMessage;

/** 组件外统一用这个发提示 */
export const toast = {
  success: (...args) => pick().success(...args),
  error: (...args) => pick().error(...args),
  info: (...args) => pick().info(...args),
  warning: (...args) => pick().warning(...args),
};
