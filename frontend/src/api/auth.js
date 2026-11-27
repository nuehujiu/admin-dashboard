// 复用统一配置的 axios 实例（已内置 token 注入与错误提示）
import request from './request';

/**
 * 登录
 * @param {{ username: string, password: string }} data - 账号密码
 * @returns {Promise<{ token: string, user: object }>} 登录成功后的 token 与用户信息
 */
export const login = (data) => request.post('/auth/login', data); // 提交账号密码，换取 JWT

/**
 * 获取当前登录用户的个人资料
 * 依赖后端从 Authorization 头解析出的用户身份
 * @returns {Promise<object>} 用户资料（昵称、手机号、邮箱、简介、头像等）
 */
export const getProfile = () => request.get('/auth/me'); // 通过 /auth/me 校验并取回当前用户信息

/**
 * 注册新账号（练习项目保留的接口，正式后台一般关闭自助注册）
 * @param {object} data - 注册表单数据
 * @returns {Promise<object>} 注册结果
 */
export const register = (data) => request.post('/auth/register', data); // 提交注册信息

/** 修改个人资料（昵称 / 手机号 / 邮箱 / 简介 / 头像地址） */
export const updateProfile = (data) => request.put('/auth/profile', data); // PUT 更新资料字段

/**
 * 上传头像
 * 传前端压缩后的 dataURL 字符串，后端落盘后返回 { avatar: '/uploads/avatars/xxx.jpg' }
 * 注意：这里传的是 base64 文本而非 multipart 文件，避免额外处理 FormData
 * @param {string} dataUrl - 压缩后的图片 dataURL
 * @returns {Promise<{ avatar: string }>} 可直接用于 <img src> 的访问路径
 */
export const uploadAvatar = (dataUrl) => request.post('/auth/avatar', { dataUrl });

/** 修改密码（需要同时提交当前密码与新密码，后端会校验旧密码） */
export const updatePassword = (data) => request.put('/auth/password', data); // 旧密码校验 + 新密码写入
