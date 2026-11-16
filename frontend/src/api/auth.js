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
export const getProfile = (data) => request.get('/auth/me'); // 发送GET请求到'/auth/me'端点获取用户资料
/**
 * 用户注册函数
 * @param {Object} data - 注册所需的数据对象
 * @returns {Promise} - 返回一个Promise对象，包含服务器响应结果
 */
export const register = (data) => request.post('/auth/register', data);
