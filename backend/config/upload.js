/**
 * 头像文件存储
 *
 * 为什么不直接存 dataURL：
 *   users.avatar 是 TEXT，一条 128px 的 dataURL 也有十几 KB，
 *   每次 /me、用户列表、登录返回都要把它塞进 JSON，接口体积和 DB 行都白胖。
 *   现在改成「文件落盘 + DB 存 URL」，接口只返回 /uploads/avatars/xxx.jpg。
 *
 * 目录：{UPLOAD_DIR 或 backend/uploads}/avatars
 * 访问：GET /uploads/avatars/xxx.jpg（app.js 里 express.static 暴露）
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UPLOAD_ROOT = path.resolve(__dirname, '..', process.env.UPLOAD_DIR || 'uploads');
const AVATAR_DIR = path.join(UPLOAD_ROOT, 'avatars');
/** URL 前缀，DB 里存的就是它 + 文件名 */
const AVATAR_URL_PREFIX = '/uploads/avatars/';
/** 解码后最大 400KB（128px JPEG 约 10~20KB，留足余量） */
const MAX_BYTES = 400 * 1024;

/** 启动时确保目录存在（首次部署免手工建目录） */
function ensureAvatarDir() {
  fs.mkdirSync(AVATAR_DIR, { recursive: true });
  return AVATAR_DIR;
}

/** 根据文件头真实判断格式，不信任 dataURL 里声明的 MIME */
function sniffExt(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length >= 8 && buf.subarray(1, 4).toString('latin1') === 'PNG') return 'png';
  if (buf.length >= 6 && buf.subarray(0, 3).toString('latin1') === 'GIF') return 'gif';
  if (buf.length >= 12 && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return '';
}

/**
 * 保存前端压缩后的头像
 * @param {number} userId
 * @param {string} dataUrl data:image/jpeg;base64,....
 * @returns {{ url: string, filename: string }}
 */
function saveAvatarFromDataUrl(userId, dataUrl) {
  const m = /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl || ''));
  if (!m) {
    const err = new Error('头像格式不支持，请重新选择图片');
    err.status = 400;
    throw err;
  }
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length) {
    const err = new Error('头像内容为空');
    err.status = 400;
    throw err;
  }
  if (buf.length > MAX_BYTES) {
    const err = new Error('头像文件过大，请重新选择');
    err.status = 400;
    throw err;
  }
  const ext = sniffExt(buf);
  if (!ext) {
    const err = new Error('头像不是有效的图片文件');
    err.status = 400;
    throw err;
  }

  ensureAvatarDir();
  // 文件名随机，避免同用户连点覆盖与浏览器缓存拿到旧图
  const filename = `u${userId}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(AVATAR_DIR, filename), buf);
  return { url: `${AVATAR_URL_PREFIX}${filename}`, filename };
}

/**
 * 删除本系统上传的头像文件（旧 dataURL / 外链一律忽略，只删自己目录下的）
 * 失败不抛错：文件丢了不该影响资料保存
 */
function removeAvatarByUrl(url) {
  const v = String(url || '');
  if (!v.startsWith(AVATAR_URL_PREFIX)) return;
  const name = path.basename(v);
  // 防目录穿越：只允许安全文件名
  if (!/^u\d+-[a-z0-9-]+\.(jpg|png|gif|webp)$/.test(name)) return;
  const full = path.join(AVATAR_DIR, name);
  fs.promises.unlink(full).catch(() => {});
}

module.exports = {
  AVATAR_URL_PREFIX,
  AVATAR_DIR,
  ensureAvatarDir,
  saveAvatarFromDataUrl,
  removeAvatarByUrl,
};
