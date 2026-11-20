import request from './request';

export const getSettings = () => request.get('/settings');

export const saveSettings = (data) => request.put('/settings', data);

export const resetSettings = () => request.post('/settings/reset');
