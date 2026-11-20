import request from './request';

/**
 * 登录功能函数
 * @param {Object} data - 登录所需的数据，通常包含用户名和密码等信息
 * @returns {Promise} - 返回一个Promise对象，包含登录请求的结果
 */

export const login = (data) => request.post('/auth/login', data); // 发送POST请求到登录接口，并传入登录数据
/**
 * 获取用户个人资料信息
 * @param {Object} data - 请求数据对象
 * @returns {Promise} 返回一个Promise对象，包含服务器响应的用户个人资料信息
 */
export const getProfile = () => request.get('/auth/me'); // 发送GET请求到'/auth/me'端点获取用户资料
/**
 * 用户注册函数
 * @param {Object} data - 注册所需的数据对象
 * @returns {Promise} - 返回一个Promise对象，包含服务器响应结果
 */
export const register = (data) => request.post('/auth/register', data);

/** 修改个人资料（昵称 / 手机号 / 邮箱 / 简介 / 头像） */
export const updateProfile = (data) => request.put('/auth/profile', data);

/** 修改密码（当前密码 + 新密码） */
export const updatePassword = (data) => request.put('/auth/password', data);
