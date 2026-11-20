import request from './request';

/** 当前用户可见的通知（后端按角色权限派生） */
export const getNotifications = () => request.get('/notifications');
