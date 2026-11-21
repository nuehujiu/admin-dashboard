import axios from 'axios';
import { toast } from '../utils/feedback';
import { useUserStore } from '../store/useUserStore';

const request = axios.create({
  // 由 .env.* 提供，未配置时回落到相对路径（交给 Nginx / proxy 转发）
  baseURL: import.meta.env.VITE_API_BASE || '/api',
  timeout: 15000,
});

// GET 请求在「网络错误 / 超时」时自动重试一次（幂等，安全）
const RETRY_METHODS = new Set(['get']);

request.interceptors.request.use((config) => {
  const token = useUserStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

request.interceptors.response.use(
  (res) => {
    const { code, message: msg, data } = res.data || {};
    if (code === 0) {
      return data;
    }
    toast.error(msg || '请求失败');
    return Promise.reject(new Error(msg || '请求失败'));
  },
  async (err) => {
    const config = err.config || {};
    const status = err.response?.status;
    const noResponse = !err.response; // 网络中断 / 超时
    const method = (config.method || '').toLowerCase();

    // 幂等请求的重试：既不碰 401（由下面对话处理），也不重试已重试过的请求
    if (
      RETRY_METHODS.has(method) &&
      !status &&
      (noResponse || err.code === 'ECONNABORTED') &&
      !config.__retried &&
      !config.__noRetry
    ) {
      config.__retried = true;
      return request(config);
    }

    if (status === 401) {
      useUserStore.getState().logout();
      toast.error('登录过期，请重新登录');
      if (!window.location.pathname.startsWith('/login')) {
        window.location.replace('/login');
      }
    } else if (status === 429 || err.code === 'ECONNABORTED') {
      toast.error(status === 429 ? '操作过于频繁，请稍后再试' : '请求超时，请检查网络后重试');
    } else {
      toast.error(err.response?.data?.message || '网络异常');
    }
    return Promise.reject(err);
  },
);
export default request;
