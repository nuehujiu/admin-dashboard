// 引入 axios：创建带统一拦截器的 HTTP 客户端实例
import axios from 'axios';
// 引入全局轻提示，用于把后端返回的错误文案展示给用户
import { toast } from '../utils/feedback';
// 引入用户状态仓库（zustand），拦截器里需要同步读取 token / 触发登出
import { useUserStore } from '../store/useUserStore';

// 创建一个独立的 axios 实例，全项目所有接口请求都复用它，便于统一配置
const request = axios.create({
  // 基础路径：优先读取环境变量 VITE_API_BASE；
  // 未配置时回落到相对路径 '/api'，交给 Nginx 反代或 Vite devServer proxy 转发到后端
  baseURL: import.meta.env.VITE_API_BASE || '/api',
  // 请求超时时间 15 秒，避免请求悬挂导致页面一直转圈
  timeout: 15000,
});

// 允许自动重试的请求方法集合：只有 GET 是幂等的，重试不会产生副作用
const RETRY_METHODS = new Set(['get']);

// ===== 请求拦截器：为每个请求自动附加鉴权头 =====
request.interceptors.request.use((config) => {
  // 从 store 中同步取出当前登录 token（getState 不触发 React 渲染）
  const token = useUserStore.getState().token;
  // 存在 token 时，写入标准的 Bearer 认证头，供后端 JWT 中间件校验
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // 返回 config 让请求继续发出
  return config;
});

// ===== 响应拦截器：统一解包业务响应 / 统一处理错误 =====
request.interceptors.response.use(
  // ---- 成功分支（HTTP 2xx）----
  (res) => {
    // 后端约定响应体为 { code, message, data }，这里做解构
    const { code, message: msg, data } = res.data || {};
    // code === 0 表示业务成功，直接返回 data，调用方拿到的就是纯业务数据
    if (code === 0) {
      return data;
    }
    // 业务失败：弹出后端提示文案，没有则用兜底文案
    toast.error(msg || '请求失败');
    // 同时 reject，让调用方的 catch 分支能感知失败，避免静默吞错
    return Promise.reject(new Error(msg || '请求失败'));
  },
  // ---- 失败分支（非 2xx / 网络异常 / 超时）----
  async (err) => {
    // 取出出错请求的配置对象，用于读取自定义标记（如 __retried）
    const config = err.config || {};
    // HTTP 状态码；网络中断时不存在
    const status = err.response?.status;
    // 没有任何响应体 = 网络中断或超时，可视为可重试场景
    const noResponse = !err.response;
    // 请求方法转小写，便于与重试白名单比较
    const method = (config.method || '').toLowerCase();

    // 自动重试条件（四者同时满足）：
    // 1) 是 GET 这类幂等方法；2) 没有 HTTP 响应（非业务错误）；
    // 3) 确为网络中断或超时（ECONNABORTED）；4) 未重试过且未被显式禁止
    if (
      RETRY_METHODS.has(method) &&
      !status &&
      (noResponse || err.code === 'ECONNABORTED') &&
      !config.__retried &&
      !config.__noRetry
    ) {
      // 打上已重试标记，防止无限循环
      config.__retried = true;
      // 用同一份配置重新发起请求
      return request(config);
    }

    // 401：登录态失效，统一登出并跳转登录页
    if (status === 401) {
      // 清空本地 token 与用户信息
      useUserStore.getState().logout();
      // 提示用户原因
      toast.error('登录过期，请重新登录');
      // 已在登录页就不再重复跳转，避免刷新循环
      if (!window.location.pathname.startsWith('/login')) {
        window.location.replace('/login');
      }
    } else if (status === 429 || err.code === 'ECONNABORTED') {
      // 429 触发后端限流 / ECONNABORTED 请求超时：给出针对性提示
      toast.error(status === 429 ? '操作过于频繁，请稍后再试' : '请求超时，请检查网络后重试');
    } else {
      // 其余情况：优先用后端错误文案，兜底「网络异常」
      toast.error(err.response?.data?.message || '网络异常');
    }
    // 继续向上抛出错误，交由调用方决定是否补充处理
    return Promise.reject(err);
  },
);
// 导出实例，供各业务 api 模块引用
export default request;
