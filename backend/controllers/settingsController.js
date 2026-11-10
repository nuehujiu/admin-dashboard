/**
 * 系统设置控制器
 * 存储方式：settings(key, value) 键值表，GET 合并默认值后返回一个对象
 */
const { query } = require('../config/db');
const { success, fail } = require('../utils/response');

/** 默认值（也是字段白名单） */
const DEFAULTS = {
  systemName: '电商后台管理系统',
  slogan: '用数据驱动每一次增长',
  notice: '',
  themeColor: '#F5611D',
  siderCollapsed: 0,
};

const ALLOWED_KEYS = Object.keys(DEFAULTS);

/** 校验单个字段，返回 { ok, value } 或 { ok:false, message } */
function validate(key, raw) {
  switch (key) {
    case 'systemName': {
      const v = String(raw ?? '').trim();
      if (!v) return { ok: false, message: '系统名称不能为空' };
      if (v.length > 30) return { ok: false, message: '系统名称不能超过 30 个字' };
      return { ok: true, value: v };
    }
    case 'slogan': {
      const v = String(raw ?? '');
      if (v.length > 50) return { ok: false, message: '标语不能超过 50 个字' };
      return { ok: true, value: v };
    }
    case 'notice': {
      const v = String(raw ?? '');
      if (v.length > 200) return { ok: false, message: '公告不能超过 200 个字' };
      return { ok: true, value: v };
    }
    case 'themeColor': {
      const v = String(raw ?? '').trim();
      if (!/^#[0-9a-fA-F]{6}$/.test(v)) return { ok: false, message: '主题色必须是 #RRGGBB 格式' };
      return { ok: true, value: v.toUpperCase() };
    }
    case 'siderCollapsed': {
      const n = Number(raw);
      if (n !== 0 && n !== 1) return { ok: false, message: 'siderCollapsed 只能为 0 或 1' };
      return { ok: true, value: n };
    }
    default:
      return { ok: false, message: `不支持的设置项: ${key}` };
  }
}

/** 读库并合并默认值，数字型字段转回 number */
async function readSettings() {
  const rows = await query('SELECT `key`, `value` FROM settings');
  const stored = {};
  for (const r of rows) stored[r.key] = r.value;

  const result = {};
  for (const key of ALLOWED_KEYS) {
    if (stored[key] === undefined) {
      result[key] = DEFAULTS[key];
    } else if (key === 'siderCollapsed') {
      result[key] = Number(stored[key]);
    } else {
      result[key] = stored[key];
    }
  }
  return result;
}

/** 读取全部设置 */
async function getAll(req, res, next) {
  try {
    return success(res, await readSettings());
  } catch (err) {
    next(err);
  }
}

/** 保存设置（支持部分字段） */
async function save(req, res, next) {
  try {
    const body = req.body || {};
    const entries = Object.entries(body).filter(([, v]) => v !== undefined);

    if (!entries.length) {
      return fail(res, '没有可保存的设置项');
    }

    const valid = [];
    for (const [key, value] of entries) {
      if (!ALLOWED_KEYS.includes(key)) {
        return fail(res, `不支持的设置项: ${key}`);
      }
      const r = validate(key, value);
      if (!r.ok) return fail(res, r.message);
      valid.push([key, String(r.value)]);
    }

    for (const [key, value] of valid) {
      await query(
        'INSERT INTO settings (`key`, `value`) VALUES (?,?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
        [key, value]
      );
    }

    return success(res, await readSettings(), '保存成功');
  } catch (err) {
    next(err);
  }
}

/** 恢复默认设置 */
async function reset(req, res, next) {
  try {
    await query('DELETE FROM settings');
    return success(res, await readSettings(), '已恢复默认设置');
  } catch (err) {
    next(err);
  }
}

module.exports = { getAll, save, reset };
