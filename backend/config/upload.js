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
// 文件系统（同步写、异步删）
const fs = require('fs');
// 路径拼接与 basename
const path = require('path');
// 生成随机文件名
const crypto = require('crypto');

// 上传根目录：相对 backend 目录解析，可用 UPLOAD_DIR 改到别处（如挂载盘）
const UPLOAD_ROOT = path.resolve(__dirname, '..', process.env.UPLOAD_DIR || 'uploads');
// 头像子目录
const AVATAR_DIR = path.join(UPLOAD_ROOT, 'avatars');
/** URL 前缀，DB 里存的就是它 + 文件名 */
const AVATAR_URL_PREFIX = '/uploads/avatars/';
/** 解码后最大 400KB（128px JPEG 约 10~20KB，留足余量） */
const MAX_BYTES = 400 * 1024;

/** 启动时确保目录存在（首次部署免手工建目录） */
function ensureAvatarDir() {
  // recursive 相当于 mkdir -p，父目录缺失也会一并创建
  fs.mkdirSync(AVATAR_DIR, { recursive: true });
  return AVATAR_DIR;
}

/**
 * 根据文件头真实判断格式，不信任 dataURL 里声明的 MIME
 * @param {Buffer} buf - 文件二进制
 * @returns {'jpg'|'png'|'gif'|'webp'|''} 识别失败返回空串
 */
function sniffExt(buf) {
  // JPEG 魔数：FF D8 FF
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  // PNG：第 1~3 字节为 "PNG"（0x89 P N G）
  if (buf.length >= 8 && buf.subarray(1, 4).toString('latin1') === 'PNG') return 'png';
  // GIF：开头 "GIF"
  if (buf.length >= 6 && buf.subarray(0, 3).toString('latin1') === 'GIF') return 'gif';
  // WebP：第 8~11 字节为 "WEBP"
  if (buf.length >= 12 && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  // 都不是 → 不是合法图片
  return '';
}

/**
 * 保存前端压缩后的头像
 * @param {number} userId
 * @param {string} dataUrl data:image/jpeg;base64,....
 * @returns {{ url: string, filename: string }}
 */
function saveAvatarFromDataUrl(userId, dataUrl) {
  // 严格匹配 dataURL 结构：限定图片类型 + base64 字符集
  const m = /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl || ''));
  if (!m) {
    // 格式不符 → 400（errorHandler 会把它当业务错误返回）
    const err = new Error('头像格式不支持，请重新选择图片');
    err.status = 400;
    throw err;
  }
  // base64 解码成二进制
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length) {
    const err = new Error('头像内容为空');
    err.status = 400;
    throw err;
  }
  // 体积上限校验
  if (buf.length > MAX_BYTES) {
    const err = new Error('头像文件过大，请重新选择');
    err.status = 400;
    throw err;
  }
  // 以真实文件头判定扩展名
  const ext = sniffExt(buf);
  if (!ext) {
    const err = new Error('头像不是有效的图片文件');
    err.status = 400;
    throw err;
  }

  // 兜底建目录（防止运行期间目录被删）
  ensureAvatarDir();
  // 文件名随机，避免同用户连点覆盖与浏览器缓存拿到旧图
  const filename = `u${userId}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
  // 同步写盘：头像很小，且必须在返回 URL 前完成
  fs.writeFileSync(path.join(AVATAR_DIR, filename), buf);
  // 返回可直接访问的相对 URL 与文件名
  return { url: `${AVATAR_URL_PREFIX}${filename}`, filename };
}

/**
 * 删除本系统上传的头像文件（旧 dataURL / 外链一律忽略，只删自己目录下的）
 * 失败不抛错：文件丢了不该影响资料保存
 */
function removeAvatarByUrl(url) {
  const v = String(url || '');
  // 非本系统目录的地址直接忽略（比如历史 dataURL 或第三方外链）
  if (!v.startsWith(AVATAR_URL_PREFIX)) return;
  // 只取文件名，去掉可能的路径片段
  const name = path.basename(v);
  // 防目录穿越：只允许安全文件名
  if (!/^u\d+-[a-z0-9-]+\.(jpg|png|gif|webp)$/.test(name)) return;
  const full = path.join(AVATAR_DIR, name);
  // 异步删除，catch 吞掉 ENOENT 等错误
  fs.promises.unlink(full).catch(() => {});
}

// 导出目录常量与两个操作函数，供 authController 使用
module.exports = {
  AVATAR_URL_PREFIX,
  AVATAR_DIR,
  ensureAvatarDir,
  saveAvatarFromDataUrl,
  removeAvatarByUrl,
};
