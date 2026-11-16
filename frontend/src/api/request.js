import axios from 'axios';
import { message } from 'antd';
import { useUserStore } from '../store/useUserStore';

const request = axios.create({
  baseURL: '/api',
  timeout: 5000,
});

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
    message.error(msg || '请求失败');
    return Promise.reject(new Error(msg || '请求失败'));
  },
  (err) => {
    const status = err.response?.status;
    if (status === 401) {
      useUserStore.getState().logout();
      message.error('登录过期，请重新登录');
      if (!window.location.pathname.startsWith('/login')) {
        window.location.replace('/login');
      }
    } else {
      message.error(err.response?.data?.message || '网络异常');
    }
    return Promise.reject(err);
  },
);
export default request;
